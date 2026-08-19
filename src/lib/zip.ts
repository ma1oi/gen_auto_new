import { spawn } from "child_process";

export function zipDirectory(localDir: string, destZipPath: string, excludes: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ["-rXq", destZipPath, "."];
    for (const e of excludes) args.push("-x", e);
    const child = spawn("zip", args, { cwd: localDir });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`zip завершился с кодом ${code}: ${stderr}`));
    });
  });
}
