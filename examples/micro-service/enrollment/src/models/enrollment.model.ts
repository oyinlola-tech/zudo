import type { EnrollmentId, StudentId, CourseId } from "../types/index.js";
import type { EnrollmentStatus } from "../enums/index.js";

/** Core enrollment domain model. */
export interface EnrollmentModel {
  /** Unique enrollment identifier. */
  readonly id: EnrollmentId;
  /** The enrolled student's identifier. */
  readonly studentId: StudentId;
  /** The course identifier. */
  readonly courseId: CourseId;
  /** Current enrollment status. */
  readonly status: EnrollmentStatus;
  /** When the enrollment was created. */
  readonly createdAt: Date;
  /** When the enrollment was last updated. */
  readonly updatedAt: Date;
  /** When the student was withdrawn (if applicable). */
  readonly withdrawnAt: Date | null;
}
