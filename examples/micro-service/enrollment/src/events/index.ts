import { defineEvent } from "@zudojs/events";
import type { StudentId, CourseId, EnrollmentId } from "../types/index.js";

/** Event emitted when a student is successfully enrolled in a course. */
export const StudentEnrolledEvent = defineEvent<
  "enrollment.student-enrolled",
  {
    readonly enrollmentId: EnrollmentId;
    readonly studentId: StudentId;
    readonly courseId: CourseId;
    readonly enrolledAt: Date;
  }
>("enrollment.student-enrolled");

/** Event emitted when a student withdraws from a course. */
export const StudentWithdrawnEvent = defineEvent<
  "enrollment.student-withdrawn",
  {
    readonly enrollmentId: EnrollmentId;
    readonly studentId: StudentId;
    readonly courseId: CourseId;
    readonly withdrawnAt: Date;
  }
>("enrollment.student-withdrawn");
