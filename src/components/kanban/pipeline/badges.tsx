import { cn } from "@/lib/utils";
import type { WhitegenTask } from "@/types";

function serverColorStyle(server: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < server.length; i++) {
    hash = (hash * 31 + server.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return {
    backgroundColor: `hsl(${hue} 70% 50% / 0.2)`,
    color: `hsl(${hue} 70% 70%)`,
    borderColor: `hsl(${hue} 70% 50% / 0.3)`,
  };
}

export function ServerBadge({ server }: { server: string }) {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border shrink-0"
      style={serverColorStyle(server)}
    >
      {server}
    </span>
  );
}

export function WhitegenBadge({ status }: { status: WhitegenTask["status"] }) {
  const map: Record<WhitegenTask["status"], { label: string; cls: string }> = {
    pending: { label: "В очереди", cls: "bg-slate-600/40 text-slate-400" },
    processing: { label: "Генерируется", cls: "bg-yellow-500/20 text-yellow-400" },
    in_progress: { label: "В процессе", cls: "bg-yellow-500/20 text-yellow-400" },
    finished: { label: "Готов", cls: "bg-emerald-500/20 text-emerald-400" },
    canceled: { label: "Отменён", cls: "bg-red-500/20 text-red-400" },
    failed: { label: "Ошибка", cls: "bg-red-500/20 text-red-400" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-slate-600/40 text-slate-400" };
  return <span className={cn("text-xs px-1.5 py-0.5 rounded", cls)}>{label}</span>;
}
