import { Query } from "@zudojs/cqrs";
import type { EnrollmentId } from "../../../../types/index.js";

/** Query to retrieve a single enrollment by its identifier. */
export class GetEnrollmentQuery extends Query<"enrollment.get"> {
  /** The enrollment identifier to look up. */
  public readonly enrollmentId: EnrollmentId;

  public constructor(enrollmentId: EnrollmentId) {
    super("enrollment.get");
    this.enrollmentId = enrollmentId;
  }
}
