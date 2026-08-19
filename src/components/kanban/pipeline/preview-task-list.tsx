import { cn } from "@/lib/utils";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PreviewTask } from "@/types";

export function PreviewTaskList({
  previewTasks,
  loadingPreview,
  removingCreated,
  onTopicChange,
  onDomainChange,
  onRemoveCreated,
  onReload,
}: {
  previewTasks: PreviewTask[];
  loadingPreview: boolean;
  removingCreated: boolean;
  onTopicChange: (key: string, topic: string) => void;
  onDomainChange: (key: string, domain: string) => void;
  onRemoveCreated: () => void;
  onReload: () => void;
}) {
  const missingDomainCount = previewTasks.filter((t) => !t.domain).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
          Задачи на генерацию ({previewTasks.length})
          {missingDomainCount > 0 && (
            <span className="ml-2 text-amber-400">— нет домена: {missingDomainCount}</span>
          )}
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            disabled={removingCreated}
            onClick={onRemoveCreated}
            className="text-slate-500 hover:text-slate-300 h-7 text-xs gap-1.5"
          >
            {removingCreated ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            Убрать готовые
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={loadingPreview}
            onClick={onReload}
            className="text-slate-500 hover:text-slate-300 h-7 text-xs gap-1.5"
          >
            <RefreshCw className={cn("w-3 h-3", loadingPreview && "animate-spin")} />
            Обновить список
          </Button>
        </div>
      </div>
      <div className="space-y-1.5 overflow-y-auto max-h-[40rem]">
        {previewTasks.map((task) => {
          const missingDomain = !task.domain;
          return (
          <div
            key={task.key}
            className={cn(
              "flex items-stretch gap-3 rounded-lg px-3 py-2 border",
              missingDomain
                ? "bg-amber-900/20 border-amber-500/40"
                : "bg-slate-800/60 border-slate-700/40"
            )}
          >
            <div className="w-28 shrink-0 pt-1.5">
              <span className="text-xs font-mono text-violet-400 block">{task.key}</span>
              {missingDomain ? (
                <input
                  value={task.domain}
                  onChange={(e) => onDomainChange(task.key, e.target.value)}
                  placeholder="домен..."
                  className="mt-0.5 w-full text-xs text-amber-300 placeholder:text-amber-500/60 bg-slate-950/60 border border-amber-500/40 rounded px-1.5 py-0.5 focus:outline-none focus:border-amber-400"
                />
              ) : (
                <span className="text-xs text-slate-500 block truncate">{task.domain}</span>
              )}
              {task.geo && <span className="text-xs text-slate-600 block">{task.geo}</span>}
              <span
                className={cn(
                  "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border mt-1",
                  task.deployType === "ip"
                    ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                    : "bg-slate-600/30 text-slate-400 border-slate-600/40"
                )}
                title={task.deployType === "ip" ? task.serverIp ?? undefined : undefined}
              >
                {task.deployType === "ip" ? `IP ${task.serverIp ?? ""}` : "CSV"}
              </span>
            </div>
            <textarea
              value={task.topic}
              onChange={(e) => onTopicChange(task.key, e.target.value)}
              className="flex-1 min-w-0 h-full min-h-[4.5rem] text-xs text-slate-200 font-mono leading-relaxed bg-slate-950/60 border border-slate-700/40 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:border-violet-500/60"
            />
          </div>
          );
        })}
      </div>
    </div>
  );
}
