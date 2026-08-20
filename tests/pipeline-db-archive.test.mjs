import assert from "node:assert/strict";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function createDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gen-auto-db-test-"));
  const db = new Database(path.join(tempDir, "pipeline.db"));
  db.exec(`
    CREATE TABLE tasks (jira_key TEXT PRIMARY KEY, jira_user TEXT NOT NULL, deployed_at TEXT);
    CREATE TABLE deployed_archive (jira_key TEXT PRIMARY KEY, jira_user TEXT NOT NULL, domain TEXT, deployed_at TEXT NOT NULL);
  `);
  return { db, tempDir };
}

function closeDb(db, tempDir) {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

test("archived deployed task is recognized after tasks was cleared", () => {
  const { db, tempDir } = createDb();
  try {
    db.prepare("INSERT INTO deployed_archive (jira_key, jira_user, domain, deployed_at) VALUES (?, ?, ?, datetime('now'))")
      .run("WPROMO-95833", "d.smirnov", "sequoia-dash.com");

    const isCreated = (key) => !!db.prepare("SELECT 1 FROM tasks WHERE jira_key = ?").get(key);
    const isArchived = (key) => !!db.prepare("SELECT 1 FROM deployed_archive WHERE jira_key = ?").get(key);

    assert.equal(isCreated("WPROMO-95833"), false);
    assert.equal(isArchived("WPROMO-95833"), true);
    assert.equal(isArchived("WPROMO-99999"), false);
  } finally {
    closeDb(db, tempDir);
  }
});

test("clear deployed removes active rows but leaves archive intact", () => {
  const { db, tempDir } = createDb();
  try {
    db.prepare("INSERT INTO tasks (jira_key, jira_user, deployed_at) VALUES (?, ?, datetime('now'))")
      .run("WPROMO-95834", "d.smirnov");
    db.prepare("INSERT INTO deployed_archive (jira_key, jira_user, domain, deployed_at) VALUES (?, ?, ?, datetime('now'))")
      .run("WPROMO-95833", "d.smirnov", "sequoia-dash.com");

    db.prepare("DELETE FROM tasks WHERE jira_user = ? AND deployed_at IS NOT NULL").run("d.smirnov");

    assert.equal(db.prepare("SELECT 1 FROM tasks WHERE jira_key = ?").get("WPROMO-95834"), undefined);
    assert.notEqual(db.prepare("SELECT 1 FROM deployed_archive WHERE jira_key = ?").get("WPROMO-95833"), undefined);
  } finally {
    closeDb(db, tempDir);
  }
});
