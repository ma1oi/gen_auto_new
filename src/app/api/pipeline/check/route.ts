import { NextResponse } from "next/server";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import https from "https";
import http from "http";
import type { DomainIssue, ImageIssue, AtIssue } from "@/types";

function findLatestGenDir(genAutoDir: string): string | null {
  const parseDate = (name: string): number => {
    const m = name.match(/генератор_(\d{2})-(\d{2})-(\d{4})/);
    if (!m) return 0;
    return new Date(`${m[3]}-${m[2]}-${m[1]}`).getTime();
  };
  const entries = readdirSync(genAutoDir)
    .filter((f) => f.startsWith("генератор_") && statSync(path.join(genAutoDir, f)).isDirectory())
    .sort((a, b) => parseDate(b) - parseDate(a));
  return entries.length > 0 ? path.join(genAutoDir, entries[0]) : null;
}

function countDomainCom(text: string): number {
  // ищем именно оставшийся плейсхолдер "domain.com", а не любое
  // упоминание слова "domain" — оно легитимно встречается в тексте
  // (например "unsere Domain" в немецкой cookie-policy)
  return (text.match(/\bdomain\.com\b/gi) ?? []).length;
}

function countDomainInJs(text: string): number {
  return (text.match(/(["'])domain\.com\1/gi) ?? []).length;
}

function countAtPlaceholder(text: string): number {
  return (text.match(/\[at\]|\(at\)/gi) ?? []).length;
}

function extractImageUrls(html: string): string[] {
  const urls: string[] = [];

  // <img src="...">
  const imgRe = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    if (m[1].startsWith("http")) urls.push(m[1]);
  }

  // style="... background-image: url('...') ..."  (inline styles)
  const bgRe = /url\(["']?(https?:[^"')]+)["']?\)/gi;
  while ((m = bgRe.exec(html)) !== null) {
    urls.push(m[1]);
  }

  return [...new Set(urls)];
}

function checkImageHead(url: string): Promise<{ url: string; status: number | null; error?: string }> {
  return new Promise((resolve) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.request(url, { method: "HEAD", timeout: 8000 }, (res) => {
      res.resume();
      const status = res.statusCode ?? null;
      const ct = res.headers["content-type"] ?? "";
      if (status === 200 && ct.startsWith("image/")) {
        resolve({ url, status });
      } else if (status === 200) {
        resolve({ url, status, error: `не изображение (${ct || "нет content-type"})` });
      } else if (status && status >= 300 && status < 400 && res.headers.location) {
        resolve({ url, status, error: `redirect → ${res.headers.location}` });
      } else {
        resolve({ url, status, error: `HTTP ${status}` });
      }
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ url, status: null, error: "timeout" });
    });
    req.on("error", (e: Error) => {
      resolve({ url, status: null, error: e.message });
    });
    req.end();
  });
}

export async function GET(request: Request) {
  const genAutoDir = path.join(process.cwd(), "gen_auto");
  const genDir = findLatestGenDir(genAutoDir);

  if (!genDir) {
    return NextResponse.json({ issues: [], imageIssues: [], genDir: null });
  }

  // если передали keys — проверяем только их (например, только что скачанные
  // задачи), а не вообще все папки в генератор_ДАТА
  const keysParam = new URL(request.url).searchParams.get("keys");
  const filterKeys = keysParam
    ? new Set(keysParam.split(",").map((k) => k.trim().toUpperCase()).filter(Boolean))
    : null;

  const issues: DomainIssue[] = [];
  const imageIssues: ImageIssue[] = [];
  const atIssues: AtIssue[] = [];

  const checkPromises: Promise<void>[] = [];

  for (const taskKey of readdirSync(genDir)) {
    const taskPath = path.join(genDir, taskKey);
    if (taskKey.startsWith(".") || !statSync(taskPath).isDirectory()) continue;
    if (filterKeys && !filterKeys.has(taskKey.toUpperCase())) continue;

    const fileIssues: { name: string; count: number }[] = [];
    const atFileIssues: { name: string; count: number }[] = [];
    const allImageUrls: string[] = [];

    for (const file of readdirSync(taskPath)) {
      if (!/\.(html|php|css|js)$/.test(file)) continue;
      const content = readFileSync(path.join(taskPath, file), "utf8");

      if (/\.(html|php)$/.test(file)) {
        const count = countDomainCom(content);
        if (count > 0) fileIssues.push({ name: file, count });

        const atCount = countAtPlaceholder(content);
        if (atCount > 0) atFileIssues.push({ name: file, count: atCount });
      }

      if (/\.js$/.test(file)) {
        const count = countDomainInJs(content);
        if (count > 0) fileIssues.push({ name: file, count });
      }

      for (const u of extractImageUrls(content)) {
        if (!allImageUrls.includes(u)) allImageUrls.push(u);
      }
    }

    if (fileIssues.length > 0) issues.push({ taskKey, files: fileIssues });
    if (atFileIssues.length > 0) atIssues.push({ taskKey, files: atFileIssues });

    if (allImageUrls.length > 0) {
      const key = taskKey;
      checkPromises.push(
        Promise.all(allImageUrls.map(checkImageHead)).then((results) => {
          const broken = results.filter((r) => r.status !== 200);
          if (broken.length > 0) imageIssues.push({ taskKey: key, images: broken });
        })
      );
    }
  }

  await Promise.all(checkPromises);

  return NextResponse.json({ issues, imageIssues, atIssues, genDir: path.basename(genDir) });
}
