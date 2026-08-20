import { NextResponse } from "next/server";
import { getCredentials } from "@/lib/server-credentials";
import { clearDeployedTasks, getCompletedTasks } from "@/lib/pipeline-db";

export async function POST(request: Request) {
  const { jiraUser } = getCredentials(request);
  const body = (await request.json().catch(() => null)) as { keys?: unknown } | null;
  if (Array.isArray(body?.keys)) {
    const currentKeys = body.keys.filter((key): key is string => typeof key === "string");
    const completedKeys = getCompletedTasks(jiraUser, currentKeys);
    return NextResponse.json({ deleted: 0, keys: completedKeys });
  }
  const { deletedKeys, completedKeys } = clearDeployedTasks(jiraUser);
  return NextResponse.json({ deleted: deletedKeys.length, keys: completedKeys });
}
