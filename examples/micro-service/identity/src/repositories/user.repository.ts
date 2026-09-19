import type Database from "better-sqlite3";
import type { UserModel } from "../models/user.model.js";
import type { UserId } from "../types/index.js";

/**
 * Interface for user persistence operations.
 */
export interface UserRepository {
  findById(id: UserId): UserModel | undefined;
  findByEmail(email: string): UserModel | undefined;
  create(user: UserModel): UserModel;
  update(user: UserModel): UserModel;
  findAll(limit: number, offset: number): readonly UserModel[];
}

/**
 * SQLite-backed implementation of UserRepository.
 */
export class SqliteUserRepository implements UserRepository {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  findById(id: UserId): UserModel | undefined {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
      Record<string, unknown> | undefined;

    if (!row) {
      return undefined;
    }

    return this.mapRow(row);
  }

  findByEmail(email: string): UserModel | undefined {
    const row = this.db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email) as Record<string, unknown> | undefined;

    if (!row) {
      return undefined;
    }

    return this.mapRow(row);
  }

  create(user: UserModel): UserModel {
    this.db
      .prepare(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        user.id,
        user.email,
        user.passwordHash,
        user.firstName,
        user.lastName,
        user.role,
        user.createdAt.toISOString(),
        user.updatedAt.toISOString(),
      );

    return user;
  }

  update(user: UserModel): UserModel {
    this.db
      .prepare(
        `UPDATE users
         SET email = ?, password_hash = ?, first_name = ?, last_name = ?, role = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        user.email,
        user.passwordHash,
        user.firstName,
        user.lastName,
        user.role,
        user.updatedAt.toISOString(),
        user.id,
      );

    return user;
  }

  findAll(limit: number, offset: number): readonly UserModel[] {
    const rows = this.db
      .prepare("SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?")
      .all(limit, offset) as readonly Record<string, unknown>[];

    return rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: Record<string, unknown>): UserModel {
    return {
      id: row.id as UserId,
      email: row.email as string,
      passwordHash: row.password_hash as string,
      firstName: row.first_name as string,
      lastName: row.last_name as string,
      role: row.role as UserModel["role"],
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
