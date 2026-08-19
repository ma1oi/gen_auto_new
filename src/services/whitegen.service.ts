import type { WhitegenTask } from "@/types";

function buildHeaders(auth: string, cookie: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: auth,
    "content-type": "application/json",
    cookie,
    Referer: "https://whitegen.org/dashboard",
  };
}

// Searches whitegen directly by key (server-side `search=` filter) instead of
// paginating through the full generator list and hoping to spot a match —
// works for any key that exists in whitegen, regardless of whether it's
// tracked in our local pipeline.db.
export async function findWhitegenTask(
  key: string,
  creds: { whitegenCookie: string; whitegenAuth: string }
): Promise<WhitegenTask | null> {
  const headers = buildHeaders(creds.whitegenAuth, creds.whitegenCookie);
  const res = await fetch(
    `https://whitegen.org/api/v1/generator/list?page=1&per_page=10&search=${encodeURIComponent(key)}`,
    { headers }
  );
  if (!res.ok) {
    throw new Error(`Whitegen API error: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { data?: WhitegenTask[] };
  return (data.data ?? []).find((item) => item.number === key) ?? null;
}

export async function getWhitegenStatus(
  keys: string[],
  creds: { whitegenCookie: string; whitegenAuth: string }
): Promise<WhitegenTask[]> {
  const results = await Promise.all(keys.map((key) => findWhitegenTask(key, creds)));
  return results.filter((r): r is WhitegenTask => r !== null);
}
