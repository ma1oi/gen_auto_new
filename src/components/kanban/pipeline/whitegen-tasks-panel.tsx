import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import type { WhitegenTask } from "@/types";
import { WhitegenBadge } from "./badges";

export function WhitegenTasksPanel({
  whitegenTasks,
  allFinished,
  isRunning,
  regeneratingKeys,
  onRegenerateTask,
}: {
  whitegenTasks: WhitegenTask[];
  allFinished: boolean;
  isRunning: boolean;
  regeneratingKeys: Set<string>;
  onRegenerateTask: (task: WhitegenTask) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
        Статус в whitegen
        {allFinished && <span className="ml-2 text-emerald-400">— все готовы</span>}
      </p>
      <div className="grid grid-cols-2 gap-1.5 overflow-y-auto max-h-[40rem]">
        {whitegenTasks.map((t) => (
          <div
            key={t.number}
            className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-1.5 border border-slate-700/40"
          >
            <span className="text-xs font-mono text-slate-400 truncate mr-2">
              {t.number}
              <span className="text-slate-600 ml-1">#{t.id}</span>
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-slate-500 truncate max-w-[100px]">{t.domain}</span>
              <WhitegenBadge status={t.status} />
              <button
                title="Перегенерировать"
                disabled={
                  !["finished", "canceled", "failed"].includes(t.status) ||
                  isRunning ||
                  regeneratingKeys.has(t.number)
                }
                onClick={() => onRegenerateTask(t)}
                className="text-slate-500 hover:text-violet-400 disabled:opacity-30 disabled:hover:text-slate-500 transition-colors"
              >
                <RefreshCw className={cn("w-3 h-3", regeneratingKeys.has(t.number) && "animate-spin")} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
