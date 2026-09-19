import { defineEvent } from "@zudojs/events";

export interface AssessmentCreatedPayload {
  readonly assessmentId: string;
  readonly courseId: string;
  readonly title: string;
  readonly type: string;
  readonly totalPoints: number;
  readonly durationMinutes: number | null;
  readonly createdAt: Date;
}

export interface AssessmentSubmittedPayload {
  readonly submissionId: string;
  readonly assessmentId: string;
  readonly studentId: string;
  readonly submittedAt: Date;
}

export interface ResultPublishedPayload {
  readonly submissionId: string;
  readonly assessmentId: string;
  readonly studentId: string;
  readonly score: number;
  readonly gradedAt: Date;
}

export const AssessmentCreatedEvent = defineEvent<
  "assessment.created",
  AssessmentCreatedPayload
>("assessment.created");
export const AssessmentSubmittedEvent = defineEvent<
  "assessment.submitted",
  AssessmentSubmittedPayload
>("assessment.submitted");
export const ResultPublishedEvent = defineEvent<
  "result.published",
  ResultPublishedPayload
>("result.published");
