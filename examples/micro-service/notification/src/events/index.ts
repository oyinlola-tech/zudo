import { defineEvent } from "@zudojs/events";

export interface UserCreatedPayload {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly role: string;
}

export interface StudentEnrolledPayload {
  readonly studentId: string;
  readonly courseId: string;
  readonly enrollmentId: string;
}

export interface AssessmentSubmittedPayload {
  readonly studentId: string;
  readonly assessmentId: string;
  readonly submissionId: string;
  readonly assessmentTitle: string;
  readonly courseId: string;
}

export interface ResultPublishedPayload {
  readonly studentId: string;
  readonly assessmentId: string;
  readonly courseId: string;
  readonly assessmentTitle: string;
  readonly score: number;
  readonly maxScore: number;
}

export const UserCreatedEvent = defineEvent<"user.created", UserCreatedPayload>(
  "user.created",
);
export const StudentEnrolledEvent = defineEvent<
  "student.enrolled",
  StudentEnrolledPayload
>("student.enrolled");
export const AssessmentSubmittedEvent = defineEvent<
  "assessment.submitted",
  AssessmentSubmittedPayload
>("assessment.submitted");
export const ResultPublishedEvent = defineEvent<
  "result.published",
  ResultPublishedPayload
>("result.published");
