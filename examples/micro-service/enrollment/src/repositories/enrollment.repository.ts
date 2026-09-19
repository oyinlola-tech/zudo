import { getDatabase } from "../databases/enrollment.database.js";
import type { EnrollmentModel } from "../models/enrollment.model.js";
import type { EnrollmentId, StudentId, CourseId } from "../types/index.js";
import type { EnrollmentStatus } from "../enums/index.js";

/** Repository interface for enrollment data access. */
export interface EnrollmentRepository {
  /** Finds an enrollment by its unique identifier. */
  findById(id: EnrollmentId): Promise<EnrollmentModel | null>;
  /** Finds an enrollment by student and course combination. */
  findByStudentAndCourse(
    studentId: StudentId,
    courseId: CourseId,
  ): Promise<EnrollmentModel | null>;
  /** Returns all enrollments for a given student. */
  findByStudentId(studentId: StudentId): Promise<readonly EnrollmentModel[]>;
  /** Returns all enrollments for a given course. */
  findByCourseId(courseId: CourseId): Promise<readonly EnrollmentModel[]>;
  /** Persists a new enrollment. */
  save(enrollment: EnrollmentModel): Promise<void>;
  /** Updates the status of an enrollment. */
  updateStatus(
    id: EnrollmentId,
    status: EnrollmentStatus,
    withdrawnAt?: Date,
  ): Promise<void>;
  /** Counts active enrollments for a student. */
  countActiveByStudentId(studentId: StudentId): Promise<number>;
}

/** SQLite implementation of the EnrollmentRepository. */
export class SqliteEnrollmentRepository implements EnrollmentRepository {
  public async findById(id: EnrollmentId): Promise<EnrollmentModel | null> {
    const db = getDatabase();
    const row = db.prepare("SELECT * FROM enrollments WHERE id = ?").get(id) as
      Record<string, unknown> | undefined;
    return row ? mapRowToEnrollment(row) : null;
  }

  public async findByStudentAndCourse(
    studentId: StudentId,
    courseId: CourseId,
  ): Promise<EnrollmentModel | null> {
    const db = getDatabase();
    const row = db
      .prepare(
        "SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?",
      )
      .get(studentId, courseId) as Record<string, unknown> | undefined;
    return row ? mapRowToEnrollment(row) : null;
  }

  public async findByStudentId(
    studentId: StudentId,
  ): Promise<readonly EnrollmentModel[]> {
    const db = getDatabase();
    const rows = db
      .prepare(
        "SELECT * FROM enrollments WHERE student_id = ? ORDER BY created_at DESC",
      )
      .all(studentId) as Record<string, unknown>[];
    return rows.map(mapRowToEnrollment);
  }

  public async findByCourseId(
    courseId: CourseId,
  ): Promise<readonly EnrollmentModel[]> {
    const db = getDatabase();
    const rows = db
      .prepare(
        "SELECT * FROM enrollments WHERE course_id = ? ORDER BY created_at DESC",
      )
      .all(courseId) as Record<string, unknown>[];
    return rows.map(mapRowToEnrollment);
  }

  public async save(enrollment: EnrollmentModel): Promise<void> {
    const db = getDatabase();
    db.prepare(
      `
      INSERT INTO enrollments (id, student_id, course_id, status, created_at, updated_at, withdrawn_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      enrollment.id,
      enrollment.studentId,
      enrollment.courseId,
      enrollment.status,
      enrollment.createdAt.toISOString(),
      enrollment.updatedAt.toISOString(),
      enrollment.withdrawnAt?.toISOString() ?? null,
    );
  }

  public async updateStatus(
    id: EnrollmentId,
    status: EnrollmentStatus,
    withdrawnAt?: Date,
  ): Promise<void> {
    const db = getDatabase();
    db.prepare(
      `
      UPDATE enrollments
      SET status = ?, updated_at = datetime('now'), withdrawn_at = ?
      WHERE id = ?
    `,
    ).run(status, withdrawnAt?.toISOString() ?? null, id);
  }

  public async countActiveByStudentId(studentId: StudentId): Promise<number> {
    const db = getDatabase();
    const row = db
      .prepare(
        "SELECT COUNT(*) as count FROM enrollments WHERE student_id = ? AND status = 'active'",
      )
      .get(studentId) as { count: number };
    return row.count;
  }
}

/**
 * Maps a raw database row to an EnrollmentModel.
 * @param row - The raw database row.
 * @returns A fully typed EnrollmentModel.
 */
function mapRowToEnrollment(row: Record<string, unknown>): EnrollmentModel {
  return {
    id: row["id"] as EnrollmentId,
    studentId: row["student_id"] as StudentId,
    courseId: row["course_id"] as CourseId,
    status: row["status"] as EnrollmentStatus,
    createdAt: new Date(row["created_at"] as string),
    updatedAt: new Date(row["updated_at"] as string),
    withdrawnAt:
      row["withdrawn_at"] != null
        ? new Date(row["withdrawn_at"] as string)
        : null,
  };
}
