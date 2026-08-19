import { cn } from "@/lib/utils";
import type { YaDiskDay } from "@/app/api/pipeline/yadisk-upload/list/route";

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function parseDateTag(date: string): Date {
  const [dd, mm, yyyy] = date.split("-").map(Number);
  return new Date(yyyy, mm - 1, dd);
}

export function DayTabs({
  days,
  activeDate,
  onSelect,
}: {
  days: YaDiskDay[];
  activeDate: string;
  onSelect: (date: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {days.map((day, i) => {
        const d = parseDateTag(day.date);
        const active = day.date === activeDate;
        const [dd, mm] = day.date.split("-");
        return (
          <button
            key={day.date}
            onClick={() => onSelect(day.date)}
            className={cn(
              "flex flex-col items-center px-3 py-1.5 rounded-lg border text-xs min-w-[64px] transition-colors",
              active
                ? "border-sky-500/60 bg-sky-500/10 text-sky-300"
                : "border-slate-700/40 text-slate-400 hover:border-slate-600 hover:bg-slate-800/40"
            )}
          >
            <span className="font-medium">{i === 0 ? "Сегодня" : WEEKDAYS[d.getDay()]}</span>
            <span className="text-slate-500">{dd}.{mm}</span>
            <span className={cn("mt-0.5", day.items.length > 0 ? "text-slate-500" : "text-slate-700")}>
              {day.items.length}
            </span>
          </button>
        );
      })}
    </div>
  );
}
