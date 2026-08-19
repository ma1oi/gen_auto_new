import json
import os
import re
import stat
import time
import urllib.request

import paramiko

import db
import sheets_credentials

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


DOWNLOADS_DIR = os.path.join(BASE_DIR, "downloads")


def _from_env_or_config(env_name, config_key):
    if os.environ.get(env_name):
        return os.environ[env_name]
    # config.js — необязательный фолбэк (там раньше лежали реальные куки, из
    # git убран); значения теперь и так приходят через env per-user, поэтому
    # отсутствие файла не должно ронять деплой целиком
    try:
        with open(os.path.join(BASE_DIR, "config.js"), encoding="utf-8") as f:
            content = f.read()
    except FileNotFoundError:
        return ""
    m = re.search(config_key + r':\s*["\']([^"\']+)["\']', content)
    return m.group(1) if m else ""


def get_jira_user():
    return _from_env_or_config("JIRA_USER", "JIRA_USER")


def get_jira_cookie():
    return _from_env_or_config("JIRA_COOKIE", "JIRA_COOKIE")


def fetch_jira_issue(key, jira_user, jira_cookie):
    """Fetches the Jira xboard issue-details payload, the same one the
    preview screen uses — gives us both the description (for deploy-type
    detection) and the summary/title (for surname-based sheet matching)."""
    url = (
        "https://jira.lucky-team.pro/rest/greenhopper/1.0/xboard/issue/details.json"
        f"?rapidViewId=520&issueIdOrKey={key}&loadSubtasks=true&_={int(time.time() * 1000)}"
    )
    req = urllib.request.Request(url, headers={
        "accept": "application/json, text/javascript, */*; q=0.01",
        "x-ausername": jira_user,
        "x-requested-with": "XMLHttpRequest",
        "cookie": jira_cookie,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _editable_field(issue_data, field_id):
    default_tabs = (issue_data.get("tabs") or {}).get("defaultTabs") or []
    tab1 = default_tabs[1] if len(default_tabs) > 1 else {}
    editable_fields = (tab1 or {}).get("inlineEditableFields") or []
    return next((f for f in editable_fields if f.get("id") == field_id), None)


def extract_description(issue_data):
    field = _editable_field(issue_data, "description")
    edit_html = (field or {}).get("editHtml") or ""
    m = re.search(r"<textarea[^>]*>([\s\S]*?)</textarea>", edit_html)
    return m.group(1) if m else ""


def extract_summary(issue_data):
    field = _editable_field(issue_data, "summary")
    edit_html = (field or {}).get("editHtml") or ""
    m = re.search(r'id="summary"[^>]*value="([^"]*)"', edit_html)
    return m.group(1) if m else ""


def classify_deploy_type(issue_data):
    """Fallback for tasks whose deploy_type was never classified (e.g. rows that
    predate this column, or were registered without going through the normal
    preview/generate flow) — check the Jira description for a bare server IP,
    same rule the preview screen uses."""
    ip_match = re.search(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", extract_description(issue_data))
    if ip_match:
        return "ip", ip_match.group(0)
    return "csv", None


def find_gen_dirs():
    """Все генератор_DD-MM-YYYY папки, от самой свежей к самой старой."""
    import re
    dirs = []
    for name in os.listdir(BASE_DIR):
        m = re.match(r"генератор_(\d{2})-(\d{2})-(\d{4})$", name)
        if m and os.path.isdir(os.path.join(BASE_DIR, name)):
            dirs.append((int(m.group(3)), int(m.group(2)), int(m.group(1)), name))
    dirs.sort(reverse=True)
    return [os.path.join(BASE_DIR, name) for *_, name in dirs]


def find_latest_gen_dir():
    dirs = find_gen_dirs()
    return dirs[0] if dirs else None


def find_folder(task_key):
    # Задача могла быть скачана не сегодня — если после этого скачивали
    # что-то ещё, появится более свежая генератор_DATE-папка, и старая
    # перестанет быть "последней". Поэтому ищем по всем папкам, а не только
    # по самой свежей (см. историю: "WPROMO-95475: нет папки" при том, что
    # wpromo-95475/ реально лежала на диске — просто не в последней по дате).
    for gen_dir in find_gen_dirs():
        for variant in [task_key, task_key.lower()]:
            path = os.path.join(gen_dir, variant)
            if os.path.isdir(path):
                return path
    return None


def sftp_rmtree(sftp, remote_path):
    for item in sftp.listdir_attr(remote_path):
        item_path = remote_path + "/" + item.filename
        if stat.S_ISDIR(item.st_mode):
            sftp_rmtree(sftp, item_path)
            sftp.rmdir(item_path)
        else:
            sftp.remove(item_path)


def sftp_upload_tree(sftp, local_dir, remote_dir):
    for name in os.listdir(local_dir):
        # служебные файлы (.DS_Store и т.п.) — не часть сайта, на сервер не грузим
        if name.startswith("."):
            continue
        local_path = os.path.join(local_dir, name)
        remote_path = remote_dir + "/" + name
        if os.path.isdir(local_path):
            try:
                sftp.mkdir(remote_path)
            except OSError:
                pass
            sftp_upload_tree(sftp, local_path, remote_path)
        else:
            sftp.put(local_path, remote_path)
            print(f"    загружен: {name}")


def deploy_csv(task_key, domain, ip, login, password):
    local_dir = find_folder(task_key)
    if not local_dir:
        print(f"  [!] Папка не найдена: {task_key} — пропуск")
        return False, None

    force = db.needs_force_redeploy(task_key)

    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(ip, username=login, password=password, look_for_keys=False, allow_agent=False)
        sftp = client.open_sftp()

        home_entries = [e for e in sftp.listdir("/home") if not e.startswith(".")]
        if len(home_entries) != 1:
            print(f"  [!] Неожиданное содержимое /home: {home_entries} — пропуск")
            sftp.close()
            client.close()
            return False, None

        home_user = home_entries[0]
        public_html = f"/home/{home_user}/web/{domain}/public_html"

        existing = sftp.listdir(public_html)
        if existing:
            if len(existing) <= 2 or force:
                if force and len(existing) > 2:
                    print(f"  [i] {domain}: перегенерация — сношу старую версию сайта ({len(existing)} файлов/папок)")
                sftp_rmtree(sftp, public_html)
            else:
                sftp.close()
                client.close()
                print(f"  [SKIP] {domain}: на сервере уже есть сайт ({len(existing)} файлов/папок)")
                return False, "already_exists"

        print(f"  Загрузка файлов ...")
        sftp_upload_tree(sftp, local_dir, public_html)

        sftp.close()
        client.close()
        print(f"  [OK] {domain}")
        return True, None

    except Exception as e:
        print(f"  [ERR] {domain}: {e}")
        return False, None


def deploy_ip(task_key, domain, ip, login, password):
    local_dir = find_folder(task_key)
    if not local_dir:
        print(f"  [!] Папка не найдена: {task_key} — пропуск")
        return False, None

    force = db.needs_force_redeploy(task_key)

    remote_dir = f"/var/www/{domain}"
    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(ip, username=login, password=password, look_for_keys=False, allow_agent=False)
        sftp = client.open_sftp()

        try:
            existing = sftp.listdir(remote_dir)
        except FileNotFoundError:
            print(f"  [i] {domain}: папка {remote_dir} не найдена на сервере {ip} — создаю")
            sftp.mkdir(remote_dir)
            existing = []

        if existing:
            if len(existing) <= 2 or force:
                if force and len(existing) > 2:
                    print(f"  [i] {domain}: перегенерация — сношу старую версию сайта ({len(existing)} файлов/папок)")
                sftp_rmtree(sftp, remote_dir)
            else:
                sftp.close()
                client.close()
                print(f"  [SKIP] {domain}: на сервере уже есть сайт ({len(existing)} файлов/папок)")
                return False, "already_exists"

        print(f"  Загрузка файлов ...")
        sftp_upload_tree(sftp, local_dir, remote_dir)

        sftp.close()
        client.close()
        print(f"  [OK] {domain}")
        return True, None

    except Exception as e:
        print(f"  [ERR] {domain}: {e}")
        return False, "error"


def main():
    jira_user = get_jira_user()
    jira_cookie = get_jira_cookie()
    task_keys = db.get_created_keys(jira_user)
    server_login = os.environ.get("SERVER_LOGIN", "")
    server_password = os.environ.get("SERVER_PASSWORD", "")

    queue = []
    skipped = []

    for key in task_keys:
        domain = db.get_domain(key.upper()) or db.get_domain(key)
        if domain:
            domain = domain.lower()
        if db.is_deployed(key):
            skipped.append((key, f"уже задеплоен ({domain})"))
            continue
        if not domain:
            skipped.append((key, "нет домена в БД"))
            continue
        if not find_folder(key):
            skipped.append((key, f"нет папки {key}"))
            continue

        deploy_type = db.get_deploy_type(key)
        issue_data = None
        if not deploy_type:
            try:
                issue_data = fetch_jira_issue(key, jira_user, jira_cookie)
                deploy_type, detected_ip = classify_deploy_type(issue_data)
                db.set_deploy_meta(key, deploy_type, detected_ip)
                print(f"  [i] {key}: тип деплоя определён из описания Jira — {deploy_type}"
                      + (f" ({detected_ip})" if detected_ip else ""))
            except Exception as e:
                print(f"  [!] {key}: не удалось определить тип деплоя из Jira ({e}), считаем таблицей")
                deploy_type = "csv"

        if deploy_type == "ip":
            server_ip = db.get_server_ip(key)
            if not server_ip:
                skipped.append((key, "нет IP сервера в БД"))
                continue
            if not server_login or not server_password:
                skipped.append((key, "нет универсальных доступов, заполните Сервер в настройках"))
                continue
            queue.append((key, domain, server_ip, server_login, server_password, "ip"))
        else:
            try:
                if issue_data is None:
                    issue_data = fetch_jira_issue(key, jira_user, jira_cookie)
                summary = extract_summary(issue_data)
            except Exception as e:
                print(f"  [!] {key}: не удалось получить тему задачи из Jira ({e}), беру первый доступный лист")
                summary = ""

            try:
                creds = sheets_credentials.get_credentials_for_summary(summary)
            except Exception as e:
                skipped.append((key, f"ошибка доступа к Google Таблице: {e}"))
                continue

            c = creds.get(domain.lower())
            if not c:
                skipped.append((key, f"нет кредсов для {domain}"))
                continue
            queue.append((key, domain, c["ip"], c["login"], c["password"], "csv"))

    print(">>> DEPLOY_QUEUE " + json.dumps([
        {"key": key, "domain": domain, "type": dtype, "server": ip}
        for key, domain, ip, _login, _password, dtype in queue
    ]))

    if skipped:
        print(f"Пропущены ({len(skipped)}):")
        for key, reason in skipped:
            print(f"  {key}: {reason}")
        print()

    total = len(queue)
    print(f"К деплою: {total} сайтов\n")

    already_exists = []
    for key, domain, ip, login, password, dtype in queue:
        print(f"→ {domain}")
        print(">>> DEPLOY_STATUS " + json.dumps({"key": key, "domain": domain, "status": "running", "server": ip}))
        deploy_fn = deploy_ip if dtype == "ip" else deploy_csv
        ok, reason = deploy_fn(key, domain, ip, login, password)
        if ok:
            db.mark_deployed(key)
            print(">>> DEPLOY_STATUS " + json.dumps({"key": key, "domain": domain, "status": "ok", "server": ip}))
        elif reason == "already_exists":
            already_exists.append(domain)
            print(">>> DEPLOY_STATUS " + json.dumps({
                "key": key, "domain": domain, "status": "skip", "reason": "на сервере уже есть сайт", "server": ip
            }))
        else:
            print(">>> DEPLOY_STATUS " + json.dumps({
                "key": key, "domain": domain, "status": "error", "reason": str(reason) if reason else "ошибка деплоя", "server": ip
            }))

    if already_exists:
        print(f"\n  Не задеплоены (на сервере уже есть сайт):")
        for d in already_exists:
            print(f"    - {d}")

    print(f"\nВсе {total} сайтов обработаны.")


if __name__ == "__main__":
    main()
