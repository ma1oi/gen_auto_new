// Перетащенные через drag-and-drop папки приходят как FileSystemEntry
// (DataTransferItem.webkitGetAsEntry), а не как обычный FileList — их нужно
// самим рекурсивно обойти, чтобы получить плоский список File с путями,
// аналогичными webkitRelativePath у <input webkitdirectory>.

function readEntryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readDirEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

async function walkEntry(entry: FileSystemEntry, prefix: string, out: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await readEntryFile(entry as FileSystemFileEntry);
    const relativePath = prefix + file.name;
    // webkitRelativePath у File, полученного через .file(), обычно пустой —
    // подменяем его, чтобы остальной код (группировка по верхней папке,
    // отправка в FormData) работал одинаково что для клика, что для дропа.
    Object.defineProperty(file, "webkitRelativePath", { value: relativePath, configurable: true });
    out.push(file);
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    let batch = await readDirEntries(reader);
    while (batch.length > 0) {
      for (const child of batch) {
        await walkEntry(child, prefix + entry.name + "/", out);
      }
      // readEntries отдаёт максимум ~100 записей за раз — вызываем, пока не опустеет
      batch = await readDirEntries(reader);
    }
  }
}

export async function readDroppedEntries(items: DataTransferItemList): Promise<File[]> {
  const entries: FileSystemEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }

  const files: File[] = [];
  for (const entry of entries) {
    await walkEntry(entry, "", files);
  }
  return files;
}
