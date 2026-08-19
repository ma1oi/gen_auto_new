import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import type { DeployStatus } from "@/types";
import { ServerBadge } from "./badges";

export function DeployStatusPanel({ deployStatuses }: { deployStatuses: Record<string, DeployStatus> }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Статус деплоя</p>
      <div className="grid grid-cols-2 gap-1.5">
        {Object.entries(deployStatuses).map(([key, d]) => (
          <div
            key={key}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 border",
              d.status === "ok"
                ? "bg-emerald-900/20 border-emerald-500/30"
                : d.status === "error" || d.status === "skip"
                ? "bg-red-900/20 border-red-500/30"
                : "bg-slate-800/60 border-slate-700/40"
            )}
          >
            {d.status === "running" && <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin shrink-0" />}
            {d.status === "pending" && <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
            {d.status === "ok" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
            {(d.status === "error" || d.status === "skip") && <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-mono truncate text-slate-300">
                  {key} <span className="text-slate-600">({d.type})</span>
                </p>
                {d.server && <ServerBadge server={d.server} />}
              </div>
              <p className="text-xs truncate text-slate-500">{d.domain}{d.reason ? ` — ${d.reason}` : ""}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
