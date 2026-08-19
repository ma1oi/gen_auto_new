import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PipelineStep, WhitegenTask, PipelineEvent, DomainIssue, ImageIssue, AtIssue, PreviewTask, DeployStatus } from "@/types";
import { apiFetch } from "@/lib/api-client";

interface Notification {
  id: string;
  message: string;
  type: "success" | "info" | "error";
  at: string;
  action?: { label: string; path: string };
}

interface PipelineState {
  step: PipelineStep;
  logs: string[];
  isRunning: boolean;
  whitegenTasks: WhitegenTask[];
  notifications: Notification[];
  domainIssues: DomainIssue[];
  imageIssues: ImageIssue[];
  atIssues: AtIssue[];
  previewTasks: PreviewTask[];
  deployStatuses: Record<string, DeployStatus>;

  setStep: (step: PipelineStep) => void;
  appendLog: (line: string) => void;
  clearLogs: () => void;
  setRunning: (v: boolean) => void;
  setWhitegenTasks: (tasks: WhitegenTask[]) => void;
  setDomainIssues: (issues: DomainIssue[]) => void;
  setImageIssues: (issues: ImageIssue[]) => void;
  setAtIssues: (issues: AtIssue[]) => void;
  addNotification: (message: string, type: Notification["type"], action?: Notification["action"]) => void;
  dismissNotification: (id: string) => void;
  resetPipeline: () => void;
  setPreviewTasks: (tasks: PreviewTask[]) => void;
  updatePreviewTopic: (key: string, topic: string) => void;
  updatePreviewDomain: (key: string, domain: string) => void;
  clearPreviewTasks: () => void;
  setDeployQueue: (tasks: { key: string; domain: string; type: "csv" | "ip"; server: string }[]) => void;
  updateDeployStatus: (key: string, status: DeployStatus["status"], reason?: string) => void;
  removeDeployStatus: (key: string) => void;
  clearDeployStatuses: () => void;
}

export const usePipelineStore = create<PipelineState>()(
  persist(
    (set) => ({
      step: "idle",
      logs: [],
      isRunning: false,
      whitegenTasks: [],
      notifications: [],
      domainIssues: [],
      imageIssues: [],
      atIssues: [],
      previewTasks: [],
      deployStatuses: {},

      setStep: (step) => set({ step }),
      appendLog: (line) =>
        set((s) => ({ logs: [...s.logs.slice(-300), line] })),
      clearLogs: () => set({ logs: [] }),
      setRunning: (v) => set({ isRunning: v }),
      setWhitegenTasks: (tasks) => set({ whitegenTasks: tasks }),
      setDomainIssues: (issues) => set({ domainIssues: issues }),
      setImageIssues: (issues) => set({ imageIssues: issues }),
      setAtIssues: (issues) => set({ atIssues: issues }),
      addNotification: (message, type, action) =>
        set((s) => ({
          notifications: [
            ...s.notifications,
            { id: `n-${Date.now()}`, message, type, at: new Date().toISOString(), action },
          ],
        })),
      dismissNotification: (id) =>
        set((s) => ({
          notifications: s.notifications.filter((n) => n.id !== id),
        })),
      resetPipeline: () => set({ step: "idle", logs: [], isRunning: false, whitegenTasks: [], domainIssues: [], imageIssues: [], atIssues: [], previewTasks: [], deployStatuses: {} }),
      setPreviewTasks: (tasks) => set({ previewTasks: tasks }),
      updatePreviewTopic: (key, topic) =>
        set((s) => ({
          previewTasks: s.previewTasks.map((t) => (t.key === key ? { ...t, topic } : t)),
        })),
      updatePreviewDomain: (key, domain) =>
        set((s) => ({
          previewTasks: s.previewTasks.map((t) => (t.key === key ? { ...t, domain: domain.trim().toLowerCase() } : t)),
        })),
      clearPreviewTasks: () => set({ previewTasks: [] }),
      setDeployQueue: (tasks) =>
        set({
          deployStatuses: Object.fromEntries(
            tasks.map((t) => [t.key, { domain: t.domain, type: t.type, server: t.server, status: "pending" as const }])
          ),
        }),
      updateDeployStatus: (key, status, reason) =>
        set((s) => ({
          deployStatuses: s.deployStatuses[key]
            ? { ...s.deployStatuses, [key]: { ...s.deployStatuses[key], status, reason } }
            : s.deployStatuses,
        })),
      removeDeployStatus: (key) =>
        set((s) => {
          if (!(key in s.deployStatuses)) return s;
          const next = { ...s.deployStatuses };
          delete next[key];
          return { deployStatuses: next };
        }),
      clearDeployStatuses: () => set({ deployStatuses: {} }),
    }),
    {
      name: "pipeline-store",
      partialize: (s) => ({
        step: s.step,
        logs: s.logs.slice(-500),
        notifications: s.notifications,
        whitegenTasks: s.whitegenTasks,
        domainIssues: s.domainIssues,
        imageIssues: s.imageIssues,
        atIssues: s.atIssues,
        previewTasks: s.previewTasks,
        deployStatuses: s.deployStatuses,
      }),
    }
  )
);

// возвращается из runPipelineStream, если поток остановлен через AbortSignal
// (не путать с обычным кодом ошибки — это осознанная остановка пользователем)
export const ABORTED_CODE = -2;

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export async function runPipelineStream(
  url: string,
  onLog: (line: string) => void,
  body?: unknown,
  onEvent?: (ev: PipelineEvent) => void,
  signal?: AbortSignal
): Promise<number> {
  const options: RequestInit = { method: "POST" };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
    options.headers = { "Content-Type": "application/json" };
  }
  if (signal) options.signal = signal;

  let res: Response;
  try {
    res = await apiFetch(url, options);
  } catch (err) {
    if (isAbortError(err)) return ABORTED_CODE;
    throw err;
  }
  if (!res.body) return -1;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    let done: boolean, value: Uint8Array | undefined;
    try {
      ({ done, value } = await reader.read());
    } catch (err) {
      if (isAbortError(err)) return ABORTED_CODE;
      throw err;
    }
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      for (const line of part.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const ev = JSON.parse(line.slice(6)) as PipelineEvent;
          onEvent?.(ev);
          if (ev.type === "log" || ev.type === "error") {
            onLog((ev.message ?? "").trim());
          }
          if (ev.type === "done") return ev.code ?? 0;
        } catch {}
      }
    }
  }
  return 0;
}
