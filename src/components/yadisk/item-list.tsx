import { cn } from "@/lib/utils";
import type { YaDiskItem } from "@/app/api/pipeline/yadisk-upload/list/route";
import { AlertTriangle, CloudCheck, Download, Loader2, XCircle } from "lucide-react";

export interface UploadStatus {
  status: "running" | "ok" | "error" | "skip" | "exists";
  reason?: string;
}

export function ItemList({
  date,
  items,
  isChecked,
  onToggle,
  statusFor,
  onOverwrite,
}: {
  date: string;
  items: YaDiskItem[];
  isChecked: (item: YaDiskItem) => boolean;
  onToggle: (item: YaDiskItem) => void;
  statusFor?: (item: YaDiskItem) => UploadStatus | undefined;
  // "Перезаписать" в предупреждении о конфликте (файл уже есть на Я.Диске)
  onOverwrite?: (item: YaDiskItem) => void;
}) {
  if (items.length === 0) {
    return <p className="text-xs text-slate-500">За этот день ничего не задеплоено.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {items.map((item) => {
        const checked = isChecked(item);
        const digits = item.taskNumber?.replace(/\D+/g, "") ?? "";
        // номер задачи опционален — без него ручник всё равно заливается
        // (просто domain.zip), поэтому это не повод для предупреждения
        const displayName =
          item.type === "manual"
            ? digits
              ? `${item.domain || item.name}.${digits}`
              : item.domain || item.name
            : item.type === "manual-backup"
            ? `${item.domain || item.name}.old`
            : item.type === "generator"
            ? item.name // для генератора важен номер задачи, домен — подписью ниже
            : item.domain || item.name; // manual-archive — как есть
        // подпись под именем: для генератора — домен, для остальных — исходное
        // имя папки (если оно отличается от того, что показано основной строкой)
        const secondaryText =
          item.domain && item.domain !== item.name ? (item.type === "generator" ? item.domain : item.name) : null;
        const downloadUrl = `/api/pipeline/yadisk-upload/download?date=${encodeURIComponent(date)}&name=${encodeURIComponent(item.name)}&type=${item.type}`;
        const liveStatus = statusFor?.(item);
        // уже залитые на Я.Диск (раньше или прямо сейчас) — затемняем, как и
        // невыбранные, даже если чекбокс всё ещё стоит
        const isUploaded = !!item.uploadedAt || liveStatus?.status === "ok";
        return (
          <div
            key={`${item.type}:${item.name}`}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 border transition-colors",
              checked && !isUploaded
                ? "border-sky-500/40 bg-sky-500/5"
                : "border-slate-700/40 bg-slate-800/40 opacity-60"
            )}
          >
            <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(item)}
                className="accent-sky-500 shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="text-xs font-mono block truncate text-slate-200">
                  {displayName}
                </span>
                {secondaryText && (
                  <span className="text-xs text-slate-500 block truncate">{secondaryText}</span>
                )}
              </span>
            </label>
            {liveStatus && liveStatus.status === "exists" && (
              <span
                title={liveStatus.reason}
                className="flex items-center gap-1.5 text-[10px] px-1.5 py-0.5 rounded border shrink-0 bg-amber-500/20 text-amber-400 border-amber-500/30"
              >
                <AlertTriangle className="w-3 h-3" />
                Уже на Диске
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    onOverwrite?.(item);
                  }}
                  className="ml-0.5 px-1 py-0.5 rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/20 transition-colors"
                >
                  Перезаписать
                </button>
              </span>
            )}
            {liveStatus && liveStatus.status !== "exists" && (
              <span
                title={liveStatus.reason}
                className={cn(
                  "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border shrink-0",
                  liveStatus.status === "running"
                    ? "bg-slate-800/60 text-slate-400 border-slate-700/40"
                    : liveStatus.status === "ok"
                    ? "bg-sky-500/20 text-sky-400 border-sky-500/30"
                    : "bg-red-500/20 text-red-400 border-red-500/30"
                )}
              >
                {liveStatus.status === "running" && <Loader2 className="w-3 h-3 animate-spin" />}
                {liveStatus.status === "ok" && <CloudCheck className="w-3 h-3" />}
                {(liveStatus.status === "error" || liveStatus.status === "skip") && <XCircle className="w-3 h-3" />}
                {liveStatus.status === "running" ? "Гружу..." : liveStatus.status === "ok" ? "Залито" : "Ошибка"}
              </span>
            )}
            {!liveStatus && item.uploadedAt && (
              <span
                title={`Загружено на Я.Диск: ${new Date(item.uploadedAt).toLocaleString("ru-RU")}`}
                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border shrink-0 bg-sky-500/20 text-sky-400 border-sky-500/30"
              >
                <CloudCheck className="w-3 h-3" />
                Залито
              </span>
            )}
            <a
              href={downloadUrl}
              title="Скачать архив с сайтом"
              className="w-6 h-6 shrink-0 flex items-center justify-center rounded-md border border-slate-700/50 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded border shrink-0",
                item.type === "generator"
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                  : item.type === "manual-backup"
                  ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
                  : "bg-orange-500/20 text-orange-400 border-orange-500/30"
              )}
            >
              {item.type === "generator" ? "Генератор" : item.type === "manual-backup" ? "Бэкап" : "Ручник"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
