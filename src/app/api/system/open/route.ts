import { spawn } from "child_process";

export async function POST(request: Request) {
  const { path } = (await request.json()) as { path: string };
  if (!path) return new Response("Missing path", { status: 400 });

  // `open -R` reveals the file in Finder; `open` on a dir opens it
  spawn("open", ["-R", path], { detached: true }).unref();

  return new Response("ok");
}
