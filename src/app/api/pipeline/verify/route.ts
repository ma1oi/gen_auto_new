import { NextRequest, NextResponse } from "next/server";
import https from "https";
import http from "http";
import { getCredentials } from "@/lib/server-credentials";
import { getDeployedDomains } from "@/lib/pipeline-db";

interface VerifyResult {
  domain: string;
  ok: boolean;
  title: string | null;
  error?: string;
}

function fetchTitle(domain: string): Promise<VerifyResult> {
  return new Promise((resolve) => {
    const url = `https://${domain}`;
    const mod = url.startsWith("https") ? https : http;

    const req = mod.get(url, { timeout: 8000 }, (res) => {
      const status = res.statusCode ?? 0;

      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        resolve({ domain, ok: false, title: null, error: `redirect → ${res.headers.location}` });
        return;
      }

      if (status < 200 || status >= 300) {
        res.resume();
        resolve({ domain, ok: false, title: null, error: `HTTP ${status}` });
        return;
      }

      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        body += chunk;
        if (body.length > 50000) res.destroy();
      });
      res.on("end", () => {
        const match = body.match(/<title[^>]*>([^<]*)<\/title>/i);
        const title = match ? match[1].trim() : null;
        const comingSoon = title?.toLowerCase().includes("coming soon") ?? false;
        resolve({ domain, ok: !comingSoon, title });
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({ domain, ok: false, title: null, error: "timeout" });
    });
    req.on("error", (e: Error) => {
      resolve({ domain, ok: false, title: null, error: e.message });
    });
  });
}

export async function POST(req: NextRequest) {
  let { domains } = (await req.json()) as { domains: string[] };

  if (!Array.isArray(domains) || domains.length === 0) {
    domains = getDeployedDomains(getCredentials(req).jiraUser);
  }

  if (domains.length === 0) return NextResponse.json({ results: [] });

  const results = await Promise.all(domains.map(fetchTitle));
  return NextResponse.json({ results });
}
