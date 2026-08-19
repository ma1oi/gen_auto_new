"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { apiFetch } from "@/lib/api-client";
import { ABORTED_CODE, runPipelineStream, usePipelineStore } from "@/store/pipeline.store";
import { DayTabs } from "@/components/yadisk/day-tabs";
import { ItemList } from "@/components/yadisk/item-list";
import type { YaDiskDay, YaDiskItem } from "@/app/api/pipeline/yadisk-upload/list/route";
import { readDroppedEntries } from "@/lib/read-dropped-entries";
import { todayDateTag } from "@/lib/date-tag";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { CheckSquare, CloudUpload, Download, FolderUp, Loader2, Settings, Square, Upload, X } from "lucide-react";

function itemKey(date: string, item: YaDiskItem): string {
  return `${date}:${item.type}:${item.name}`;
}

interface StagedGroup {
  name: string;
  fileCount: number;
}

export default function YaDiskPage() {
  const addNotification = usePipelineStore((s) => s.addNotification);

  const [days, setDays] = useState<YaDiskDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [uploadStatuses, setUploadStatuses] = useState<Record<string, { status: "running" | "ok" | "error" | "skip" | "exists"; reason?: string }>>({});

  const [addFiles, setAddFiles] = useState<File[]>([]);
  const [addGroups, setAddGroups] = useState<StagedGroup[]>([]);
  const [adding, setAdding] = useState(false);
  const [addDragging, setAddDragging] = useState(false);
  const [addDropping, setAddDropping] = useState(false);
  const addFileInputRef = useRef<HTMLInputElement>(null);
  const addDragCounterRef = useRef(0);
  const uploadAbortRef = useRef<AbortController | null>(null);

  async function loadList(withSpinner: boolean) {
    if (withSpinner) setLoading(true);
    try {
      const res = await apiFetch("/api/pipeline/yadisk-upload/list");
      const data = (await res.json()) as { days: YaDiskDay[] };
      setDays(data.days ?? []);
      setActiveDate((prev) => prev ?? data.days?.[0]?.date ?? null);
      // изначально отмечены все чекбоксы во всех днях, кроме уже залитых на
      // Я.Диск — их по умолчанию заливать повторно не нужно (только при
      // первой загрузке)
      if (withSpinner) {
        const initial: Record<string, boolean> = {};
        for (const day of data.days ?? []) {
          for (const item of day.items) initial[itemKey(day.date, item)] = !item.uploadedAt;
        }
        setChecked(initial);
      }
    } catch {
      addNotification("Ошибка при загрузке списка", "error");
    } finally {
      if (withSpinner) setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadList(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeDay = days.find((d) => d.date === activeDate) ?? null;
  const activeChecked = activeDay ? activeDay.items.filter((i) => checked[itemKey(activeDay.date, i)]) : [];
  const allChecked = !!activeDay && activeDay.items.length > 0 && activeChecked.length === activeDay.items.length;

  function toggle(item: YaDiskItem) {
    if (!activeDay) return;
    const key = itemKey(activeDay.date, item);
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleAll() {
    if (!activeDay) return;
    const next = !allChecked;
    setChecked((prev) => {
      const copy = { ...prev };
      for (const item of activeDay.items) copy[itemKey(activeDay.date, item)] = next;
      return copy;
    });
  }

  function downloadSelected() {
    if (!activeDay || activeChecked.length === 0) return;
    const items = activeChecked.map((i) => ({ date: activeDay.date, name: i.name, type: i.type }));
    window.location.href = `/api/pipeline/yadisk-upload/download-selected?items=${encodeURIComponent(JSON.stringify(items))}`;
  }

  async function upload() {
    if (!activeDay || activeChecked.length === 0) return;

    setUploading(true);
    setLogs([]);
    // сбрасываем статусы только для того, что грузим сейчас — остальные
    // строки (из прошлых запусков/других дней) не трогаем
    setUploadStatuses((prev) => {
      const next = { ...prev };
      for (const i of activeChecked) delete next[itemKey(activeDay.date, i)];
      return next;
    });

    const controller = new AbortController();
    uploadAbortRef.current = controller;

    // считаем прямо в колбэке, а не через state после await — setUploadStatuses
    // асинхронный, и к моменту завершения runPipelineStream React ещё может не
    // применить последние обновления в замыкание этой функции
    let existsSkipped = 0;
    const code = await runPipelineStream(
      "/api/pipeline/yadisk-upload/commit-selected",
      (line) => setLogs((prev) => [...prev.slice(-300), line]),
      {
        items: activeChecked.map((i) => ({
          date: activeDay.date,
          name: i.name,
          type: i.type,
          taskNumber: i.type === "manual" ? i.taskNumber : undefined,
        })),
      },
      (ev) => {
        if (ev.type === "upload-status" && ev.key && ev.status) {
          const key = ev.key;
          const status = ev.status;
          if (status === "exists") existsSkipped++;
          setUploadStatuses((prev) => ({ ...prev, [key]: { status, reason: ev.reason } }));
        }
      },
      controller.signal
    );

    uploadAbortRef.current = null;
    setUploading(false);
    if (code === 0) {
      if (existsSkipped > 0) {
        addNotification(
          `⚠ Пропущено (уже на Я.Диске): ${existsSkipped} — нажми «Перезаписать» у этих строк`,
          "info"
        );
      } else {
        addNotification(`✓ Загружено на Я.Диск: ${activeChecked.length}`, "success");
      }
    } else if (code === ABORTED_CODE) {
      addNotification("Загрузка остановлена", "info");
      // задача, которая грузилась в момент остановки, не успела прислать
      // финальный статус — убираем зависший "Гружу...", а не врём про исход
      setUploadStatuses((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (next[key].status === "running") delete next[key];
        }
        return next;
      });
    } else {
      addNotification(`Ошибка при загрузке на Я.Диск (код ${code})`, "error");
    }
    void loadList(false);
  }

  function stopUpload() {
    uploadAbortRef.current?.abort();
  }

  // клик по "Перезаписать" в предупреждении о конфликте — грузим именно эту
  // строку заново с force: true, без повторной проверки existence на Диске
  async function overwriteItem(item: YaDiskItem) {
    if (!activeDay) return;
    const key = itemKey(activeDay.date, item);
    setUploadStatuses((prev) => ({ ...prev, [key]: { status: "running" } }));

    const code = await runPipelineStream(
      "/api/pipeline/yadisk-upload/commit-selected",
      (line) => setLogs((prev) => [...prev.slice(-300), line]),
      {
        items: [
          {
            date: activeDay.date,
            name: item.name,
            type: item.type,
            taskNumber: item.type === "manual" ? item.taskNumber : undefined,
            force: true,
          },
        ],
      },
      (ev) => {
        if (ev.type === "upload-status" && ev.key && ev.status) {
          const evKey = ev.key;
          const status = ev.status;
          setUploadStatuses((prev) => ({ ...prev, [evKey]: { status, reason: ev.reason } }));
        }
      }
    );

    if (code === 0) {
      addNotification(`✓ Перезаписано на Я.Диске: ${item.domain || item.name}`, "success");
    } else {
      addNotification(`Ошибка при перезаписи ${item.domain || item.name}`, "error");
    }
    void loadList(false);
  }

  // для архива (ZIP, всегда верхнего уровня) группа называется по имени
  // файла без расширения — так же его назовёт /stage при распаковке
  function groupNameFor(f: File): string {
    const rel = f.webkitRelativePath || f.name;
    const segments = rel.split("/");
    if (segments.length === 1 && /\.zip$/i.test(segments[0])) {
      return segments[0].replace(/\.zip$/i, "");
    }
    return segments[0];
  }

  function applyAddSelectedFiles(arr: File[]) {
    if (arr.length === 0) return;
    const counts = new Map<string, number>();
    for (const f of arr) {
      const top = groupNameFor(f);
      counts.set(top, (counts.get(top) ?? 0) + 1);
    }
    setAddFiles(arr);
    setAddGroups(Array.from(counts.entries()).map(([name, fileCount]) => ({ name, fileCount })));
  }

  function handleAddFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    applyAddSelectedFiles(Array.from(fileList));
  }

  function handleAddDragOver(e: DragEvent) {
    e.preventDefault();
  }

  function handleAddDragEnter(e: DragEvent) {
    e.preventDefault();
    addDragCounterRef.current += 1;
    setAddDragging(true);
  }

  function handleAddDragLeave(e: DragEvent) {
    e.preventDefault();
    addDragCounterRef.current -= 1;
    if (addDragCounterRef.current <= 0) {
      addDragCounterRef.current = 0;
      setAddDragging(false);
    }
  }

  async function handleAddDrop(e: DragEvent) {
    e.preventDefault();
    addDragCounterRef.current = 0;
    setAddDragging(false);
    if (adding) return;

    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;

    setAddDropping(true);
    try {
      const dropped = await readDroppedEntries(items);
      if (dropped.length === 0) {
        addNotification("Не удалось прочитать перетащенные файлы", "error");
        return;
      }
      applyAddSelectedFiles(dropped);
    } catch (err) {
      addNotification(err instanceof Error ? err.message : "Ошибка при чтении перетащенных файлов", "error");
    } finally {
      setAddDropping(false);
    }
  }

  function resetAdd() {
    setAddFiles([]);
    setAddGroups([]);
    if (addFileInputRef.current) addFileInputRef.current.value = "";
  }

  async function addToList() {
    if (addFiles.length === 0) return;
    setAdding(true);

    try {
      const formData = new FormData();
      for (const f of addFiles) {
        formData.append("files", f, f.webkitRelativePath || f.name);
      }
      // архив со страницы "Я.Диск" — без номера задачи, уезжает под тем же
      // именем, с которым его загрузили
      formData.append("noTaskNumber", "true");
      const res = await apiFetch("/api/pipeline/manual-upload/stage", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as { stagedDir?: string; names?: string[]; error?: string };
      if (!data.stagedDir || !data.names) {
        addNotification(data.error ?? "Ошибка при добавлении в список", "error");
        return;
      }

      const today = todayDateTag();
      await loadList(false);
      setActiveDate(today);
      setChecked((prev) => {
        const next = { ...prev };
        for (const name of data.names ?? []) next[`${today}:manual-archive:${name}`] = true;
        return next;
      });
      addNotification(`✓ Добавлено в список: ${data.names.length}`, "success");
      resetAdd();
    } catch (err) {
      addNotification(err instanceof Error ? err.message : "Ошибка при добавлении в список", "error");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="flex-shrink-0 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-sm px-6 py-3.5">
        <div className="relative flex items-center justify-between max-w-[1800px] mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-600/20 border border-sky-500/30 flex items-center justify-center">
              <CloudUpload className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-100">Я.Диск</h1>
              <p className="text-xs text-slate-500">Бэкап задеплоенного за последние 7 дней</p>
            </div>
          </div>

          <AppNav className="absolute left-1/2 -translate-x-1/2" />

          <Link
            href="/settings"
            className="w-8 h-8 rounded-lg bg-slate-800/60 border border-slate-700/50 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </Link>
        </div>
      </header>

      <main className="flex-1 overflow-auto px-6 pt-5">
        <div className="max-w-[1800px] mx-auto space-y-4">
          {loading ? (
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Загружаю список...
            </p>
          ) : (
            <div className="border border-sky-500/30 bg-sky-900/10 rounded-xl p-4 space-y-4">
              <DayTabs days={days} activeDate={activeDate ?? ""} onSelect={setActiveDate} />

              {activeDay && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                      {activeDay.date} — выбрано {activeChecked.length} из {activeDay.items.length}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={uploading}
                        onClick={toggleAll}
                        className="border-slate-700/50 text-slate-300 hover:bg-slate-700/40 h-8 text-xs gap-1.5"
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                        {allChecked ? "Снять все" : "Выбрать все"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={activeChecked.length === 0}
                        onClick={downloadSelected}
                        className="border-slate-700/50 text-slate-300 hover:bg-slate-700/40 disabled:opacity-40 h-8 text-xs gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Скачать
                      </Button>
                      <Button
                        size="sm"
                        disabled={uploading || activeChecked.length === 0}
                        onClick={upload}
                        className="bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40 h-8 text-xs gap-1.5"
                      >
                        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudUpload className="w-3.5 h-3.5" />}
                        {uploading ? "Загружаю..." : "Загрузить на Я.Диск"}
                      </Button>
                      {uploading && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={stopUpload}
                          className="border-red-500/30 text-red-400 hover:bg-red-500/10 h-8 text-xs gap-1.5"
                        >
                          <Square className="w-3 h-3" />
                          Стоп
                        </Button>
                      )}
                    </div>
                  </div>

                  <ItemList
                    date={activeDay.date}
                    items={activeDay.items}
                    isChecked={(item) => !!checked[itemKey(activeDay.date, item)]}
                    onToggle={toggle}
                    statusFor={(item) => uploadStatuses[itemKey(activeDay.date, item)]}
                    onOverwrite={overwriteItem}
                  />
                </>
              )}

              {logs.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Логи</p>
                  <ScrollArea className="h-48 bg-slate-950/60 rounded-lg border border-slate-700/40 p-3">
                    <div className="space-y-0.5">
                      {logs.map((line, i) => (
                        <p
                          key={i}
                          className={cn(
                            "text-xs font-mono leading-relaxed",
                            line.toLowerCase().includes("err") || line.includes("✗")
                              ? "text-red-400"
                              : line.includes("✅") || line.includes("↑")
                              ? "text-emerald-400"
                              : "text-slate-400"
                          )}
                        >
                          {line}
                        </p>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}

          <div className="border border-sky-500/30 bg-sky-900/10 rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                Добавить архив(-ы) в список для заливки на Я.Диск
              </p>

              <div className="flex items-center gap-2">
                <input
                  ref={addFileInputRef}
                  type="file"
                  accept=".zip"
                  multiple
                  disabled={adding}
                  onChange={(e) => handleAddFilesSelected(e.target.files)}
                  className="hidden"
                />

                {!adding && addGroups.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={resetAdd}
                    className="text-slate-500 hover:text-slate-300 h-8 text-xs gap-1.5"
                  >
                    <X className="w-3.5 h-3.5" />
                    Очистить
                  </Button>
                )}

                <Button
                  size="sm"
                  disabled={addFiles.length === 0 || adding}
                  onClick={addToList}
                  className="bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40 h-8 text-xs gap-1.5"
                >
                  {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {adding ? "Добавляю..." : "Добавить в список"}
                </Button>
              </div>
            </div>

            <div
              onDragOver={handleAddDragOver}
              onDragEnter={handleAddDragEnter}
              onDragLeave={handleAddDragLeave}
              onDrop={handleAddDrop}
              onClick={() => !adding && addFileInputRef.current?.click()}
              className={cn(
                "flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed py-8 cursor-pointer transition-colors",
                addDragging
                  ? "border-sky-400 bg-sky-500/10"
                  : "border-slate-700/50 hover:border-slate-600 hover:bg-slate-800/30"
              )}
            >
              {addDropping ? (
                <>
                  <Loader2 className="w-5 h-5 text-sky-400 animate-spin" />
                  <p className="text-xs text-sky-400">Читаю перетащенные файлы...</p>
                </>
              ) : (
                <>
                  <FolderUp className={cn("w-5 h-5", addDragging ? "text-sky-400" : "text-slate-500")} />
                  <p className={cn("text-xs", addDragging ? "text-sky-300" : "text-slate-400")}>
                    Перетащи ZIP-архив(-ы) сюда
                  </p>
                  <p className="text-xs text-slate-600">или нажми, чтобы выбрать через диалог</p>
                </>
              )}
            </div>

            {addGroups.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                  Выбрано архивов: {addGroups.length}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {addGroups.map((g) => (
                    <div
                      key={g.name}
                      className="flex items-center justify-between gap-2 bg-slate-800/60 rounded-lg px-3 py-1.5 border border-slate-700/40"
                    >
                      <span className="text-xs font-mono text-slate-300 truncate">{g.name}</span>
                      <span className="text-xs text-slate-500 shrink-0">{g.fileCount} файл(ов)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
