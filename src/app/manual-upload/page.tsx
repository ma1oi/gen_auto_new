"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { apiFetch } from "@/lib/api-client";
import { runPipelineStream, usePipelineStore } from "@/store/pipeline.store";
import { useManualUploadStore, type StagedGroup } from "@/store/manual-upload.store";
import { ConflictDialog, type ConflictMode } from "@/components/manual-upload/conflict-dialog";
import { readDroppedEntries } from "@/lib/read-dropped-entries";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ExternalLink, FolderUp, Loader2, Settings, Upload, X } from "lucide-react";

export default function ManualUploadPage() {
  const addNotification = usePipelineStore((s) => s.addNotification);

  const {
    ip, files, groups, taskNumbers, busy, busyLabel, logs, deployedDomains,
    conflictOpen, conflictNames, resolutions, pendingStagedDir, pendingAllNames,
    setIp, setFiles, setTaskNumber, setBusy, appendLog, clearLogs, setDeployedDomains,
    openConflict, closeConflict, setResolution, reset,
  } = useManualUploadStore();

  const [dragging, setDragging] = useState(false);
  const [dropping, setDropping] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // webkitdirectory/directory — нестандартные атрибуты, не в типах React,
  // поэтому ставим их вручную через ref вместо JSX-пропов.
  useEffect(() => {
    const el = fileInputRef.current;
    if (!el) return;
    el.setAttribute("webkitdirectory", "");
    el.setAttribute("directory", "");
  }, []);

  function applySelectedFiles(arr: File[]) {
    if (arr.length === 0) return;
    const counts = new Map<string, number>();
    for (const f of arr) {
      const rel = f.webkitRelativePath || f.name;
      const top = rel.split("/")[0];
      counts.set(top, (counts.get(top) ?? 0) + 1);
    }
    const newGroups: StagedGroup[] = Array.from(counts.entries()).map(([name, fileCount]) => ({ name, fileCount }));
    setFiles(arr, newGroups);
  }

  function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    applySelectedFiles(Array.from(fileList));
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
  }

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    dragCounterRef.current += 1;
    setDragging(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDragging(false);
    }
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragging(false);
    if (busy) return;

    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;

    setDropping(true);
    try {
      const dropped = await readDroppedEntries(items);
      if (dropped.length === 0) {
        addNotification("Не удалось прочитать перетащенные файлы", "error");
        return;
      }
      applySelectedFiles(dropped);
    } catch (err) {
      addNotification(err instanceof Error ? err.message : "Ошибка при чтении перетащенных файлов", "error");
    } finally {
      setDropping(false);
    }
  }

  function resetForm() {
    reset();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function startUpload() {
    if (!ip.trim() || files.length === 0) return;
    setBusy(true, "Загружаю файлы на сервер приложения...");
    clearLogs();
    setDeployedDomains([]);

    try {
      const formData = new FormData();
      for (const f of files) {
        formData.append("files", f, f.webkitRelativePath || f.name);
      }
      formData.append("taskNumbers", JSON.stringify(taskNumbers));
      const stageRes = await apiFetch("/api/pipeline/manual-upload/stage", {
        method: "POST",
        body: formData,
      });
      const stageData = (await stageRes.json()) as { stagedDir?: string; names?: string[]; error?: string };
      if (!stageData.stagedDir || !stageData.names) {
        addNotification(stageData.error ?? "Ошибка при подготовке файлов", "error");
        setBusy(false);
        return;
      }

      setBusy(true, "Проверяю, что уже есть на сервере...");
      const checkRes = await apiFetch("/api/pipeline/manual-upload/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: ip.trim(), names: stageData.names }),
      });
      const checkData = (await checkRes.json()) as { results?: Record<string, boolean>; error?: string };
      if (checkData.error) {
        addNotification(checkData.error, "error");
        setBusy(false);
        return;
      }

      const existing = stageData.names.filter((n) => checkData.results?.[n] === true);
      if (existing.length > 0) {
        openConflict(existing, stageData.stagedDir, stageData.names);
        setBusy(false);
        return;
      }

      await commit(
        stageData.stagedDir,
        stageData.names.map((name) => ({ name, mode: "overwrite" as ConflictMode }))
      );
    } catch (err) {
      addNotification(err instanceof Error ? err.message : "Ошибка при загрузке", "error");
      setBusy(false);
    }
  }

  async function commit(stagedDir: string, items: { name: string; mode: ConflictMode }[]) {
    const toDeploy = items.filter((i) => i.mode !== "skip") as { name: string; mode: "overwrite" | "backup" }[];
    if (toDeploy.length === 0) {
      addNotification("Все папки пропущены — заливать нечего", "info");
      setBusy(false);
      resetForm();
      return;
    }

    setBusy(true, "Заливаю на сервер...");
    const code = await runPipelineStream(
      "/api/pipeline/manual-upload/commit",
      (line) => appendLog(line),
      { ip: ip.trim(), stagedDir, items: toDeploy },
      (ev) => {
        if (ev.type === "deployed-domains" && ev.domains) {
          setDeployedDomains(ev.domains);
        }
      }
    );

    setBusy(false);
    if (code === 0) {
      addNotification(`✓ Загружено на сервер: ${toDeploy.length}`, "success");
      resetForm();
    } else {
      addNotification(`Ошибка при заливке (код ${code})`, "error");
    }
  }

  function handleConflictConfirm() {
    if (!pendingStagedDir) return;
    const items = pendingAllNames.map((name) => ({
      name,
      mode: conflictNames.includes(name) ? resolutions[name] : ("overwrite" as ConflictMode),
    }));
    closeConflict();
    void commit(pendingStagedDir, items);
  }

  const canUpload = ip.trim().length > 0 && files.length > 0 && !busy;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="flex-shrink-0 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-sm px-6 py-3.5">
        <div className="relative flex items-center justify-between max-w-[1800px] mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-600/20 border border-orange-500/30 flex items-center justify-center">
              <FolderUp className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-100">Ручники</h1>
              <p className="text-xs text-slate-500">Загрузка папок на сервер по SFTP</p>
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
          <div className="border border-orange-500/30 bg-orange-900/10 rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-500">IP сервера</span>
                <input
                  type="text"
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  placeholder="напр. 178.62.221.223"
                  disabled={busy}
                  className="w-56 text-xs text-slate-200 font-mono bg-slate-950/60 border border-slate-700/40 rounded-lg px-2.5 py-2 focus:outline-none focus:border-orange-500/60 disabled:opacity-50"
                />
              </label>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                disabled={busy}
                onChange={(e) => handleFilesSelected(e.target.files)}
                className="hidden"
              />

              <Button
                size="sm"
                disabled={!canUpload}
                onClick={startUpload}
                className="bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-40 h-9 text-xs gap-1.5 ml-auto"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {busy ? busyLabel : "Загрузить на сервер"}
              </Button>

              {!busy && groups.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={resetForm}
                  className="text-slate-500 hover:text-slate-300 h-9 text-xs gap-1.5"
                >
                  <X className="w-3.5 h-3.5" />
                  Очистить
                </Button>
              )}
            </div>

            <div
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !busy && fileInputRef.current?.click()}
              className={cn(
                "flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed py-8 cursor-pointer transition-colors",
                dragging
                  ? "border-orange-400 bg-orange-500/10"
                  : "border-slate-700/50 hover:border-slate-600 hover:bg-slate-800/30"
              )}
            >
              {dropping ? (
                <>
                  <Loader2 className="w-5 h-5 text-orange-400 animate-spin" />
                  <p className="text-xs text-orange-400">Читаю перетащенные папки...</p>
                </>
              ) : (
                <>
                  <FolderUp className={cn("w-5 h-5", dragging ? "text-orange-400" : "text-slate-500")} />
                  <p className={cn("text-xs", dragging ? "text-orange-300" : "text-slate-400")}>
                    Перетащи папку(-и) сюда
                  </p>
                  <p className="text-xs text-slate-600">или нажми, чтобы выбрать через диалог</p>
                </>
              )}
            </div>

            {deployedDomains.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                  Загружено на сервер · кэш очищен
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {deployedDomains.map((domain) => (
                    <a
                      key={domain}
                      href={`https://${domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 bg-emerald-900/20 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-xs font-mono text-emerald-300 hover:text-emerald-200 hover:bg-emerald-900/30 transition-colors"
                    >
                      {domain}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {groups.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                  Выбрано папок: {groups.length}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {groups.map((g) => (
                    <div
                      key={g.name}
                      className="flex items-center justify-between gap-2 bg-slate-800/60 rounded-lg px-3 py-1.5 border border-slate-700/40"
                    >
                      <span className="text-xs font-mono text-slate-300 truncate">{g.name}</span>
                      <span className="text-xs text-slate-500 shrink-0">{g.fileCount} файл(ов)</span>
                      <input
                        type="text"
                        value={taskNumbers[g.name] ?? ""}
                        onChange={(e) => setTaskNumber(g.name, e.target.value)}
                        placeholder="WPROMO-93945"
                        disabled={busy}
                        className="w-32 text-xs text-slate-200 font-mono bg-slate-950/60 border border-slate-700/40 rounded-md px-2 py-1 focus:outline-none focus:border-orange-500/60 disabled:opacity-50 shrink-0"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {logs.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Логи</p>
                <ScrollArea className="h-64 bg-slate-950/60 rounded-lg border border-slate-700/40 p-3">
                  <div className="space-y-0.5">
                    {logs.map((line, i) => (
                      <p
                        key={i}
                        className={cn(
                          "text-xs font-mono leading-relaxed",
                          line.toLowerCase().includes("err") || line.includes("[!")
                            ? "text-red-400"
                            : line.includes("[OK]") || line.includes("✓")
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
        </div>
      </main>

      <ConflictDialog
        open={conflictOpen}
        onOpenChange={(open) => { if (!open) closeConflict(); }}
        names={conflictNames}
        resolutions={resolutions}
        onResolutionChange={setResolution}
        onConfirm={handleConflictConfirm}
      />
    </div>
  );
}
