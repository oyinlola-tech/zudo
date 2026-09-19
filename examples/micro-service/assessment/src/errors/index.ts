import { BaseError } from "@zudojs/errors";
import type { BaseErrorOptions } from "@zudojs/errors";

export class AssessmentNotFoundError extends BaseError {
  constructor(assessmentId: string, options: BaseErrorOptions = {}) {
    super(`Assessment with id "${assessmentId}" was not found.`, {
      ...options,
      code: options.code ?? "ASSESSMENT_NOT_FOUND",
      statusCode: options.statusCode ?? 404,
      expose: true,
    });
  }
}

export class SubmissionNotFoundError extends BaseError {
  constructor(submissionId: string, options: BaseErrorOptions = {}) {
    super(`Submission with id "${submissionId}" was not found.`, {
      ...options,
      code: options.code ?? "SUBMISSION_NOT_FOUND",
      statusCode: options.statusCode ?? 404,
      expose: true,
    });
  }
}

export class DuplicateSubmissionError extends BaseError {
  constructor(
    studentId: string,
    assessmentId: string,
    options: BaseErrorOptions = {},
  ) {
    super(
      `Student "${studentId}" has already submitted assessment "${assessmentId}".`,
      {
        ...options,
        code: options.code ?? "DUPLICATE_SUBMISSION",
        statusCode: options.statusCode ?? 409,
        expose: true,
      },
    );
  }
}

export class InvalidAssessmentTypeError extends BaseError {
  constructor(type: string, options: BaseErrorOptions = {}) {
    super(`Invalid assessment type: "${type}".`, {
      ...options,
      code: options.code ?? "INVALID_ASSESSMENT_TYPE",
      statusCode: options.statusCode ?? 400,
      expose: true,
    });
  }
}
