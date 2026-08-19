export type PipelineStep = "idle" | "generating" | "waiting" | "downloading" | "checking" | "cleaning" | "deploying" | "done";

// код done-события, которым помечается протухшая/неверная Whitegen-сессия —
// отличаем от обычной ошибки (код 1), чтобы показать в уведомлении конкретику
// про обновление куки, а не общее "ошибка при отправке"
export const AUTH_ERROR_CODE = 2;

export interface DomainIssue {
  taskKey: string;
  files: { name: string; count: number }[];
}

export interface ImageIssue {
  taskKey: string;
  images: { url: string; status: number | null; error?: string }[];
}

export interface AtIssue {
  taskKey: string;
  files: { name: string; count: number }[];
}

export interface PipelineEvent {
  type: "log" | "error" | "done" | "deploy-queue" | "deploy-status" | "deployed-domains" | "extracted-keys" | "upload-status";
  message?: string;
  code?: number;
  tasks?: { key: string; domain: string; type: "csv" | "ip"; server: string }[];
  key?: string;
  domain?: string;
  status?: "running" | "ok" | "error" | "skip" | "exists";
  reason?: string;
  server?: string;
  domains?: string[];
  keys?: string[];
}

export interface PreviewTask {
  key: string;
  topic: string;
  domain: string;
  geo: string;
  brandName: string;
  langOverride: string;
  deployType: "csv" | "ip";
  serverIp: string | null;
}

export interface DeployStatus {
  domain: string;
  type: "csv" | "ip";
  server: string;
  status: "pending" | "running" | "ok" | "error" | "skip";
  reason?: string;
}

export interface WhitegenTask {
  id: number;
  number: string;
  domain: string;
  type: string;
  country: string;
  language: string;
  status: "pending" | "processing" | "in_progress" | "finished" | "canceled" | "failed";
  created_at: string;
}
