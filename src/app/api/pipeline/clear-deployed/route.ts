import { NextResponse } from "next/server";
import { getCredentials } from "@/lib/server-credentials";
import { clearDeployedTasks } from "@/lib/pipeline-db";

export async function POST(request: Request) {
  const { jiraUser } = getCredentials(request);
  const keys = clearDeployedTasks(jiraUser);
  return NextResponse.json({ deleted: keys.length, keys });
}
