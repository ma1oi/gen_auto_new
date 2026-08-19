// Формат дат в именах папок пайплайна: DD-MM-YYYY (см. gen_auto/*.py, manual/route.ts).

export function formatDateTag(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

export function todayDateTag(): string {
  return formatDateTag(new Date());
}

/** Последние n дней, от сегодня назад. */
export function lastNDateTags(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(formatDateTag(d));
    d.setDate(d.getDate() - 1);
  }
  return out;
}
