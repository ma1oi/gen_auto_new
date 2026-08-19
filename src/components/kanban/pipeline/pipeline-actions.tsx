import { cn } from "@/lib/utils";
import { Zap, Download, Upload, RefreshCw, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PipelineStep } from "@/types";

export function PipelineActions({
  step,
  isRunning,
  checking,
  loadingPreview,
  polling,
  verifying,
  clearingDb,
  previewCount,
  hasAnythingToReset,
  onLoadPreview,
  onConfirmGenerate,
  onCheckStatus,
  onDownload,
  onDeploy,
  onVerify,
  onShowClearConfirm,
  onToggleManualResend,
  onReset,
}: {
  step: PipelineStep;
  isRunning: boolean;
  checking: boolean;
  loadingPreview: boolean;
  polling: boolean;
  verifying: boolean;
  clearingDb: boolean;
  previewCount: number;
  hasAnythingToReset: boolean;
  onLoadPreview: () => void;
  onConfirmGenerate: () => void;
  onCheckStatus: () => void;
  onDownload: () => void;
  onDeploy: () => void;
  onVerify: () => void;
  onShowClearConfirm: () => void;
  onToggleManualResend: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {previewCount === 0 ? (
        <Button
          size="sm"
          disabled={isRunning || step !== "idle" || loadingPreview}
          onClick={onLoadPreview}
          className="bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 h-8 text-xs gap-1.5"
        >
          {loadingPreview ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
          {loadingPreview ? "Проверяю..." : "1. Проверить задачи"}
        </Button>
      ) : (
        <Button
          size="sm"
          disabled={isRunning || step !== "idle"}
          onClick={onConfirmGenerate}
          className="bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 h-8 text-xs gap-1.5"
        >
          {step === "generating" && isRunning
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <Zap className="w-3 h-3" />}
          {step === "generating" && isRunning
            ? "Генерирую..."
            : `1. Запустить генерацию (${previewCount})`}
        </Button>
      )}

      <Button
        size="sm"
        variant="outline"
        disabled={polling || (step !== "waiting" && step !== "idle")}
        onClick={onCheckStatus}
        className="border-slate-600 text-slate-300 hover:bg-slate-700 h-8 text-xs gap-1.5 disabled:opacity-40"
      >
        <RefreshCw className={cn("w-3 h-3", polling && "animate-spin")} />
        Проверить статус
      </Button>

      <Button
        size="sm"
        disabled={isRunning || checking || (step !== "waiting" && step !== "idle")}
        onClick={onDownload}
        className="bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 h-8 text-xs gap-1.5"
      >
        <Download className="w-3 h-3" />
        {step === "downloading" && isRunning ? "Скачиваю..." : "2. Скачать + Распаковать"}
      </Button>

      <Button
        size="sm"
        disabled={isRunning}
        onClick={onDeploy}
        className="bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 h-8 text-xs gap-1.5"
      >
        <Upload className="w-3 h-3" />
        {step === "deploying" && isRunning ? "Деплою..." : "4. Задеплоить"}
      </Button>

      {step === "done" && (
        <Button
          size="sm"
          disabled={verifying}
          onClick={onVerify}
          className="bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40 h-8 text-xs gap-1.5"
        >
          <ShieldCheck className={cn("w-3 h-3", verifying && "animate-pulse")} />
          {verifying ? "Проверяю..." : "5. Проверить сайты"}
        </Button>
      )}

      <Button
        size="sm"
        variant="outline"
        disabled={isRunning || clearingDb}
        onClick={onShowClearConfirm}
        className="border-red-500/30 text-red-400 hover:bg-red-500/10 h-8 text-xs gap-1.5 ml-auto"
      >
        {clearingDb ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
        Очистить БД от готовых
      </Button>

      <Button
        size="sm"
        variant="outline"
        disabled={isRunning}
        onClick={onToggleManualResend}
        className="border-violet-500/30 text-violet-400 hover:bg-violet-500/10 h-8 text-xs gap-1.5"
      >
        <RefreshCw className="w-3 h-3" />
        Переделать по ключам
      </Button>

      {hasAnythingToReset && (
        <Button
          size="sm"
          variant="ghost"
          disabled={isRunning}
          onClick={onReset}
          className="text-slate-500 hover:text-slate-300 h-8 text-xs"
        >
          Сбросить
        </Button>
      )}
    </div>
  );
}
