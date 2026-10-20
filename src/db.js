const { DatabaseSync } = require('node:sqlite'); // built-in, Node >= 22.13 (no native build step)
const path = require('path');

const STAGES = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'];

function openDb(file) {
  const db = new DatabaseSync(file || process.env.DB_PATH || path.join(__dirname, '..', 'ats.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  // minimal transaction helper (better-sqlite3 style)
  db.transaction = (fn) => () => {
    db.exec('BEGIN');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  db.exec(`
    CREATE TABLE IF NOT EXISTS candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT DEFAULT '',
      position TEXT NOT NULL,
      skills TEXT DEFAULT '',
      experience_years REAL DEFAULT 0,
      source TEXT DEFAULT 'Direct',
      stage TEXT NOT NULL DEFAULT 'Applied',
      rating INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS stage_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      from_stage TEXT,
      to_stage TEXT NOT NULL,
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cand_stage ON candidates(stage);
    CREATE INDEX IF NOT EXISTS idx_cand_position ON candidates(position);
  `);
  return db;
}

module.exports = { openDb, STAGES };
