import { appendFileSync, mkdirSync } from "fs";
import path from "path";
import { todayDateTag } from "./date-tag";

// Прогресс-строки, которые полезны в живой UI-панели (видно, что процесс не
// завис), но в постоянном файле только раздувают лог — следующая строка того
// же шага и так несёт всю нужную информацию. Ключ — source из appendPipelineLog.
const NOISE_PATTERNS: Record<string, RegExp[]> = {
  download: [
    /^Looking for \S+\.\.\.$/, // дублирует следующую "found id=..." строку
    /^📦\s/, // дублирует следующую "✓ распакован →" строку
  ],
  deploy: [
    /^→\s/, // "→ domain.com" — сама задача уже видна по итоговому [OK]/[ERR]
    /^\s*\[i\]/, // "папка не найдена — создаю"
    /^\s*Загрузка файлов/,
    /^\s*загружен:/, // по файлу на каждую строку — шумно, важен только итог
  ],
};
NOISE_PATTERNS["manual-upload/commit"] = NOISE_PATTERNS.deploy;

function isNoise(source: string, message: string): boolean {
  return (NOISE_PATTERNS[source] ?? []).some((re) => re.test(message));
}

// Постоянный лог всех пайплайн-операций (генерация, деплой, ручники и т.д.) —
// сокращённая версия того, что стримится в UI-панель "Логи" (см. isNoise),
// с указанием jira-пользователя, инициировавшего действие, и не пропадает
// при перезагрузке вкладки. Один файл на день, как и датированные папки
// gen_auto/*_DD-MM-YYYY.
export function appendPipelineLog(source: string, type: string, message: string, user?: string): void {
  if (type !== "log" && type !== "error") return;
  const genAutoDir = process.env.GEN_AUTO_DIR ?? path.join(process.cwd(), "gen_auto");
  const dir = path.join(genAutoDir, "logs");
  try {
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${todayDateTag()}.log`);
    const time = new Date().toTimeString().slice(0, 8);
    const level = type === "error" ? "ERR" : "LOG";
    const who = user?.trim() || "-";
    for (const line of message.split("\n")) {
      if (!line.trim() || isNoise(source, line)) continue;
      appendFileSync(file, `[${time}] [${who}] [${source}] [${level}] ${line}\n`);
    }
  } catch {
    // логирование в файл — best effort, не должно ронять сам пайплайн
  }
}
