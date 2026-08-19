import { NextResponse } from "next/server";
import { getWhitegenStatus } from "@/services/whitegen.service";
import { getCredentials } from "@/lib/server-credentials";
import { getCreatedKeys, getDeployedKeys } from "@/lib/pipeline-db";

export async function GET(request: Request) {
  const creds = getCredentials(request);
  const keys = getCreatedKeys(creds.jiraUser);

  if (keys.length === 0) {
    return NextResponse.json({ keys: [], tasks: [], deployedCount: 0 });
  }

  const deployedCount = getDeployedKeys(creds.jiraUser).length;

  try {
    const tasks = await getWhitegenStatus(keys, creds);
    return NextResponse.json({ keys, tasks, deployedCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ keys, tasks: [], deployedCount, error: message }, { status: 200 });
  }
}
