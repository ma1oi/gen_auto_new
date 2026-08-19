import { existsSync, readFileSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { zipDirectory } from "@/lib/zip";
import type { ManualMeta } from "@/app/api/pipeline/manual-upload/stage/route";

function archiveBaseName(dir: string, name: string, type: string): string {
  if (type !== "manual") return name;

  const metaPath = path.join(dir, ".manual-meta.json");
  if (!existsSync(metaPath)) return name;

  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as ManualMeta;
    const digits = (meta.taskNumber ?? "").replace(/\D+/g, "");
    return digits && !name.includes(digits) ? `${name}.${digits}` : name;
  } catch {
    return name;
  }
}

function fileResponse(filePath: string, filename: string): Response {
  const buf = readFileSync(filePath);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buf.length),
    },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? "";
  const name = searchParams.get("name") ?? "";
  const type = searchParams.get("type") ?? "";
  const genAutoDir = process.env.GEN_AUTO_DIR ?? path.join(process.cwd(), "gen_auto");

  if (!date || !name || !type) {
    return new Response("Не хватает параметров (date, name, type)", { status: 400 });
  }

  if (type === "manual-backup") {
    const oldZipPath = path.join(genAutoDir, "downloads", "manual-backups", `${name}.old.zip`);
    if (!existsSync(oldZipPath)) return new Response("Бэкап не найден", { status: 404 });
    return fileResponse(oldZipPath, `${name}.old.zip`);
  }

  const folderName = type === "generator" ? `генератор_${date}` : `ручники_${date}`;
  const localDir = path.join(genAutoDir, folderName, name);
  if (!existsSync(localDir)) return new Response("Папка не найдена", { status: 404 });

  const filename = `${archiveBaseName(localDir, name, type)}.zip`;
  const tmpZipPath = path.join(os.tmpdir(), `yadisk-dl-${Date.now()}-${filename}`);

  try {
    await zipDirectory(localDir, tmpZipPath, [".manual-meta.json", ".yadisk-uploaded.json", ".DS_Store"]);
    return fileResponse(tmpZipPath, filename);
  } catch (err) {
    return new Response(`Не удалось собрать архив: ${err instanceof Error ? err.message : String(err)}`, { status: 500 });
  } finally {
    if (existsSync(tmpZipPath)) rmSync(tmpZipPath, { force: true });
  }
}
