import { QueryHandler } from "@zudojs/cqrs";
import type { GetEnrollmentQuery } from "./get-enrollment.query.js";
import type { EnrollmentRepository } from "../../../../repositories/enrollment.repository.js";
import type { EnrollmentModel } from "../../../../models/enrollment.model.js";
import { NotFoundError } from "../../../../errors/index.js";

/** Handler that processes GetEnrollmentQuery. */
export class GetEnrollmentHandler extends QueryHandler<
  GetEnrollmentQuery,
  EnrollmentModel
> {
  /** The query type this handler processes. */
  public readonly queryType = "enrollment.get" as const;

  private readonly enrollments: EnrollmentRepository;

  public constructor(enrollments: EnrollmentRepository) {
    super();
    this.enrollments = enrollments;
  }

  public async execute(query: GetEnrollmentQuery): Promise<EnrollmentModel> {
    const enrollment = await this.enrollments.findById(query.enrollmentId);
    if (!enrollment) {
      throw new NotFoundError("Enrollment", query.enrollmentId);
    }
    return enrollment;
  }
}
