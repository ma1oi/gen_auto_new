import { NextResponse } from "next/server";
import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import path from "path";
import { getDomain } from "@/lib/pipeline-db";

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

function fixDomainInText(text: string, domain: string): string {
  const shortDomain = domain.replace(/\.[^.]+$/, "");

  // In <title> tags — domain without TLD zone
  let result = text.replace(
    /(<title[^>]*>)([\s\S]*?)(<\/title>)/gi,
    (_, open, content, close) => {
      const fixed = content
        .replace(/domain\.com/gi, shortDomain)
        .replace(/\bdomain\b/gi, shortDomain);
      return open + fixed + close;
    }
  );

  // Everywhere else — full domain
  result = result.replace(/domain\.com/gi, domain);
  result = result.replace(/\bdomain\b/gi, domain);
  return result;
}

// For JS files: only replace string literals, not variable names
function fixDomainInJs(text: string, domain: string): string {
  return text
    .replace(/(["'])domain\.com\1/gi, `$1${domain}$1`)
    .replace(/(["'])domain\1/gi, `$1${domain}$1`);
}

function fixAtInText(text: string): string {
  return text.replace(/\[at\]|\(at\)/gi, "@");
}

export async function POST(req: Request) {
  const { keys, atKeys } = (await req.json()) as { keys?: string[]; atKeys?: string[] };
  const genAutoDir = path.join(process.cwd(), "gen_auto");
  const genDir = findLatestGenDir(genAutoDir);

  if (!genDir) {
    return NextResponse.json({ error: "генератор_* не найден" }, { status: 404 });
  }

  const fixed: string[] = [];
  const errors: string[] = [];

  for (const key of (keys ?? [])) {
    const domain = getDomain(key) ?? getDomain(key.toUpperCase());
    if (!domain || domain.trim() === "-") {
      errors.push(`${key}: нет домена в deploy-tasks.json`);
      continue;
    }

    const taskPath = path.join(genDir, key.toLowerCase());
    if (!existsSync(taskPath)) {
      errors.push(`${key}: папка не найдена`);
      continue;
    }

    let fileCount = 0;
    for (const file of readdirSync(taskPath)) {
      const isHtmlPhp = /\.(html|php)$/.test(file);
      const isJs = /\.js$/.test(file);
      if (!isHtmlPhp && !isJs) continue;
      const filePath = path.join(taskPath, file);
      const original = readFileSync(filePath, "utf8");
      const patched = isJs
        ? fixDomainInJs(original, domain)
        : fixDomainInText(original, domain);
      if (patched !== original) {
        writeFileSync(filePath, patched, "utf8");
        fileCount++;
      }
    }

    fixed.push(`${key} (${domain}): исправлено ${fileCount} файлов`);
  }

  const atFixed: string[] = [];
  for (const key of (atKeys ?? [])) {
    const taskPath = path.join(genDir, key.toLowerCase());
    if (!existsSync(taskPath)) {
      errors.push(`${key}: папка не найдена`);
      continue;
    }

    let fileCount = 0;
    for (const file of readdirSync(taskPath)) {
      if (!/\.(html|php)$/.test(file)) continue;
      const filePath = path.join(taskPath, file);
      const original = readFileSync(filePath, "utf8");
      const patched = fixAtInText(original);
      if (patched !== original) {
        writeFileSync(filePath, patched, "utf8");
        fileCount++;
      }
    }

    atFixed.push(`${key}: исправлено ${fileCount} файлов`);
  }

  return NextResponse.json({ fixed, atFixed, errors });
}
