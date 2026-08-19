import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle } from "lucide-react";

export interface VerifyResult {
  domain: string;
  ok: boolean;
  title: string | null;
  error?: string;
}

export function VerifyResultsPanel({ results }: { results: VerifyResult[] }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Проверка сайтов</p>
      <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
        {results.map((r) => (
          <div
            key={r.domain}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 border",
              r.ok ? "bg-emerald-900/20 border-emerald-500/30" : "bg-red-900/20 border-red-500/30"
            )}
          >
            {r.ok
              ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
            <div className="min-w-0">
              <p className="text-xs font-mono truncate text-slate-300">{r.domain}</p>
              <p className="text-xs truncate text-slate-500">{r.error ?? r.title ?? "—"}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
