import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

export type ConflictMode = "overwrite" | "backup" | "skip";

const OPTIONS: { mode: ConflictMode; label: string; hint: string }[] = [
  { mode: "overwrite", label: "1. Просто залить", hint: "старое содержимое на сервере будет удалено" },
  { mode: "backup", label: "2. Бэкап и залить", hint: "скачает текущее в <имя>.old.zip, потом зальёт новое" },
  { mode: "skip", label: "3. Отменить", hint: "эта папка не будет загружена" },
];

export function ConflictDialog({
  open,
  onOpenChange,
  names,
  resolutions,
  onResolutionChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  names: string[];
  resolutions: Record<string, ConflictMode>;
  onResolutionChange: (name: string, mode: ConflictMode) => void;
  onConfirm: () => void;
}) {
  const allChosen = names.every((n) => resolutions[n]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>На сервере уже есть такие папки</DialogTitle>
          <DialogDescription>
            Для каждой выбери, что делать — залить поверх, сделать бэкап или пропустить.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-96 overflow-y-auto">
          {names.map((name) => (
            <div key={name} className="border border-slate-700/50 rounded-lg p-3 space-y-2">
              <p className="text-xs font-mono text-amber-400">{name}</p>
              <div className="grid grid-cols-1 gap-1.5">
                {OPTIONS.map((opt) => (
                  <label
                    key={opt.mode}
                    className={cn(
                      "flex items-start gap-2 text-xs rounded-md px-2 py-1.5 cursor-pointer border",
                      resolutions[name] === opt.mode
                        ? "border-violet-500/60 bg-violet-500/10 text-slate-200"
                        : "border-slate-700/40 text-slate-400 hover:border-slate-600"
                    )}
                  >
                    <input
                      type="radio"
                      name={`resolution-${name}`}
                      checked={resolutions[name] === opt.mode}
                      onChange={() => onResolutionChange(name, opt.mode)}
                      className="mt-0.5 accent-violet-500"
                    />
                    <span>
                      <span className="font-medium">{opt.label}</span>
                      <span className="block text-slate-500">{opt.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-600 text-slate-300 hover:bg-slate-700 h-8 text-xs"
          >
            Отмена
          </Button>
          <Button
            size="sm"
            disabled={!allChosen}
            onClick={onConfirm}
            className="bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 h-8 text-xs"
          >
            Продолжить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
