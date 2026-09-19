/** Base application error class for the enrollment service. */
export class ApplicationError extends Error {
  /** Machine-readable error code. */
  public readonly code: string;
  /** HTTP status code. */
  public readonly statusCode: number;
  /** Whether the error message is safe to expose to clients. */
  public readonly expose: boolean;

  public constructor(
    message: string,
    options: {
      readonly code?: string;
      readonly statusCode?: number;
      readonly expose?: boolean;
      readonly cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ApplicationError";
    this.code = options.code ?? "APPLICATION_ERROR";
    this.statusCode = options.statusCode ?? 500;
    this.expose = options.expose ?? false;
  }
}

/** Error thrown when a requested resource is not found. */
export class NotFoundError extends ApplicationError {
  public constructor(resource: string, id?: string) {
    const message = id
      ? `${resource} with id "${id}" not found`
      : `${resource} not found`;
    super(message, { code: "NOT_FOUND", statusCode: 404, expose: true });
    this.name = "NotFoundError";
  }
}

/** Error thrown when input validation fails. */
export class ValidationError extends ApplicationError {
  public readonly issues: readonly { path: string; message: string }[];

  public constructor(
    message: string,
    issues: readonly { path: string; message: string }[] = [],
  ) {
    super(message, { code: "VALIDATION_ERROR", statusCode: 400, expose: true });
    this.name = "ValidationError";
    this.issues = issues;
  }
}

/** Error thrown when an operation conflicts with existing state. */
export class ConflictError extends ApplicationError {
  public constructor(message: string) {
    super(message, { code: "CONFLICT", statusCode: 409, expose: true });
    this.name = "ConflictError";
  }
}

/** Error thrown when a student is already enrolled in the specified course. */
export class AlreadyEnrolledError extends ConflictError {
  public constructor(studentId: string, courseId: string) {
    super(`Student "${studentId}" is already enrolled in course "${courseId}"`);
    this.name = "AlreadyEnrolledError";
  }
}

/** Error thrown when a student is not enrolled in the specified course. */
export class NotEnrolledError extends NotFoundError {
  public constructor(studentId: string, courseId: string) {
    super("Enrollment", `${studentId}:${courseId}`);
    this.name = "NotEnrolledError";
  }
}

/** Error thrown when a student has exceeded the maximum enrollment limit. */
export class EnrollmentLimitExceededError extends ApplicationError {
  public constructor(studentId: string, limit: number) {
    super(
      `Student "${studentId}" has reached the maximum enrollment limit of ${limit}`,
      { code: "ENROLLMENT_LIMIT_EXCEEDED", statusCode: 400, expose: true },
    );
    this.name = "EnrollmentLimitExceededError";
  }
}
