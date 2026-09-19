import { Query } from "@zudojs/cqrs";
import type { StudentId } from "../../../../types/index.js";

/** Query to list all enrollments for a specific student. */
export class ListStudentEnrollmentsQuery extends Query<"enrollment.list-student"> {
  /** The student whose enrollments to list. */
  public readonly studentId: StudentId;

  public constructor(studentId: StudentId) {
    super("enrollment.list-student");
    this.studentId = studentId;
  }
}
