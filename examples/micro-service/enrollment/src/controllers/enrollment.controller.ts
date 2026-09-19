import type { CommandBus, QueryBus } from "@zudojs/cqrs";
import type { EnrollmentId, StudentId } from "../types/index.js";
import { EnrollStudentCommand } from "../services/enrollment/commands/enroll-student/enroll-student.command.js";
import { WithdrawStudentCommand } from "../services/enrollment/commands/withdraw-student/withdraw-student.command.js";
import { GetEnrollmentQuery } from "../services/enrollment/queries/get-enrollment/get-enrollment.query.js";
import { ListStudentEnrollmentsQuery } from "../services/enrollment/queries/list-student-enrollments/list-student-enrollments.query.js";

/** HTTP controller for enrollment-related endpoints. */
export class EnrollmentController {
  private readonly commandBus: CommandBus;
  private readonly queryBus: QueryBus;

  public constructor(commandBus: CommandBus, queryBus: QueryBus) {
    this.commandBus = commandBus;
    this.queryBus = queryBus;
  }

  /** Enrolls a student in a course. */
  public async enroll(body: { studentId: string; courseId: string }) {
    return this.commandBus.execute(new EnrollStudentCommand(body as any));
  }

  /** Withdraws a student from a course. */
  public async withdraw(body: { studentId: string; courseId: string }) {
    return this.commandBus.execute(new WithdrawStudentCommand(body as any));
  }

  /** Retrieves a single enrollment by ID. */
  public async get(enrollmentId: EnrollmentId) {
    return this.queryBus.execute(new GetEnrollmentQuery(enrollmentId));
  }

  /** Lists all enrollments for a student. */
  public async listByStudent(studentId: StudentId) {
    return this.queryBus.execute(new ListStudentEnrollmentsQuery(studentId));
  }
}
