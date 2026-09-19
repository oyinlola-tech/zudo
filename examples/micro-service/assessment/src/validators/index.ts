import type {
  CreateAssessmentDto,
  SubmitAssessmentDto,
  PublishResultDto,
} from "../dtos/index.js";
import { AssessmentType } from "../enums/index.js";

export function validateCreateAssessment(dto: CreateAssessmentDto): string[] {
  const errors: string[] = [];

  if (!dto.courseId || dto.courseId.trim().length === 0) {
    errors.push("courseId is required");
  }

  if (!dto.title || dto.title.trim().length === 0) {
    errors.push("title is required");
  }

  if (!Object.values(AssessmentType).includes(dto.type as AssessmentType)) {
    errors.push(
      `type must be one of: ${Object.values(AssessmentType).join(", ")}`,
    );
  }

  if (dto.totalPoints <= 0) {
    errors.push("totalPoints must be greater than 0");
  }

  if (
    dto.durationMinutes !== undefined &&
    dto.durationMinutes !== null &&
    dto.durationMinutes <= 0
  ) {
    errors.push("durationMinutes must be greater than 0");
  }

  return errors;
}

export function validateSubmitAssessment(dto: SubmitAssessmentDto): string[] {
  const errors: string[] = [];

  if (!dto.assessmentId || dto.assessmentId.trim().length === 0) {
    errors.push("assessmentId is required");
  }

  if (!dto.studentId || dto.studentId.trim().length === 0) {
    errors.push("studentId is required");
  }

  if (!dto.answers || dto.answers.trim().length === 0) {
    errors.push("answers is required");
  }

  return errors;
}

export function validatePublishResult(dto: PublishResultDto): string[] {
  const errors: string[] = [];

  if (!dto.submissionId || dto.submissionId.trim().length === 0) {
    errors.push("submissionId is required");
  }

  if (dto.score < 0) {
    errors.push("score must be non-negative");
  }

  return errors;
}
