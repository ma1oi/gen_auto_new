import { cn } from "@/lib/utils";
import { Zap, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import type { PipelineStep } from "@/types";

export const STEPS: { id: PipelineStep; label: string }[] = [
  { id: "generating", label: "Генерация" },
  { id: "waiting", label: "Ожидание" },
  { id: "downloading", label: "Скачивание" },
  { id: "checking", label: "Проверка" },
  { id: "cleaning", label: "Очистка" },
  { id: "deploying", label: "Деплой" },
];

export function stepIndex(step: PipelineStep): number {
  return ["generating", "waiting", "downloading", "checking", "cleaning", "deploying", "done"].indexOf(step);
}

export function PipelineHeader({
  step,
  previewCount,
  isBusy,
  hasDomainIssues,
}: {
  step: PipelineStep;
  previewCount: number;
  isBusy: boolean;
  hasDomainIssues: boolean;
}) {
  const curIdx = stepIndex(step);

  return (
    <div className="w-full flex items-center gap-3 px-4 py-3">
      <div className="flex items-center gap-2 flex-1">
        <Zap className="w-4 h-4 text-violet-400" />
        <span className="text-sm font-semibold text-violet-300">Generator Pipeline</span>
        {previewCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">
            {previewCount} в пачке
          </span>
        )}
        {isBusy && <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin ml-1" />}
        {step === "done" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 ml-1" />}
        {step === "checking" && hasDomainIssues && (
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 ml-1" />
        )}
      </div>

      <div className="flex items-center gap-1 mr-2">
        {STEPS.map((s, i) => {
          const done = curIdx > i + 1 || step === "done";
          const active = curIdx === i + 1;
          return (
            <div key={s.id} className="flex items-center gap-1">
              <div
                title={s.label}
                className={cn(
                  "w-2 h-2 rounded-full",
                  done ? "bg-emerald-400" : active ? "bg-violet-400" : "bg-slate-700"
                )}
              />
              {i < STEPS.length - 1 && <div className="w-3 h-px bg-slate-700" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
