import { NextResponse } from "next/server";
import { getCredentials } from "@/lib/server-credentials";

export async function POST(request: Request) {
  const { whitegenAuth, whitegenCookie } = getCredentials(request);
  const { id } = (await request.json()) as { id: number };

  try {
    const res = await fetch(`https://whitegen.org/api/v1/generator/retry/${id}`, {
      headers: {
        accept: "application/json",
        authorization: whitegenAuth,
        "content-type": "application/json",
        cookie: whitegenCookie,
        Referer: "https://whitegen.org/list",
      },
      body: "{}",
      method: "POST",
    });
    const result = await res.json().catch(() => null);
    return NextResponse.json({ ok: res.ok, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
