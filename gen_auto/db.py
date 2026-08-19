import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pipeline.db')


def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.execute('PRAGMA journal_mode = WAL')
    conn.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            jira_key TEXT PRIMARY KEY,
            jira_user TEXT NOT NULL,
            domain TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            deployed_at TEXT
        )
    """)
    conn.execute('CREATE INDEX IF NOT EXISTS idx_tasks_jira_user ON tasks(jira_user)')
    existing_columns = {row[1] for row in conn.execute('PRAGMA table_info(tasks)').fetchall()}
    if 'deploy_type' not in existing_columns:
        conn.execute('ALTER TABLE tasks ADD COLUMN deploy_type TEXT')
    if 'server_ip' not in existing_columns:
        conn.execute('ALTER TABLE tasks ADD COLUMN server_ip TEXT')
    if 'force_redeploy' not in existing_columns:
        conn.execute('ALTER TABLE tasks ADD COLUMN force_redeploy INTEGER NOT NULL DEFAULT 0')
    return conn


def get_created_keys(user):
    conn = _connect()
    try:
        rows = conn.execute('SELECT jira_key FROM tasks WHERE jira_user = ?', (user,)).fetchall()
        return [r[0] for r in rows]
    finally:
        conn.close()


def get_domain(key):
    conn = _connect()
    try:
        row = conn.execute('SELECT domain FROM tasks WHERE jira_key = ?', (key,)).fetchone()
        return row[0] if row else None
    finally:
        conn.close()


def get_deploy_type(key):
    conn = _connect()
    try:
        row = conn.execute('SELECT deploy_type FROM tasks WHERE jira_key = ?', (key,)).fetchone()
        return row[0] if row else None
    finally:
        conn.close()


def get_server_ip(key):
    conn = _connect()
    try:
        row = conn.execute('SELECT server_ip FROM tasks WHERE jira_key = ?', (key,)).fetchone()
        return row[0] if row else None
    finally:
        conn.close()


def set_deploy_meta(key, deploy_type, server_ip):
    conn = _connect()
    try:
        conn.execute(
            'UPDATE tasks SET deploy_type = ?, server_ip = ? WHERE jira_key = ?',
            (deploy_type, server_ip, key),
        )
        conn.commit()
    finally:
        conn.close()


def is_deployed(key):
    conn = _connect()
    try:
        row = conn.execute('SELECT deployed_at FROM tasks WHERE jira_key = ?', (key,)).fetchone()
        return bool(row and row[0])
    finally:
        conn.close()


def mark_deployed(key):
    conn = _connect()
    try:
        conn.execute(
            "UPDATE tasks SET deployed_at = datetime('now'), force_redeploy = 0 WHERE jira_key = ?",
            (key,),
        )
        conn.commit()
    finally:
        conn.close()


def needs_force_redeploy(key):
    conn = _connect()
    try:
        row = conn.execute('SELECT force_redeploy FROM tasks WHERE jira_key = ?', (key,)).fetchone()
        return bool(row and row[0])
    finally:
        conn.close()
