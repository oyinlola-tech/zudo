import Database from "better-sqlite3";
import type { DatabaseConfig } from "../interfaces/index.js";
import { APP_NAME } from "../constants/index.js";

/**
 * Initializes and returns a SQLite database connection.
 * Creates the users table if it does not exist.
 */
export function createIdentityDatabase(
  config: DatabaseConfig,
): Database.Database {
  const db = new Database(config.filename);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  console.log(`[${APP_NAME}] Database initialized at ${config.filename}`);

  return db;
}
