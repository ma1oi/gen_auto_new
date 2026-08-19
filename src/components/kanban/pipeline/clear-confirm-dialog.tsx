import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

export function ClearConfirmDialog({
  open,
  onOpenChange,
  clearingDb,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clearingDb: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Очистить БД от готовых задач?</DialogTitle>
          <DialogDescription>
            Все задеплоенные (готовые) задачи будут удалены из локальной БД пайплайна. Это действие необратимо.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            size="sm"
            variant="outline"
            disabled={clearingDb}
            onClick={() => onOpenChange(false)}
            className="border-slate-600 text-slate-300 hover:bg-slate-700 h-8 text-xs"
          >
            Отмена
          </Button>
          <Button
            size="sm"
            disabled={clearingDb}
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-500 text-white h-8 text-xs gap-1.5"
          >
            {clearingDb ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            {clearingDb ? "Удаляю..." : "Да, удалить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
