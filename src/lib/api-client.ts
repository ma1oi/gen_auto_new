import { useSettingsStore } from "@/store/settings.store";

export function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const {
    jiraCookie, jiraUser, whitegenCookie, serverLogin, serverPassword, yandexDiskToken,
    googleSheetsRefreshToken,
  } = useSettingsStore.getState();
  const headers = new Headers(init.headers);
  headers.set("x-jira-cookie", jiraCookie);
  headers.set("x-jira-user", jiraUser);
  headers.set("x-whitegen-cookie", whitegenCookie);
  headers.set("x-server-login", serverLogin);
  headers.set("x-server-password", serverPassword);
  headers.set("x-yandex-disk-token", yandexDiskToken);
  if (googleSheetsRefreshToken) {
    headers.set("x-google-sheets-refresh-token", googleSheetsRefreshToken);
  }
  return fetch(url, { ...init, headers });
}
