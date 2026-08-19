import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  jiraCookie: string;
  jiraUser: string;
  whitegenCookie: string;
  yandexDiskToken: string;
  serverLogin: string;
  serverPassword: string;
  googleSheetsRefreshToken: string;
  googleSheetsEmail: string;
  notificationsEnabled: boolean;
  set: (patch: Partial<Omit<SettingsState, "set">>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      jiraCookie: "",
      jiraUser: "",
      whitegenCookie: "",
      yandexDiskToken: "",
      serverLogin: "",
      serverPassword: "",
      googleSheetsRefreshToken: "",
      googleSheetsEmail: "",
      notificationsEnabled: false,
      set: (patch) => set(patch),
    }),
    { name: "settings-store" }
  )
);
