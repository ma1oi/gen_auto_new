import json
import os
import sys

import paramiko


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "usage: manual_upload_check.py <ip> <name1> [name2 ...]"}))
        return

    ip = sys.argv[1]
    names = sys.argv[2:]
    login = os.environ.get("SERVER_LOGIN", "")
    password = os.environ.get("SERVER_PASSWORD", "")

    if not login or not password:
        print(json.dumps({"error": "нет доступов к серверу — заполните Сервер в настройках"}))
        return

    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(ip, username=login, password=password, look_for_keys=False, allow_agent=False, timeout=15)
        sftp = client.open_sftp()
    except Exception as e:
        print(json.dumps({"error": f"не удалось подключиться к {ip}: {e}"}))
        return

    results = {}
    for name in names:
        remote_path = f"/var/www/{name}"
        try:
            # папка сама по себе — не конфликт, если она пустая (нет ни
            # одного файла/подпапки внутри); конфликт только когда там
            # реально что-то лежит
            entries = sftp.listdir(remote_path)
            results[name] = len(entries) > 0
        except FileNotFoundError:
            results[name] = False
        except Exception as e:
            results[name] = {"error": str(e)}

    sftp.close()
    client.close()
    print(json.dumps({"results": results}))


if __name__ == "__main__":
    main()
