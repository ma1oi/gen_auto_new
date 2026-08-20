import path from "path";
import Database from "better-sqlite3";
import { getCompletedKeysInSelection } from "./completed-task-selection.mjs";

const db = new Database(path.join(process.cwd(), "gen_auto", "pipeline.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    jira_key TEXT PRIMARY KEY,
    jira_user TEXT NOT NULL,
    domain TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    deployed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_jira_user ON tasks(jira_user);

  -- отдельный от tasks архив задеплоенных задач генератора для вкладки
  -- "Я.Диск" — "Очистить БД от готовых" на главном экране чистит только
  -- tasks (чтобы задачи можно было создать заново), сюда не лезет, поэтому
  -- задеплоенные папки не пропадают из списка на Я.Диске
  CREATE TABLE IF NOT EXISTS deployed_archive (
    jira_key TEXT PRIMARY KEY,
    jira_user TEXT NOT NULL,
    domain TEXT,
    deployed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_deployed_archive_user ON deployed_archive(jira_user);
`);

const existingColumns = new Set(
  (db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[]).map((c) => c.name)
);
if (!existingColumns.has("deploy_type")) db.exec("ALTER TABLE tasks ADD COLUMN deploy_type TEXT");
if (!existingColumns.has("server_ip")) db.exec("ALTER TABLE tasks ADD COLUMN server_ip TEXT");
if (!existingColumns.has("force_redeploy")) db.exec("ALTER TABLE tasks ADD COLUMN force_redeploy INTEGER NOT NULL DEFAULT 0");

export function isCreated(key: string): boolean {
  return !!db.prepare("SELECT 1 FROM tasks WHERE jira_key = ?").get(key);
}

export function isArchived(key: string): boolean {
  return !!db.prepare("SELECT 1 FROM deployed_archive WHERE jira_key = ?").get(key);
}

export function markCreated(key: string, user: string): void {
  db.prepare(
    `INSERT INTO tasks (jira_key, jira_user) VALUES (?, ?)
     ON CONFLICT(jira_key) DO NOTHING`
  ).run(key, user);
}

export function getCreatedKeys(user: string): string[] {
  return (db.prepare("SELECT jira_key FROM tasks WHERE jira_user = ?").all(user) as { jira_key: string }[])
    .map((r) => r.jira_key);
}

export function getDomain(key: string): string | null {
  const row = db.prepare("SELECT domain FROM tasks WHERE jira_key = ?").get(key) as { domain: string | null } | undefined;
  return row?.domain ?? null;
}

export function setDomainIfMissing(key: string, user: string, domain: string): void {
  db.prepare(
    `INSERT INTO tasks (jira_key, jira_user, domain) VALUES (?, ?, ?)
     ON CONFLICT(jira_key) DO UPDATE SET domain = COALESCE(tasks.domain, excluded.domain)`
  ).run(key, user, domain.toLowerCase());
}

export function setDeployMeta(key: string, deployType: "csv" | "ip", serverIp: string | null): void {
  db.prepare("UPDATE tasks SET deploy_type = ?, server_ip = ? WHERE jira_key = ?").run(deployType, serverIp, key);
}

export function getDeployedKeys(user: string): string[] {
  return (
    db.prepare("SELECT jira_key FROM tasks WHERE jira_user = ? AND deployed_at IS NOT NULL").all(user) as { jira_key: string }[]
  ).map((r) => r.jira_key);
}

export function getDeployedDomains(user: string): string[] {
  return (
    db
      .prepare("SELECT domain FROM tasks WHERE jira_user = ? AND deployed_at IS NOT NULL AND domain IS NOT NULL")
      .all(user) as { domain: string }[]
  ).map((r) => r.domain);
}

export function resetDeployedAt(key: string): void {
  db.prepare("UPDATE tasks SET deployed_at = NULL WHERE jira_key = ?").run(key);
}

export function markForceRedeploy(key: string): void {
  db.prepare("UPDATE tasks SET force_redeploy = 1 WHERE jira_key = ?").run(key);
}

export function recordDeployedArchive(key: string, user: string, domain: string): void {
  db.prepare(
    `INSERT INTO deployed_archive (jira_key, jira_user, domain) VALUES (?, ?, ?)
     ON CONFLICT(jira_key) DO UPDATE SET jira_user = excluded.jira_user, domain = excluded.domain, deployed_at = datetime('now')`
  ).run(key, user, domain.toLowerCase());
}

export function getArchivedDeployedKeys(user: string): string[] {
  return (
    db.prepare("SELECT jira_key FROM deployed_archive WHERE jira_user = ?").all(user) as { jira_key: string }[]
  ).map((r) => r.jira_key);
}

export function getArchivedDomain(key: string): string | null {
  const row = db.prepare("SELECT domain FROM deployed_archive WHERE jira_key = ?").get(key) as
    | { domain: string | null }
    | undefined;
  return row?.domain ?? null;
}

export function clearDeployedTasks(user: string): { deletedKeys: string[]; completedKeys: string[] } {
  const activeKeys = (
    db.prepare("SELECT jira_key FROM tasks WHERE jira_user = ? AND deployed_at IS NOT NULL").all(user) as {
      jira_key: string;
    }[]
  ).map((r) => r.jira_key);
  const archivedKeys = (
    db.prepare("SELECT jira_key FROM deployed_archive WHERE jira_user = ?").all(user) as {
      jira_key: string;
    }[]
  ).map((r) => r.jira_key);
  db.prepare("DELETE FROM tasks WHERE jira_user = ? AND deployed_at IS NOT NULL").run(user);
  return {
    deletedKeys: activeKeys,
    completedKeys: [...new Set([...activeKeys, ...archivedKeys])],
  };
}

export function getCompletedTasks(user: string, currentKeys: string[]): string[] {
  if (currentKeys.length === 0) return [];
  const activeKeys = (
    db.prepare("SELECT jira_key FROM tasks WHERE jira_user = ? AND deployed_at IS NOT NULL").all(user) as {
      jira_key: string;
    }[]
  ).map((r) => r.jira_key);
  const archivedKeys = (
    db.prepare("SELECT jira_key FROM deployed_archive WHERE jira_user = ?").all(user) as {
      jira_key: string;
    }[]
  ).map((r) => r.jira_key);
  return getCompletedKeysInSelection(currentKeys, [...activeKeys, ...archivedKeys]);
}
