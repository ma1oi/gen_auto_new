export interface RequestCredentials {
  jiraCookie: string;
  jiraUser: string;
  whitegenCookie: string;
  whitegenAuth: string;
  serverLogin: string;
  serverPassword: string;
  yandexDiskToken: string;
  googleSheetsRefreshToken: string;
}

// Whitegen's Bearer token is just its cookie's auth_token value (URL-decoded),
// prefixed with "Bearer " — no need to store/send it separately.
function deriveWhitegenAuth(whitegenCookie: string): string {
  const m = whitegenCookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
  if (!m) return "";
  return `Bearer ${decodeURIComponent(m[1])}`;
}

export function getCredentials(request: Request): RequestCredentials {
  const whitegenCookie = request.headers.get("x-whitegen-cookie") ?? "";
  return {
    jiraCookie: request.headers.get("x-jira-cookie") ?? "",
    jiraUser: request.headers.get("x-jira-user") ?? "",
    whitegenCookie,
    whitegenAuth: deriveWhitegenAuth(whitegenCookie),
    serverLogin: request.headers.get("x-server-login") ?? "",
    serverPassword: request.headers.get("x-server-password") ?? "",
    yandexDiskToken: request.headers.get("x-yandex-disk-token") ?? "",
    googleSheetsRefreshToken: request.headers.get("x-google-sheets-refresh-token") ?? "",
  };
}
