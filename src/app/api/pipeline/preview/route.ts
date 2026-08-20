import { NextResponse } from "next/server";
import { getCredentials } from "@/lib/server-credentials";
import { isArchived, isCreated } from "@/lib/pipeline-db";
import { parseTaskInfo } from "@/lib/parse-task-info";
import type { PreviewTask } from "@/types";

interface JiraIssueRaw {
  key: string;
  statusId: string;
  extraFields: Array<{ id: string; html?: string }>;
}

export async function GET(request: Request) {
  const { jiraCookie, jiraUser } = getCredentials(request);

  const jiraHeaders: Record<string, string> = {
    accept: "application/json, text/javascript, */*; q=0.01",
    "content-type": "application/json",
    "cache-control": "no-cache",
    "x-ausername": jiraUser,
    "x-requested-with": "XMLHttpRequest",
    cookie: jiraCookie,
    Referer: "https://jira.lucky-team.pro/secure/RapidBoard.jspa?rapidView=520",
  };

  const boardData = await fetch(
    `https://jira.lucky-team.pro/rest/greenhopper/1.0/xboard/work/allData.json?rapidViewId=520&selectedProjectKey=WPROMO&activeQuickFilters=3654&activeQuickFilters=3778&_=${Date.now()}`,
    { headers: jiraHeaders, method: "GET" }
  ).then((r) => r.json()) as { issuesData?: { issues?: JiraIssueRaw[] } };

  const issues = boardData.issuesData?.issues ?? [];

  const filtered = issues.filter((issue) => {
    if (issue.statusId !== "13909") return false;
    if (isCreated(issue.key)) return false;
    if (isArchived(issue.key)) return false;
    const scenariy = issue.extraFields.find((f) => f.id === "customfield_14604");
    return scenariy?.html === "Вайты из генератора";
  });

  const tasks: PreviewTask[] = [];
  for (const issue of filtered) {
    const detail = await fetch(
      `https://jira.lucky-team.pro/rest/greenhopper/1.0/xboard/issue/details.json?rapidViewId=520&issueIdOrKey=${issue.key}&loadSubtasks=true&_=${Date.now()}`,
      { headers: jiraHeaders, method: "GET" }
    ).then((r) => r.json());

    const { topic, domain, geo, brandName, langOverride, deployType, serverIp } = parseTaskInfo(detail as Record<string, unknown>);
    tasks.push({ key: issue.key, topic, domain, geo, brandName, langOverride, deployType, serverIp });
  }

  return NextResponse.json({ tasks });
}
