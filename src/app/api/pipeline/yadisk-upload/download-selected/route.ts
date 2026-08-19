import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { archiveBaseName } from "@/lib/yadisk-naming";

interface SelectedItem {
  date: string;
  name: string;
  type: "generator" | "manual" | "manual-backup" | "manual-archive";
}

function zipStagingDir(stagingDir: string, destZipPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("zip", ["-rXq", destZipPath, "."], { cwd: stagingDir });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`zip завершился с кодом ${code}: ${stderr}`));
    });
  });
}

// Собирает один общий архив из нескольких выбранных пунктов "Я.Диска".
// Вместо копирования файлов (может быть много и тяжело) кладём в staging-
// папку symlink на каждый источник под нужным именем и один раз вызываем
// `zip -r` — Info-ZIP по умолчанию разыменовывает symlink'и (и на файлы, и на
// папки), так что в архиве оказываются настоящие данные, а не битые ссылки.
export async function POST(request: Request) {
  let items: SelectedItem[];
  try {
    const body = (await request.json()) as { items?: SelectedItem[] };
    items = body.items ?? [];
  } catch {
    return new Response("Некорректное тело запроса", { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return new Response("Список items пуст", { status: 400 });
  }

  const genAutoDir = process.env.GEN_AUTO_DIR ?? path.join(process.cwd(), "gen_auto");
  const workDir = path.join(os.tmpdir(), `yadisk-selected-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const stagingDir = path.join(workDir, "staging");
  const destZipPath = path.join(workDir, "selected.zip");

  try {
    mkdirSync(stagingDir, { recursive: true });

    const usedNames = new Set<string>();
    for (const item of items) {
      if (!item?.date || !item?.name || !item?.type) continue;

      let sourcePath: string;
      let entryName: string;
      if (item.type === "manual-backup") {
        sourcePath = path.join(genAutoDir, "downloads", "manual-backups", `${item.name}.old.zip`);
        entryName = `${item.name}.old.zip`;
      } else {
        const folderName = item.type === "generator" ? `генератор_${item.date}` : `ручники_${item.date}`;
        sourcePath = path.join(genAutoDir, folderName, item.name);
        entryName = archiveBaseName(sourcePath, item.name, item.type);
      }
      if (!existsSync(sourcePath)) continue;

      // на случай если два разных выбранных пункта дают одинаковое итоговое имя
      let finalName = entryName;
      for (let n = 2; usedNames.has(finalName); n++) finalName = `${entryName}-${n}`;
      usedNames.add(finalName);

      symlinkSync(sourcePath, path.join(stagingDir, finalName));
    }

    if (usedNames.size === 0) {
      return new Response("Ни один из выбранных элементов не найден на диске", { status: 404 });
    }

    await zipStagingDir(stagingDir, destZipPath);
    const buf = readFileSync(destZipPath);
    const filename = `yadisk-${new Date().toISOString().slice(0, 10)}.zip`;
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buf.length),
      },
    });
  } catch (err) {
    return new Response(`Не удалось собрать архив: ${err instanceof Error ? err.message : String(err)}`, { status: 500 });
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
