import type { StudentId, CourseId } from "../types/index.js";

/** Data transfer object for enrolling a student in a course. */
export interface EnrollStudentDto {
  /** The student to enroll. */
  readonly studentId: StudentId;
  /** The course to enroll in. */
  readonly courseId: CourseId;
}

/** Data transfer object for withdrawing a student from a course. */
export interface WithdrawStudentDto {
  /** The student to withdraw. */
  readonly studentId: StudentId;
  /** The course to withdraw from. */
  readonly courseId: CourseId;
}
