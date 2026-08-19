import os
import stat
import sys
import zipfile

import paramiko

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKUPS_DIR = os.path.join(BASE_DIR, "downloads", "manual-backups")


def log(msg):
    print(msg, flush=True)


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
        # служебные файлы (.manual-meta.json, .yadisk-uploaded.json, .DS_Store
        # и т.п.) — не часть сайта, на сервер не грузим
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
            log(f"    загружен: {remote_path}")


def sftp_download_tree(sftp, remote_dir, local_dir):
    os.makedirs(local_dir, exist_ok=True)
    for item in sftp.listdir_attr(remote_dir):
        remote_path = remote_dir + "/" + item.filename
        local_path = os.path.join(local_dir, item.filename)
        if stat.S_ISDIR(item.st_mode):
            sftp_download_tree(sftp, remote_path, local_path)
        else:
            sftp.get(remote_path, local_path)


def zip_dir(src_dir, zip_path, arc_root_name):
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _dirs, files in os.walk(src_dir):
            for f in files:
                full = os.path.join(root, f)
                rel = os.path.relpath(full, src_dir)
                zf.write(full, os.path.join(arc_root_name, rel))


def deploy_one(sftp, staged_dir, name, mode):
    local_src = os.path.join(staged_dir, name)
    remote_path = f"/var/www/{name}"

    if not os.path.isdir(local_src):
        log(f"[ERR] {name}: нет в загруженных файлах")
        return False

    try:
        existing = sftp.listdir(remote_path)
        exists = True
    except FileNotFoundError:
        existing = []
        exists = False

    if exists and mode == "backup":
        log(f"  {name}: на сервере уже есть, делаю бэкап...")
        os.makedirs(BACKUPS_DIR, exist_ok=True)
        tmp_download_dir = os.path.join(BACKUPS_DIR, f"{name}.old")
        try:
            sftp_download_tree(sftp, remote_path, tmp_download_dir)
            zip_path = os.path.join(BACKUPS_DIR, f"{name}.old.zip")
            zip_dir(tmp_download_dir, zip_path, f"{name}.old")
            log(f"  ✓ бэкап сохранён: {zip_path}")
        finally:
            if os.path.isdir(tmp_download_dir):
                import shutil
                shutil.rmtree(tmp_download_dir)

    if exists:
        if existing:
            log(f"  {name}: сношу старое содержимое на сервере...")
        sftp_rmtree(sftp, remote_path)
    else:
        sftp.mkdir(remote_path)

    log(f"  {name}: загружаю файлы...")
    sftp_upload_tree(sftp, local_src, remote_path)
    log(f"[OK] {name}")
    return True


def main():
    if len(sys.argv) < 4:
        log("usage: manual_upload_deploy.py <ip> <staged_dir> <name:mode> [name:mode ...]")
        sys.exit(1)

    ip = sys.argv[1]
    staged_dir = sys.argv[2]
    items = []
    for arg in sys.argv[3:]:
        name, _, mode = arg.rpartition(":")
        if not name or mode not in ("overwrite", "backup"):
            log(f"[!] пропускаю некорректный аргумент: {arg}")
            continue
        items.append((name, mode))

    login = os.environ.get("SERVER_LOGIN", "")
    password = os.environ.get("SERVER_PASSWORD", "")
    if not login or not password:
        log("[ERR] нет доступов к серверу — заполните Сервер в настройках")
        sys.exit(1)

    log(f"Подключаюсь к {ip}...")
    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(ip, username=login, password=password, look_for_keys=False, allow_agent=False, timeout=15)
        sftp = client.open_sftp()
    except Exception as e:
        log(f"[ERR] не удалось подключиться к {ip}: {e}")
        sys.exit(1)

    ok_count = 0
    for name, mode in items:
        try:
            if deploy_one(sftp, staged_dir, name, mode):
                ok_count += 1
        except Exception as e:
            log(f"[ERR] {name}: {e}")

    sftp.close()
    client.close()
    log(f"\nГотово: {ok_count}/{len(items)}")


if __name__ == "__main__":
    main()
