"use client";

import { useEffect } from "react";
import { usePipelineStore } from "@/store/pipeline.store";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle, Info, X, FolderOpen } from "lucide-react";

export function Notifications() {
  const { notifications, dismissNotification } = usePipelineStore();

  return (
    <div className="fixed bottom-5 right-5 flex flex-col gap-2 z-50 max-w-sm w-full pointer-events-none">
      {notifications.slice(-5).map((n) => (
        <NotificationItem key={n.id} id={n.id} message={n.message} type={n.type} action={n.action} onDismiss={dismissNotification} />
      ))}
    </div>
  );
}

function NotificationItem({
  id, message, type, action, onDismiss,
}: {
  id: string;
  message: string;
  type: "success" | "info" | "error";
  action?: { label: string; path: string };
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), 6000);
    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  const styles = {
    success: { bg: "bg-emerald-900/80 border-emerald-500/40", text: "text-emerald-200", icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> },
    info: { bg: "bg-blue-900/80 border-blue-500/40", text: "text-blue-200", icon: <Info className="w-4 h-4 text-blue-400 flex-shrink-0" /> },
    error: { bg: "bg-red-900/80 border-red-500/40", text: "text-red-200", icon: <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" /> },
  };

  const { bg, text, icon } = styles[type];

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm pointer-events-auto",
        "shadow-xl shadow-black/30 animate-in slide-in-from-right-4 duration-300",
        bg
      )}
    >
      {icon}
      <p className={cn("text-sm flex-1 leading-snug", text)}>{message}</p>
      {action && (
        <button
          onClick={() => fetch("/api/system/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: action.path }) })}
          title={action.label}
          className="text-slate-400 hover:text-slate-100 flex-shrink-0 transition-colors"
        >
          <FolderOpen className="w-4 h-4" />
        </button>
      )}
      <button onClick={() => onDismiss(id)} className="text-slate-500 hover:text-slate-300 flex-shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
