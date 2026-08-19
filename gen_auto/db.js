const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'pipeline.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    jira_key TEXT PRIMARY KEY,
    jira_user TEXT NOT NULL,
    domain TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    deployed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_jira_user ON tasks(jira_user);
`);

const existingColumns = new Set(db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name));
if (!existingColumns.has('deploy_type')) db.exec('ALTER TABLE tasks ADD COLUMN deploy_type TEXT');
if (!existingColumns.has('server_ip')) db.exec('ALTER TABLE tasks ADD COLUMN server_ip TEXT');

function isCreated(key) {
  return !!db.prepare('SELECT 1 FROM tasks WHERE jira_key = ?').get(key);
}

function markCreated(key, user) {
  db.prepare(
    `INSERT INTO tasks (jira_key, jira_user) VALUES (?, ?)
     ON CONFLICT(jira_key) DO NOTHING`
  ).run(key, user);
}

function getCreatedKeys(user) {
  return db.prepare('SELECT jira_key FROM tasks WHERE jira_user = ?').all(user).map((r) => r.jira_key);
}

function getDomain(key) {
  const row = db.prepare('SELECT domain FROM tasks WHERE jira_key = ?').get(key);
  return row?.domain ?? null;
}

function setDomainIfMissing(key, user, domain) {
  db.prepare(
    `INSERT INTO tasks (jira_key, jira_user, domain) VALUES (?, ?, ?)
     ON CONFLICT(jira_key) DO UPDATE SET domain = COALESCE(tasks.domain, excluded.domain)`
  ).run(key, user, domain.toLowerCase());
}

function isDeployed(key) {
  const row = db.prepare('SELECT deployed_at FROM tasks WHERE jira_key = ?').get(key);
  return !!row?.deployed_at;
}

function markDeployed(key) {
  db.prepare(`UPDATE tasks SET deployed_at = datetime('now') WHERE jira_key = ?`).run(key);
}

function getDeployedKeys(user) {
  return db.prepare('SELECT jira_key FROM tasks WHERE jira_user = ? AND deployed_at IS NOT NULL')
    .all(user).map((r) => r.jira_key);
}

function getDeployedDomains(user) {
  return db.prepare('SELECT domain FROM tasks WHERE jira_user = ? AND deployed_at IS NOT NULL AND domain IS NOT NULL')
    .all(user).map((r) => r.domain);
}

module.exports = {
  isCreated,
  markCreated,
  getCreatedKeys,
  getDomain,
  setDomainIfMissing,
  isDeployed,
  markDeployed,
  getDeployedKeys,
  getDeployedDomains,
};
