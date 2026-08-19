import os
import urllib.parse
import warnings

# these deps warn on import (urllib3/LibreSSL, google-auth/py3.9-eol) — harmless,
# but deploy.py's caller treats any stderr output as a deploy error, so suppress.
warnings.filterwarnings("ignore")

import requests
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

SPREADSHEET_ID = "1E-z7NNtG8Y1CKvQvOKOjYfV3w4Ef4JQQbtKwjFeruWc"
TOKEN_PATH = os.environ.get(
    "GOOGLE_SHEETS_TOKEN",
    os.path.join(BASE_DIR, "google-token.json"),
)
SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

_google_creds = None
_sheet_titles_cache = None
_creds_cache_by_group = {}


def _get_access_token():
    # Refresh-токен, который пользователь подключил в /settings ("Подключить
    # Google") — приходит из Next.js как env-переменная (см.
    # server-for-domain/route.ts, deploy/route.ts), получен там через
    # Authorization Code флоу (/api/auth/google/callback). Живёт долго (не
    # истекает по таймеру, в отличие от access-токена), поэтому на каждый
    # вызов просто обмениваем его на свежий access-токен.
    env_refresh_token = os.environ.get("GOOGLE_SHEETS_REFRESH_TOKEN")
    if env_refresh_token:
        creds = Credentials(
            None,
            refresh_token=env_refresh_token,
            client_id=os.environ.get("GOOGLE_OAUTH_CLIENT_ID", ""),
            client_secret=os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", ""),
            token_uri="https://oauth2.googleapis.com/token",
            scopes=SCOPES,
        )
        creds.refresh(GoogleAuthRequest())
        return creds.token

    global _google_creds
    if not os.path.isfile(TOKEN_PATH):
        raise RuntimeError(
            f"Не найден токен Google: {TOKEN_PATH}. "
            "Запустите один раз `python3 oauth_setup.py` — откроется браузер "
            "для входа в аккаунт, у которого уже есть доступ к таблице."
        )
    if _google_creds is None:
        _google_creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)
    if not _google_creds.valid:
        _google_creds.refresh(GoogleAuthRequest())
        with open(TOKEN_PATH, "w", encoding="utf-8") as f:
            f.write(_google_creds.to_json())
    return _google_creds.token


def _list_sheet_titles():
    global _sheet_titles_cache
    if _sheet_titles_cache is not None:
        return _sheet_titles_cache
    token = _get_access_token()
    resp = requests.get(
        f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}",
        params={"fields": "sheets.properties"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    titles = [s["properties"]["title"] for s in data.get("sheets", [])]
    _sheet_titles_cache = titles
    return titles


def _fetch_sheet_values(title):
    token = _get_access_token()
    encoded_title = urllib.parse.quote(title, safe="")
    resp = requests.get(
        f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/{encoded_title}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=20,
    )
    resp.raise_for_status()
    return resp.json().get("values", [])


def _parse_creds_rows(rows):
    creds = {}
    if not rows:
        return creds
    header = rows[0]

    def col(name):
        for i, h in enumerate(header):
            if h.strip() == name:
                return i
        return -1

    i_domain = col("Домен")
    i_ip = col("IP сервера")
    i_login = col("Логин")
    i_pass = col("НОВЫЙ ПАРОЛЬ") if col("НОВЫЙ ПАРОЛЬ") != -1 else col("Пароль")
    if -1 in (i_domain, i_ip, i_login, i_pass):
        return creds

    for row in rows[1:]:
        def get(i):
            return row[i].strip() if 0 <= i < len(row) else ""

        domain = get(i_domain).lower()
        ip = get(i_ip)
        login = get(i_login)
        password = get(i_pass)
        if domain and ip and login and password:
            creds[domain] = {"ip": ip, "login": login, "password": password}
    return creds


def _surname(title):
    return title.split(" (")[0].strip()


def _group_titles_by_surname(titles):
    groups = {}
    for title in titles:
        groups.setdefault(_surname(title), []).append(title)
    return groups


def _find_surname_in_text(text, surnames):
    if not text:
        return None
    lowered = text.lower()
    for surname in surnames:
        if surname.lower() in lowered:
            return surname
    return None


def get_credentials_for_summary(summary_text):
    """domain -> {ip, login, password} for the sheet(s) whose surname is
    mentioned in summary_text (e.g. task title), across all sheet variants
    for that surname ("общий", "ПОЛЬША" и т.п.). Falls back to the first
    sheet in the spreadsheet if no surname is found."""
    titles = _list_sheet_titles()
    if not titles:
        return {}

    groups = _group_titles_by_surname(titles)
    surname = _find_surname_in_text(summary_text, groups.keys())
    if surname:
        target_titles = groups[surname]
        cache_key = surname
    else:
        target_titles = [titles[0]]
        cache_key = "__first__"

    if cache_key in _creds_cache_by_group:
        return _creds_cache_by_group[cache_key]

    merged = {}
    for title in target_titles:
        merged.update(_parse_creds_rows(_fetch_sheet_values(title)))
    _creds_cache_by_group[cache_key] = merged
    return merged


def find_domain(domain):
    """{ip, login, password} for a domain, searching every sheet in the
    spreadsheet (not just one surname's group). Used when the only thing
    known is the domain itself, e.g. from the Jira transition screen."""
    domain = (domain or "").strip().lower()
    if not domain:
        return None
    for title in _list_sheet_titles():
        creds = _parse_creds_rows(_fetch_sheet_values(title))
        if domain in creds:
            return creds[domain]
    return None
