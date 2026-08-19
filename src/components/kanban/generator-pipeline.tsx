"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePipelineStore, runPipelineStream } from "@/store/pipeline.store";
import { AUTH_ERROR_CODE, type WhitegenTask, type DomainIssue, type ImageIssue, type AtIssue, type PreviewTask, type PipelineEvent } from "@/types";
import { apiFetch } from "@/lib/api-client";
import { PipelineHeader } from "./pipeline/pipeline-header";
import { PipelineActions } from "./pipeline/pipeline-actions";
import { ManualResendPanel } from "./pipeline/manual-resend-panel";
import { PreviewTaskList } from "./pipeline/preview-task-list";
import { CheckIssuesPanel } from "./pipeline/check-issues-panel";
import { WhitegenTasksPanel } from "./pipeline/whitegen-tasks-panel";
import { DeployStatusPanel } from "./pipeline/deploy-status-panel";
import { VerifyResultsPanel, type VerifyResult } from "./pipeline/verify-results-panel";
import { PipelineLogs } from "./pipeline/pipeline-logs";
import { ClearConfirmDialog } from "./pipeline/clear-confirm-dialog";

export function GeneratorPipeline() {
  const {
    step, logs, isRunning, whitegenTasks, domainIssues, imageIssues, atIssues, previewTasks, deployStatuses,
    setStep, appendLog, clearLogs, setRunning,
    setWhitegenTasks, setDomainIssues, setImageIssues, setAtIssues, addNotification, resetPipeline,
    setPreviewTasks, updatePreviewTopic, updatePreviewDomain, clearPreviewTasks,
    setDeployQueue, updateDeployStatus, removeDeployStatus, clearDeployStatuses,
  } = usePipelineStore();

  const [polling, setPolling] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [removingCreated, setRemovingCreated] = useState(false);
  const [showManualResend, setShowManualResend] = useState(false);
  const [manualKeysText, setManualKeysText] = useState("");
  const [manualRangeFrom, setManualRangeFrom] = useState("");
  const [manualRangeTo, setManualRangeTo] = useState("");
  const [checking, setChecking] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixingAt, setFixingAt] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResults, setVerifyResults] = useState<VerifyResult[]>([]);
  const [clearingDb, setClearingDb] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [regeneratingKeys, setRegeneratingKeys] = useState<Set<string>>(new Set());
  const logsAutoScrollRef = useRef(true);
  const logsViewportRef = useRef<HTMLDivElement | null>(null);

  const handleLogsScroll = useCallback(() => {
    const el = logsViewportRef.current;
    if (!el) return;
    logsAutoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }, []);

  const logsScrollAreaRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (logsViewportRef.current) {
        logsViewportRef.current.removeEventListener("scroll", handleLogsScroll);
        logsViewportRef.current = null;
      }
      const viewport = node?.querySelector<HTMLDivElement>("[data-radix-scroll-area-viewport]") ?? null;
      logsViewportRef.current = viewport;
      viewport?.addEventListener("scroll", handleLogsScroll);
    },
    [handleLogsScroll]
  );

  useEffect(() => {
    const viewport = logsViewportRef.current;
    if (logsAutoScrollRef.current && viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    }
  }, [logs.length]);

  async function loadPreview() {
    setLoadingPreview(true);
    setWhitegenTasks([]);
    try {
      const res = await apiFetch("/api/pipeline/preview");
      const data = (await res.json()) as { tasks: PreviewTask[] };
      setPreviewTasks(data.tasks ?? []);
      if (!data.tasks?.length) {
        addNotification("Нет новых задач для генерации", "info");
      }
    } catch {
      addNotification("Ошибка при загрузке задач", "error");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleRemoveCreated() {
    setRemovingCreated(true);
    try {
      const res = await apiFetch("/api/pipeline/clear-deployed", { method: "POST" });
      const data = (await res.json()) as { deleted: number; keys: string[] };
      const removedKeys = new Set((data.keys ?? []).map((k) => k.toUpperCase()));
      if (removedKeys.size > 0) {
        setPreviewTasks(previewTasks.filter((t) => !removedKeys.has(t.key.toUpperCase())));
        setWhitegenTasks(whitegenTasks.filter((t) => !removedKeys.has(t.number.toUpperCase())));
      }
      addNotification(
        removedKeys.size > 0 ? `Убрано готовых задач: ${removedKeys.size}` : "Готовых задач не найдено",
        removedKeys.size > 0 ? "success" : "info"
      );
    } catch {
      addNotification("Ошибка при очистке готовых задач", "error");
    } finally {
      setRemovingCreated(false);
    }
  }

  function addManualRange() {
    const from = parseInt(manualRangeFrom, 10);
    const to = parseInt(manualRangeTo, 10);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
      addNotification("Некорректный диапазон", "error");
      return;
    }
    const rangeKeys: string[] = [];
    for (let n = from; n <= to; n++) rangeKeys.push(`WPROMO-${n}`);
    setManualKeysText((prev) => {
      const existing = prev.split(/[\s,]+/).filter(Boolean);
      return Array.from(new Set([...existing, ...rangeKeys])).join("\n");
    });
    setManualRangeFrom("");
    setManualRangeTo("");
  }

  async function handleManualResend() {
    const keys = Array.from(
      new Set((manualKeysText.match(/WPROMO-\d+/gi) ?? []).map((k) => k.toUpperCase()))
    );
    if (keys.length === 0) {
      addNotification("Не найдено ни одного ключа WPROMO-XXXXX", "error");
      return;
    }
    clearLogs();
    setRunning(true);

    const code = await runPipelineStream(
      "/api/pipeline/resend",
      (line) => { if (line) appendLog(line); },
      { keys }
    );

    setRunning(false);
    if (code === 0) {
      setStep("waiting");
      addNotification(`✓ Отправлено в генератор: ${keys.length}`, "success");
      setManualKeysText("");
      await checkStatus();
    } else {
      addNotification("Ошибка при ручной отправке", "error");
    }
  }

  async function confirmGenerate() {
    if (previewTasks.length === 0) return;
    clearLogs();
    setStep("generating");
    setRunning(true);

    const code = await runPipelineStream(
      "/api/pipeline/generate",
      (line) => { if (line) appendLog(line); },
      { tasks: previewTasks }
    );

    setRunning(false);
    if (code === 0) {
      clearPreviewTasks();
      setStep("waiting");
      addNotification("✓ Задачи отправлены в whitegen.org", "success");
    } else if (code === AUTH_ERROR_CODE) {
      addNotification("Whitegen отклонил авторизацию — обновите Cookie в Настройках → Whitegen", "error");
    } else {
      addNotification(`Ошибка при отправке в генератор (код ${code})`, "error");
    }
  }

  async function runDeploy() {
    clearLogs();
    clearDeployStatuses();
    setStep("deploying");
    setRunning(true);

    const code = await runPipelineStream(
      "/api/pipeline/deploy",
      (line) => { if (line) appendLog(line); },
      undefined,
      (ev: PipelineEvent) => {
        if (ev.type === "deploy-queue" && ev.tasks) {
          setDeployQueue(ev.tasks);
        }
        if (ev.type === "deploy-status" && ev.key) {
          // "exists" — статус только upload-status событий (Я.Диск), сюда не
          // приходит, но общий тип PipelineEvent.status его тоже допускает
          updateDeployStatus(ev.key, ev.status && ev.status !== "exists" ? ev.status : "error", ev.reason);
        }
      }
    );

    setRunning(false);
    if (code === 0) {
      setStep("done");
      addNotification("✓ Деплой завершён", "success");
    } else {
      addNotification(`Ошибка на шаге "deploying" (код ${code})`, "error");
    }
  }

  async function checkStatus(): Promise<WhitegenTask[]> {
    setPolling(true);
    try {
      const res = await apiFetch("/api/pipeline/status");
      const data = (await res.json()) as { tasks: WhitegenTask[]; error?: string };
      setWhitegenTasks(data.tasks ?? []);
      if (data.error) {
        addNotification(`Ошибка Whitegen: ${data.error} — проверьте Whitegen Cookie в настройках`, "error");
      }
      return data.tasks ?? [];
    } finally {
      setPolling(false);
    }
  }

  // Пока пайплайн ждёт генератор — сами периодически спрашиваем статус,
  // вместо того чтобы заставлять нажимать "Проверить статус" руками.
  // Останавливаемся, как только все задачи готовы, или когда ушли из "waiting".
  useEffect(() => {
    if (step !== "waiting") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      const tasks = await checkStatus();
      if (cancelled) return;
      const finished = tasks.length > 0 && tasks.every((t) => t.status === "finished");
      if (!finished) {
        timer = setTimeout(tick, 15000);
      }
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function handleDownload() {
    clearLogs();
    setStep("downloading");
    setRunning(true);

    const extracted: { keys: string[] | null } = { keys: null };
    const code = await runPipelineStream(
      "/api/pipeline/download",
      (line) => { if (line) appendLog(line); },
      undefined,
      (ev) => {
        if (ev.type === "extracted-keys") extracted.keys = ev.keys ?? [];
      }
    );

    setRunning(false);
    if (code !== 0) {
      addNotification(`Ошибка при скачивании (код ${code})`, "error");
      return;
    }

    // проверяем на "domain.com" только то, что реально скачали и
    // распаковали в этот раз — а не вообще все задачи в папке генератора
    if (extracted.keys && extracted.keys.length === 0) {
      setStep("checking");
      addNotification("Новых задач не было — проверять нечего", "info");
      return;
    }

    await runDomainCheck(extracted.keys ?? undefined);
  }

  async function runDomainCheck(keys?: string[]) {
    setChecking(true);
    setStep("checking");
    try {
      const url = keys && keys.length > 0 ? `/api/pipeline/check?keys=${encodeURIComponent(keys.join(","))}` : "/api/pipeline/check";
      const res = await apiFetch(url);
      const data = (await res.json()) as { issues: DomainIssue[]; imageIssues: ImageIssue[]; atIssues: AtIssue[]; genDir: string | null };
      setDomainIssues(data.issues);
      setImageIssues(data.imageIssues ?? []);
      setAtIssues(data.atIssues ?? []);
      if (data.issues.length === 0 && (data.atIssues ?? []).length === 0) {
        addNotification("✓ domain.com не найден — можно чистить", "success");
      } else {
        if (data.issues.length > 0) addNotification(`⚠ domain.com найден в ${data.issues.length} задачах`, "error");
        if ((data.atIssues ?? []).length > 0) addNotification(`⚠ [at]/(at) найден в ${data.atIssues.length} задачах`, "error");
      }
      if ((data.imageIssues ?? []).length > 0) {
        addNotification(`⚠ Битые картинки в ${data.imageIssues.length} задачах`, "error");
      }
    } catch {
      addNotification("Ошибка при проверке архивов", "error");
    } finally {
      setChecking(false);
    }
  }

  async function handleFixAt() {
    const atKeys = atIssues.map((i) => i.taskKey);
    if (!atKeys.length) return;
    setFixingAt(true);
    try {
      const res = await apiFetch("/api/pipeline/fix-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atKeys }),
      });
      const data = await res.json() as { atFixed: string[]; errors: string[] };
      if (data.errors?.length) addNotification(`⚠ Ошибки: ${data.errors.join(", ")}`, "error");
      if (data.atFixed?.length) {
        addNotification(`✓ [at]/(at) исправлен в ${data.atFixed.length} задачах`, "success");
        setAtIssues([]);
      }
    } catch {
      addNotification("Ошибка при исправлении [at]", "error");
    } finally {
      setFixingAt(false);
    }
  }

  async function handleRegenerate(source: "domain" | "image" | "all" = "all") {
    const domainKeys = domainIssues.map((i) => i.taskKey);
    const imageKeys = imageIssues.map((i) => i.taskKey);
    const atKeys = atIssues.map((i) => i.taskKey);
    const keys = source === "domain"
      ? domainKeys
      : source === "image"
      ? imageKeys
      : [...new Set([...domainKeys, ...imageKeys, ...atKeys])];
    clearLogs();
    setRunning(true);

    const code = await runPipelineStream(
      "/api/pipeline/resend",
      (line) => { if (line) appendLog(line); },
      { keys }
    );

    setRunning(false);
    if (code === 0) {
      setStep("waiting");
      setDomainIssues([]);
      setImageIssues([]);
      setAtIssues([]);
      addNotification("✓ Задачи отправлены в генератор повторно", "success");
      await checkStatus();
    } else {
      addNotification("Ошибка при повторной отправке", "error");
    }
  }

  async function handleRegenerateTask(task: WhitegenTask) {
    const key = task.number;
    setRegeneratingKeys((prev) => new Set(prev).add(key));

    if (task.status === "failed") {
      try {
        const res = await apiFetch("/api/pipeline/retry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: task.id }),
        });
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (data.ok) {
          setStep("waiting");
          addNotification(`✓ ${key} отправлена на повтор`, "success");
          await checkStatus();
        } else {
          addNotification(`Ошибка при повторе ${key}${data.error ? `: ${data.error}` : ""}`, "error");
        }
      } catch {
        addNotification(`Ошибка при повторе ${key}`, "error");
      } finally {
        setRegeneratingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
      return;
    }

    clearLogs();
    setRunning(true);

    const code = await runPipelineStream(
      "/api/pipeline/resend",
      (line) => { if (line) appendLog(line); },
      { keys: [key] }
    );

    setRunning(false);
    setRegeneratingKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    if (code === 0) {
      setStep("waiting");
      removeDeployStatus(key);
      addNotification(`✓ ${key} отправлена в генератор повторно`, "success");
      await checkStatus();
    } else {
      addNotification(`Ошибка при повторной отправке ${key}`, "error");
    }
  }

  async function handleFixDomain() {
    const keys = domainIssues.map((i) => i.taskKey);
    if (!keys.length) return;
    setFixing(true);
    try {
      const res = await apiFetch("/api/pipeline/fix-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys }),
      });
      const data = await res.json() as { fixed: string[]; errors: string[] };
      if (data.errors?.length) {
        addNotification(`⚠ Ошибки: ${data.errors.join(", ")}`, "error");
      }
      if (data.fixed?.length) {
        addNotification(`✓ Исправлено: ${data.fixed.length} задач`, "success");
        setDomainIssues([]);
      }
    } catch {
      addNotification("Ошибка при исправлении файлов", "error");
    } finally {
      setFixing(false);
    }
  }

  async function handleVerify() {
    const domains = whitegenTasks.map((t) => t.domain).filter(Boolean);
    setVerifying(true);
    setVerifyResults([]);
    try {
      const res = await apiFetch("/api/pipeline/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domains }),
      });
      const data = await res.json();
      setVerifyResults(data.results ?? []);
      const failed = (data.results ?? []).filter((r: { ok: boolean }) => !r.ok).length;
      if (failed === 0) addNotification("✓ Все сайты залились корректно", "success");
      else addNotification(`⚠ ${failed} сайт(ов) вернули Coming Soon или ошибку`, "error");
    } catch {
      addNotification("Ошибка при проверке сайтов", "error");
    } finally {
      setVerifying(false);
    }
  }

  async function handleClearDeployed() {
    setClearingDb(true);
    try {
      const res = await apiFetch("/api/pipeline/clear-deployed", { method: "POST" });
      const data = (await res.json()) as { deleted: number; keys: string[] };
      const removedKeys = new Set((data.keys ?? []).map((k) => k.toUpperCase()));
      if (removedKeys.size > 0) {
        setPreviewTasks(previewTasks.filter((t) => !removedKeys.has(t.key.toUpperCase())));
        setWhitegenTasks(whitegenTasks.filter((t) => !removedKeys.has(t.number.toUpperCase())));
      }
      addNotification(`✓ Из БД удалено задеплоенных задач: ${data.deleted}`, "success");
    } catch {
      addNotification("Ошибка при очистке БД", "error");
    } finally {
      setClearingDb(false);
      setShowClearConfirm(false);
    }
  }

  const wgIdMap = new Map(whitegenTasks.map((t) => [t.number.toUpperCase(), t.id]));
  const allFinished = whitegenTasks.length > 0 && whitegenTasks.every((t) => t.status === "finished");
  const hasAnythingToReset =
    step !== "idle" || whitegenTasks.length > 0 || previewTasks.length > 0 ||
    domainIssues.length > 0 || imageIssues.length > 0 || atIssues.length > 0 ||
    logs.length > 0 || Object.keys(deployStatuses).length > 0;

  return (
    <div className="mb-5 border border-violet-500/30 bg-violet-900/10 rounded-xl overflow-hidden">
      <PipelineHeader
        step={step}
        previewCount={previewTasks.length}
        isBusy={isRunning || checking}
        hasDomainIssues={domainIssues.length > 0}
      />

      <div className="border-t border-violet-500/20 p-4 space-y-4">
        <PipelineActions
          step={step}
          isRunning={isRunning}
          checking={checking}
          loadingPreview={loadingPreview}
          polling={polling}
          verifying={verifying}
          clearingDb={clearingDb}
          previewCount={previewTasks.length}
          hasAnythingToReset={hasAnythingToReset}
          onLoadPreview={loadPreview}
          onConfirmGenerate={confirmGenerate}
          onCheckStatus={checkStatus}
          onDownload={handleDownload}
          onDeploy={runDeploy}
          onVerify={handleVerify}
          onShowClearConfirm={() => setShowClearConfirm(true)}
          onToggleManualResend={() => setShowManualResend((v) => !v)}
          onReset={resetPipeline}
        />

        {showManualResend && (
          <ManualResendPanel
            isRunning={isRunning}
            manualKeysText={manualKeysText}
            manualRangeFrom={manualRangeFrom}
            manualRangeTo={manualRangeTo}
            onRangeFromChange={setManualRangeFrom}
            onRangeToChange={setManualRangeTo}
            onAddRange={addManualRange}
            onKeysTextChange={setManualKeysText}
            onSubmit={handleManualResend}
          />
        )}

        {previewTasks.length > 0 && step === "idle" && whitegenTasks.length === 0 && (
          <PreviewTaskList
            previewTasks={previewTasks}
            loadingPreview={loadingPreview}
            removingCreated={removingCreated}
            onTopicChange={updatePreviewTopic}
            onDomainChange={updatePreviewDomain}
            onRemoveCreated={handleRemoveCreated}
            onReload={loadPreview}
          />
        )}

        {step === "checking" && (
          <CheckIssuesPanel
            checking={checking}
            domainIssues={domainIssues}
            atIssues={atIssues}
            imageIssues={imageIssues}
            wgIdMap={wgIdMap}
            isRunning={isRunning}
            fixing={fixing}
            fixingAt={fixingAt}
            onFixDomain={handleFixDomain}
            onFixAt={handleFixAt}
            onRegenerate={handleRegenerate}
          />
        )}

        {whitegenTasks.length > 0 && (
          <WhitegenTasksPanel
            whitegenTasks={whitegenTasks}
            allFinished={allFinished}
            isRunning={isRunning}
            regeneratingKeys={regeneratingKeys}
            onRegenerateTask={handleRegenerateTask}
          />
        )}

        {Object.keys(deployStatuses).length > 0 && <DeployStatusPanel deployStatuses={deployStatuses} />}

        {verifyResults.length > 0 && <VerifyResultsPanel results={verifyResults} />}

        {logs.length > 0 && <PipelineLogs logs={logs} scrollAreaRef={logsScrollAreaRef} />}
      </div>

      <ClearConfirmDialog
        open={showClearConfirm}
        onOpenChange={setShowClearConfirm}
        clearingDb={clearingDb}
        onConfirm={handleClearDeployed}
      />
    </div>
  );
}
