import { QueryHandler } from "@zudojs/cqrs";
import type { ListStudentEnrollmentsQuery } from "./list-student-enrollments.query.js";
import type { EnrollmentRepository } from "../../../../repositories/enrollment.repository.js";
import type { EnrollmentModel } from "../../../../models/enrollment.model.js";

/** Handler that processes ListStudentEnrollmentsQuery. */
export class ListStudentEnrollmentsHandler extends QueryHandler<
  ListStudentEnrollmentsQuery,
  readonly EnrollmentModel[]
> {
  /** The query type this handler processes. */
  public readonly queryType = "enrollment.list-student" as const;

  private readonly enrollments: EnrollmentRepository;

  public constructor(enrollments: EnrollmentRepository) {
    super();
    this.enrollments = enrollments;
  }

  public async execute(
    query: ListStudentEnrollmentsQuery,
  ): Promise<readonly EnrollmentModel[]> {
    return this.enrollments.findByStudentId(query.studentId);
  }
}
