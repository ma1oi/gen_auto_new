import fs from "fs";
import path from "path";

type LogFn = (line: string) => void;

function getDomainFromSitemap(sitemapPath: string): string | null {
  const content = fs.readFileSync(sitemapPath, "utf8");
  const match = content.match(/<loc>https?:\/\/([^\/]+)/);
  return match ? match[1] : null;
}

function findDomainsInText(text: string): Set<string> {
  const FILE_EXT = /\.(html|php|css|js|svg|png|jpg|jpeg|gif|webp|ico|xml|json|pdf|zip|txt|md)$/i;
  const domainRegex = /(?:https?:\/\/|@)([a-zA-Z0-9][a-zA-Z0-9\-]*\.(?:[a-zA-Z0-9\-]+\.)?[a-zA-Z]{2,})/g;
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = domainRegex.exec(text)) !== null) {
    const domain = match[1].toLowerCase().replace(/^www\./, "");
    if (!FILE_EXT.test(domain)) found.add(domain);
  }
  return found;
}

function checkDomain(dir: string, log: LogFn) {
  const sitemapPath = path.join(dir, "sitemap.xml");
  if (!fs.existsSync(sitemapPath)) return;

  const expectedDomain = getDomainFromSitemap(sitemapPath);
  if (!expectedDomain) {
    log(`⚠️  Не удалось извлечь домен из sitemap.xml`);
    return;
  }
  log(`🌐 Домен из sitemap: ${expectedDomain}`);

  const SKIP = [
    expectedDomain,
    "sitemaps.org", "w3.org", "schema.org",
    "google.com", "googleapis.com", "gstatic.com",
    "fonts.googleapis.com", "cdnjs.cloudflare.com",
    "jquery.com", "bootstrapcdn.com",
  ];

  for (const file of fs.readdirSync(dir)) {
    if (!/\.(html|php)$/.test(file)) continue;
    const fullPath = path.join(dir, file);
    let content = fs.readFileSync(fullPath, "utf8");
    const domains = findDomainsInText(content);
    for (const domain of domains) {
      if (SKIP.some((s) => domain === s || domain.endsWith("." + s))) continue;
      const regex = new RegExp(domain.replace(/\./g, "\\."), "gi");
      content = content.replace(regex, expectedDomain);
      log(`🔁 ${file}: ${domain} → ${expectedDomain}`);
    }
    fs.writeFileSync(fullPath, content, "utf8");
  }
}

function processDir(dir: string, hasBlog: boolean, log: LogFn) {
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    if (fs.lstatSync(fullPath).isDirectory()) {
      processDir(fullPath, hasBlog, log);
      continue;
    }

    if (hasBlog && file === "index.html") {
      let content = fs.readFileSync(fullPath, "utf8");
      const replaced = content.replace(/#blog/g, "blog.html");
      if (replaced !== content) {
        fs.writeFileSync(fullPath, replaced, "utf8");
        log(`🔁 Обновлено: ${path.relative(dir, fullPath)}`);
      }
    }
  }
}

function cleanProject(rootDir: string, log: LogFn) {
  for (const folder of [".git", ".local", "attached_assets"]) {
    const target = path.join(rootDir, folder);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
      log(`🗑  Удалена папка: ${folder}`);
    }
  }
  for (const file of [".replit", "replit.md"]) {
    const target = path.join(rootDir, file);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { force: true });
      log(`🗑  Удалён файл: ${file}`);
    }
  }
}

function findSitemapDirs(dir: string, result: string[] = []): string[] {
  if (fs.existsSync(path.join(dir, "sitemap.xml"))) result.push(dir);
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    if (fs.lstatSync(fullPath).isDirectory()) findSitemapDirs(fullPath, result);
  }
  return result;
}

export function runLuckyCleanerOnDir(rootDir: string, log: LogFn) {
  const hasBlog = fs.existsSync(path.join(rootDir, "blog.html"));
  processDir(rootDir, hasBlog, log);
  cleanProject(rootDir, log);

  const sitemapDirs = findSitemapDirs(rootDir);
  for (const dir of sitemapDirs) {
    checkDomain(dir, log);
  }

  log(`✅ LuckyCleaner завершил работу`);
}
