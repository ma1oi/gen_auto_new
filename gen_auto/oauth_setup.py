import os

from google_auth_oauthlib.flow import InstalledAppFlow

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLIENT_SECRET_PATH = os.path.join(BASE_DIR, "oauth-client-secret.json")
TOKEN_PATH = os.path.join(BASE_DIR, "google-token.json")
SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]


def main():
    if not os.path.isfile(CLIENT_SECRET_PATH):
        raise SystemExit(
            f"Не найден {CLIENT_SECRET_PATH}. Скачайте OAuth client ID (Desktop app) "
            "из Google Cloud Console и сохраните его под этим именем."
        )

    flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_PATH, SCOPES)
    creds = flow.run_local_server(port=0)

    with open(TOKEN_PATH, "w", encoding="utf-8") as f:
        f.write(creds.to_json())

    print(f"Готово. Токен сохранён в {TOKEN_PATH}")


if __name__ == "__main__":
    main()
