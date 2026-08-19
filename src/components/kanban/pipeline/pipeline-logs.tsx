import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

export function PipelineLogs({
  logs,
  scrollAreaRef,
}: {
  logs: string[];
  scrollAreaRef: (node: HTMLDivElement | null) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Логи</p>
      <ScrollArea ref={scrollAreaRef} className="h-40 bg-slate-950/60 rounded-lg border border-slate-700/40 p-3">
        <div className="space-y-0.5">
          {logs.map((line, i) => (
            <p key={i} className={cn(
              "text-xs font-mono leading-relaxed",
              line.toLowerCase().includes("err") || line.includes("[!")
                ? "text-red-400"
                : line.includes("[OK]") || line.includes("✅") || line.includes("✓")
                ? "text-emerald-400"
                : "text-slate-400"
            )}>
              {line}
            </p>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
