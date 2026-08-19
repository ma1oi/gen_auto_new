import { create } from "zustand";
import type { ConflictMode } from "@/components/manual-upload/conflict-dialog";

export interface StagedGroup {
  name: string;
  fileCount: number;
}

// Не persist в localStorage — File нельзя сериализовать. Но т.к. это обычный
// zustand-стор (живёт вне дерева React-компонентов), состояние переживает
// переход между /manual-upload и другими страницами внутри SPA — сбрасывается
// только при полной перезагрузке вкладки, что и требовалось.
interface ManualUploadState {
  ip: string;
  files: File[];
  groups: StagedGroup[];
  taskNumbers: Record<string, string>;
  busy: boolean;
  busyLabel: string;
  logs: string[];
  deployedDomains: string[];

  conflictOpen: boolean;
  conflictNames: string[];
  resolutions: Record<string, ConflictMode>;
  pendingStagedDir: string | null;
  pendingAllNames: string[];

  setIp: (ip: string) => void;
  setFiles: (files: File[], groups: StagedGroup[]) => void;
  setTaskNumber: (name: string, value: string) => void;
  setBusy: (busy: boolean, label?: string) => void;
  appendLog: (line: string) => void;
  clearLogs: () => void;
  setDeployedDomains: (domains: string[]) => void;
  openConflict: (names: string[], stagedDir: string, allNames: string[]) => void;
  closeConflict: () => void;
  setResolution: (name: string, mode: ConflictMode) => void;
  reset: () => void;
}

export const useManualUploadStore = create<ManualUploadState>()((set) => ({
  ip: "",
  files: [],
  groups: [],
  taskNumbers: {},
  busy: false,
  busyLabel: "",
  logs: [],
  deployedDomains: [],

  conflictOpen: false,
  conflictNames: [],
  resolutions: {},
  pendingStagedDir: null,
  pendingAllNames: [],

  setIp: (ip) => set({ ip }),
  setFiles: (files, groups) => set({ files, groups }),
  setTaskNumber: (name, value) =>
    set((s) => ({ taskNumbers: { ...s.taskNumbers, [name]: value } })),
  setBusy: (busy, label) => set({ busy, busyLabel: label ?? "" }),
  appendLog: (line) => set((s) => ({ logs: [...s.logs.slice(-300), line] })),
  clearLogs: () => set({ logs: [] }),
  setDeployedDomains: (domains) => set({ deployedDomains: domains }),
  openConflict: (names, stagedDir, allNames) =>
    set({
      conflictOpen: true,
      conflictNames: names,
      resolutions: {},
      pendingStagedDir: stagedDir,
      pendingAllNames: allNames,
    }),
  closeConflict: () => set({ conflictOpen: false }),
  setResolution: (name, mode) =>
    set((s) => ({ resolutions: { ...s.resolutions, [name]: mode } })),
  reset: () =>
    set({
      files: [],
      groups: [],
      taskNumbers: {},
      logs: [],
    }),
}));
