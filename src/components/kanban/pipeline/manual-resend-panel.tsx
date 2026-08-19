import { Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ManualResendPanel({
  isRunning,
  manualKeysText,
  manualRangeFrom,
  manualRangeTo,
  onRangeFromChange,
  onRangeToChange,
  onAddRange,
  onKeysTextChange,
  onSubmit,
}: {
  isRunning: boolean;
  manualKeysText: string;
  manualRangeFrom: string;
  manualRangeTo: string;
  onRangeFromChange: (v: string) => void;
  onRangeToChange: (v: string) => void;
  onAddRange: () => void;
  onKeysTextChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const foundCount = new Set((manualKeysText.match(/WPROMO-\d+/gi) ?? []).map((k) => k.toUpperCase())).size;

  return (
    <div className="space-y-2 border border-violet-500/30 bg-violet-900/10 rounded-lg p-3">
      <p className="text-xs font-medium text-violet-400">
        Переделать задачи по ключам — отправляет их в генератор заново
      </p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          placeholder="от (напр. 93830)"
          value={manualRangeFrom}
          onChange={(e) => onRangeFromChange(e.target.value)}
          className="w-36 text-xs text-slate-200 font-mono bg-slate-950/60 border border-slate-700/40 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500/60"
        />
        <span className="text-xs text-slate-500">—</span>
        <input
          type="number"
          placeholder="до (напр. 93859)"
          value={manualRangeTo}
          onChange={(e) => onRangeToChange(e.target.value)}
          className="w-36 text-xs text-slate-200 font-mono bg-slate-950/60 border border-slate-700/40 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500/60"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={onAddRange}
          className="border-slate-600 text-slate-300 hover:bg-slate-700 h-8 text-xs"
        >
          Добавить диапазон в список
        </Button>
      </div>
      <textarea
        value={manualKeysText}
        onChange={(e) => onKeysTextChange(e.target.value)}
        placeholder="WPROMO-93830&#10;WPROMO-93831&#10;... (можно вставить хоть ссылки на задачи — ключи вида WPROMO-XXXXX найдутся сами)"
        className="w-full h-32 text-xs text-slate-200 font-mono leading-relaxed bg-slate-950/60 border border-slate-700/40 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:border-violet-500/60"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">Найдено ключей: {foundCount}</span>
        <Button
          size="sm"
          disabled={isRunning}
          onClick={onSubmit}
          className="bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 h-8 text-xs gap-1.5"
        >
          {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
          Отправить в генератор
        </Button>
      </div>
    </div>
  );
}
