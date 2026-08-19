import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const API_RESOURCES = "https://cloud-api.yandex.net/v1/disk/resources";

export async function resourceExists(token: string, diskPath: string): Promise<boolean> {
  const res = await fetch(`${API_RESOURCES}?path=${encodeURIComponent(diskPath)}`, {
    headers: { Authorization: `OAuth ${token}` },
  });
  if (res.status === 404) return false;
  if (res.ok) return true;
  const body = await res.text();
  throw new Error(`Не удалось проверить ${diskPath}: HTTP ${res.status} ${body}`);
}

async function ensureFolder(token: string, diskPath: string): Promise<void> {
  const res = await fetch(`${API_RESOURCES}?path=${encodeURIComponent(diskPath)}`, {
    method: "PUT",
    headers: { Authorization: `OAuth ${token}` },
  });
  if (res.ok || res.status === 409) return;
  const body = await res.text();
  throw new Error(`Не удалось создать папку ${diskPath}: HTTP ${res.status} ${body}`);
}

async function ensureFolderRecursive(token: string, diskPath: string): Promise<void> {
  const parts = diskPath.replace(/^disk:\//, "").split("/").filter(Boolean);
  let cur = "disk:";
  for (const part of parts) {
    cur += `/${part}`;
    await ensureFolder(token, cur);
  }
}

async function uploadFile(token: string, diskPath: string, localFilePath: string): Promise<void> {
  const linkRes = await fetch(
    `${API_RESOURCES}/upload?path=${encodeURIComponent(diskPath)}&overwrite=true`,
    { headers: { Authorization: `OAuth ${token}` } }
  );
  if (!linkRes.ok) {
    const body = await linkRes.text();
    throw new Error(`Не удалось получить ссылку для загрузки ${diskPath}: HTTP ${linkRes.status} ${body}`);
  }
  const { href } = (await linkRes.json()) as { href: string; method: string };

  const fileBuffer = readFileSync(localFilePath);
  const putRes = await fetch(href, { method: "PUT", body: new Uint8Array(fileBuffer) });
  if (!putRes.ok && putRes.status !== 201) {
    const body = await putRes.text();
    throw new Error(`Не удалось загрузить файл ${diskPath}: HTTP ${putRes.status} ${body}`);
  }
}

async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

interface UploadStats {
  files: number;
  folders: number;
}

async function uploadDirectory(
  token: string,
  localDir: string,
  diskDir: string,
  stats: UploadStats,
  onLog: (line: string) => void
): Promise<void> {
  await ensureFolderRecursive(token, diskDir);
  stats.folders++;

  const entries = readdirSync(localDir, { withFileTypes: true }).filter((e) => e.name !== ".DS_Store");
  const files = entries.filter((e) => e.isFile());
  const dirs = entries.filter((e) => e.isDirectory());

  await runWithConcurrency(files, 4, async (entry) => {
    const localFilePath = path.join(localDir, entry.name);
    const filDiskPath = `${diskDir}/${entry.name}`;
    await uploadFile(token, filDiskPath, localFilePath);
    stats.files++;
    onLog(`   ↑ ${entry.name}`);
  });

  for (const dir of dirs) {
    await uploadDirectory(token, path.join(localDir, dir.name), `${diskDir}/${dir.name}`, stats, onLog);
  }
}

export async function uploadTaskFoldersToYandexDisk(
  token: string,
  genDir: string,
  onLog: (line: string) => void,
  limit?: number
): Promise<{ folders: number; files: number; errors: { taskKey: string; error: string }[] }> {
  const rootDisk = "disk:/Генератор";
  await ensureFolderRecursive(token, rootDisk);

  let taskFolders = readdirSync(genDir).filter(
    (f) => !f.startsWith(".") && statSync(path.join(genDir, f)).isDirectory()
  );
  if (limit) taskFolders = taskFolders.slice(0, limit);

  const stats: UploadStats = { files: 0, folders: 0 };
  const errors: { taskKey: string; error: string }[] = [];

  for (const folder of taskFolders) {
    const taskKey = folder.toUpperCase();
    onLog(`📁 ${taskKey}`);
    try {
      await uploadDirectory(token, path.join(genDir, folder), `${rootDisk}/${taskKey}`, stats, onLog);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ taskKey, error: message });
      onLog(`   ✗ ошибка: ${message}`);
    }
  }

  return { folders: stats.folders, files: stats.files, errors };
}

// Заливает одну конкретную папку (по имени/домену задачи) целиком в заданный
// путь на Я.Диске — использует вкладка "Я.Диск" для точечной заливки того,
// что отметили чекбоксами (в отличие от uploadTaskFoldersToYandexDisk выше,
// которая грузит все папки из директории генератора разом).
export async function uploadNamedFolderToYandexDisk(
  token: string,
  localDir: string,
  diskDir: string,
  onLog: (line: string) => void
): Promise<{ files: number }> {
  const stats: UploadStats = { files: 0, folders: 0 };
  await uploadDirectory(token, localDir, diskDir, stats, onLog);
  return { files: stats.files };
}

// Заливает один файл (например уже собранный zip-архив ручника) в заданную
// папку на Я.Диске, создавая родительскую папку при необходимости.
export async function uploadSingleFileToYandexDisk(
  token: string,
  localFilePath: string,
  diskFilePath: string,
  onLog: (line: string) => void
): Promise<void> {
  const diskDir = diskFilePath.slice(0, diskFilePath.lastIndexOf("/"));
  await ensureFolderRecursive(token, diskDir);
  await uploadFile(token, diskFilePath, localFilePath);
  onLog(`   ↑ ${path.basename(diskFilePath)}`);
}
