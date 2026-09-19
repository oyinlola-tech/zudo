/** Represents the lifecycle status of a student enrollment. */
export enum EnrollmentStatus {
  /** Student is actively enrolled in the course. */
  ACTIVE = "active",
  /** Student has withdrawn from the course. */
  WITHDRAWN = "withdrawn",
  /** Student completed the course successfully. */
  COMPLETED = "completed",
  /** Enrollment was dropped due to academic or administrative reasons. */
  DROPPED = "dropped",
}
