import Database from "better-sqlite3";
import type { DatabaseConfig } from "../interfaces/index.js";

let db: Database.Database | null = null;

/**
 * Returns the active database instance.
 * @throws If the database has not been initialized.
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

/**
 * Initializes the SQLite database and runs migrations.
 * @param config - Database configuration.
 * @returns The initialized database instance.
 */
export function initDatabase(config: DatabaseConfig): Database.Database {
  db = new Database(config.filename);

  if (config.verbose) {
    db.pragma("journal_mode = WAL");
  }

  db.pragma("foreign_keys = ON");

  runMigrations(db);

  return db;
}

/**
 * Closes the database connection.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Runs schema migrations against the database.
 * @param database - The SQLite database instance.
 */
function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS enrollments (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      withdrawn_at TEXT,
      UNIQUE(student_id, course_id)
    );

    CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
    CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);
    CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments(status);
  `);
}
