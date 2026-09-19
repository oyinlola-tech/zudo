import Database from "better-sqlite3";
import { assessmentConfig } from "../config/app.config.js";
import { ASSESSMENT_TABLE, SUBMISSION_TABLE } from "../constants/index.js";
import type { AssessmentRepository } from "../interfaces/index.js";

export function createAssessmentDatabase(): AssessmentRepository {
  const db = new Database(assessmentConfig.databasePath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS ${ASSESSMENT_TABLE} (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      total_points INTEGER NOT NULL DEFAULT 0,
      duration_minutes INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SUBMISSION_TABLE} (
      id TEXT PRIMARY KEY,
      assessment_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      answers TEXT NOT NULL DEFAULT '[]',
      score INTEGER,
      status TEXT NOT NULL DEFAULT 'submitted',
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
      graded_at TEXT,
      FOREIGN KEY (assessment_id) REFERENCES ${ASSESSMENT_TABLE}(id)
    )
  `);

  const assessmentRepository: AssessmentRepository = {
    async findById(id: string) {
      const row = db
        .prepare(`SELECT * FROM ${ASSESSMENT_TABLE} WHERE id = ?`)
        .get(id) as Record<string, unknown> | undefined;
      return row ?? null;
    },

    async findByCourseId(courseId: string) {
      return db
        .prepare(`SELECT * FROM ${ASSESSMENT_TABLE} WHERE course_id = ?`)
        .all(courseId) as Readonly<Record<string, unknown>>[];
    },

    async create(data: Readonly<Record<string, unknown>>) {
      const stmt = db.prepare(`
        INSERT INTO ${ASSESSMENT_TABLE} (id, course_id, title, type, total_points, duration_minutes)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        data["id"],
        data["courseId"],
        data["title"],
        data["type"],
        data["totalPoints"],
        data["durationMinutes"] ?? null,
      );
      const row = db
        .prepare(`SELECT * FROM ${ASSESSMENT_TABLE} WHERE id = ?`)
        .get(data["id"]) as Record<string, unknown>;
      return row;
    },

    async findSubmissionById(id: string) {
      const row = db
        .prepare(`SELECT * FROM ${SUBMISSION_TABLE} WHERE id = ?`)
        .get(id) as Record<string, unknown> | undefined;
      return row ?? null;
    },

    async findSubmissionByStudentAndAssessment(
      studentId: string,
      assessmentId: string,
    ) {
      const row = db
        .prepare(
          `SELECT * FROM ${SUBMISSION_TABLE} WHERE student_id = ? AND assessment_id = ?`,
        )
        .get(studentId, assessmentId) as Record<string, unknown> | undefined;
      return row ?? null;
    },

    async createSubmission(data: Readonly<Record<string, unknown>>) {
      const stmt = db.prepare(`
        INSERT INTO ${SUBMISSION_TABLE} (id, assessment_id, student_id, answers, status)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(
        data["id"],
        data["assessmentId"],
        data["studentId"],
        data["answers"],
        data["status"] ?? "submitted",
      );
      const row = db
        .prepare(`SELECT * FROM ${SUBMISSION_TABLE} WHERE id = ?`)
        .get(data["id"]) as Record<string, unknown>;
      return row;
    },

    async updateSubmissionScore(id: string, score: number) {
      db.prepare(
        `UPDATE ${SUBMISSION_TABLE} SET score = ?, status = 'graded', graded_at = datetime('now') WHERE id = ?`,
      ).run(score, id);
      const row = db
        .prepare(`SELECT * FROM ${SUBMISSION_TABLE} WHERE id = ?`)
        .get(id) as Record<string, unknown>;
      return row;
    },

    async findSubmissionsByAssessment(assessmentId: string) {
      return db
        .prepare(`SELECT * FROM ${SUBMISSION_TABLE} WHERE assessment_id = ?`)
        .all(assessmentId) as Readonly<Record<string, unknown>>[];
    },

    async findSubmissionsByStudent(studentId: string) {
      return db
        .prepare(`SELECT * FROM ${SUBMISSION_TABLE} WHERE student_id = ?`)
        .all(studentId) as Readonly<Record<string, unknown>>[];
    },
  };

  return assessmentRepository;
}
