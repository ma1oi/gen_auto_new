import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AtIssue, DomainIssue, ImageIssue } from "@/types";

export function CheckIssuesPanel({
  checking,
  domainIssues,
  atIssues,
  imageIssues,
  wgIdMap,
  isRunning,
  fixing,
  fixingAt,
  onFixDomain,
  onFixAt,
  onRegenerate,
}: {
  checking: boolean;
  domainIssues: DomainIssue[];
  atIssues: AtIssue[];
  imageIssues: ImageIssue[];
  wgIdMap: Map<string, number>;
  isRunning: boolean;
  fixing: boolean;
  fixingAt: boolean;
  onFixDomain: () => void;
  onFixAt: () => void;
  onRegenerate: (source: "domain" | "image" | "all") => void;
}) {
  if (checking) {
    return (
      <p className="text-xs text-slate-400 flex items-center gap-1.5">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Проверяю архивы на domain.com...
      </p>
    );
  }

  const allClean = domainIssues.length === 0 && imageIssues.length === 0 && atIssues.length === 0;

  return (
    <>
      {domainIssues.length > 0 && (
        <div className="space-y-2 border border-amber-500/30 bg-amber-900/10 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              domain.com найден в {domainIssues.length} задачах
            </p>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                disabled={isRunning || fixing}
                onClick={onFixDomain}
                className="bg-slate-600 hover:bg-slate-500 text-white h-7 text-xs gap-1.5"
              >
                <RefreshCw className={cn("w-3 h-3", fixing && "animate-spin")} />
                Исправить в файлах
              </Button>
              <Button
                size="sm"
                disabled={isRunning || fixing}
                onClick={() => onRegenerate("domain")}
                className="bg-amber-600 hover:bg-amber-500 text-white h-7 text-xs gap-1.5"
              >
                <RefreshCw className="w-3 h-3" />
                Перегенерировать
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-1">
            {domainIssues.map((issue) => (
              <div
                key={issue.taskKey}
                className="flex items-start gap-3 bg-slate-800/60 rounded px-2.5 py-1.5 border border-slate-700/40"
              >
                <span className="text-xs font-mono text-amber-400 shrink-0">
                  {issue.taskKey}
                  {wgIdMap.get(issue.taskKey.toUpperCase()) && (
                    <span className="text-slate-500 ml-1">#{wgIdMap.get(issue.taskKey.toUpperCase())}</span>
                  )}
                </span>
                <span className="text-xs text-slate-400">
                  {issue.files.map((f) => `${f.name} (${f.count})`).join(", ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {allClean && (
        <p className="text-xs text-emerald-400 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Все архивы чистые — domain.com не найден, картинки ок
        </p>
      )}

      {atIssues.length > 0 && (
        <div className="space-y-2 border border-amber-500/30 bg-amber-900/10 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              [at]/(at) найден в {atIssues.length} задачах
            </p>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                disabled={isRunning || fixingAt}
                onClick={onFixAt}
                className="bg-slate-600 hover:bg-slate-500 text-white h-7 text-xs gap-1.5"
              >
                <RefreshCw className={cn("w-3 h-3", fixingAt && "animate-spin")} />
                Исправить в файлах
              </Button>
              <Button
                size="sm"
                disabled={isRunning || fixingAt}
                onClick={() => onRegenerate("all")}
                className="bg-amber-600 hover:bg-amber-500 text-white h-7 text-xs gap-1.5"
              >
                <RefreshCw className="w-3 h-3" />
                Перегенерировать
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-1">
            {atIssues.map((issue) => (
              <div key={issue.taskKey} className="flex items-start gap-3 bg-slate-800/60 rounded px-2.5 py-1.5 border border-slate-700/40">
                <span className="text-xs font-mono text-amber-400 shrink-0">{issue.taskKey}</span>
                <span className="text-xs text-slate-400">{issue.files.map((f) => `${f.name} (${f.count})`).join(", ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {imageIssues.length > 0 && (
        <div className="space-y-2 border border-red-500/30 bg-red-900/10 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-red-400 flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5" />
              Битые картинки в {imageIssues.length} задачах
            </p>
            <Button
              size="sm"
              disabled={isRunning}
              onClick={() => onRegenerate("image")}
              className="bg-red-600 hover:bg-red-500 text-white h-7 text-xs gap-1.5"
            >
              <RefreshCw className="w-3 h-3" />
              Перегенерировать
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-1">
            {imageIssues.map((issue) => (
              <div
                key={issue.taskKey}
                className="bg-slate-800/60 rounded px-2.5 py-1.5 border border-slate-700/40 space-y-0.5"
              >
                <span className="text-xs font-mono text-red-400">
                  {issue.taskKey}
                  {wgIdMap.get(issue.taskKey.toUpperCase()) && (
                    <span className="text-slate-500 ml-1">#{wgIdMap.get(issue.taskKey.toUpperCase())}</span>
                  )}
                </span>
                <div className="space-y-0.5 pl-2">
                  {issue.images.map((img) => (
                    <p key={img.url} className="text-xs text-slate-400 truncate">
                      {img.error ?? `HTTP ${img.status}`} — <span className="text-slate-500">{img.url.replace(/^https?:\/\//, "").slice(0, 60)}</span>
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
