import json
import sys

import sheets_credentials


def main():
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        print(json.dumps({"found": False, "error": "domain arg missing"}))
        return

    domain = sys.argv[1].strip()
    try:
        creds = sheets_credentials.find_domain(domain)
    except Exception as e:
        print(json.dumps({"found": False, "error": str(e)}))
        return

    if not creds:
        print(json.dumps({"found": False, "domain": domain}))
        return

    print(json.dumps({"found": True, "domain": domain, "ip": creds["ip"]}))


if __name__ == "__main__":
    main()
