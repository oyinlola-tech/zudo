/**
 * Specific OpenAPI error subclasses.
 *
 * Each subclass supplies a default `code`, `statusCode` and `expose`, and each
 * lets the caller override them — the options are spread *after* the defaults,
 * so a value passed in is the value used.
 */

import { OpenAPIError, type OpenAPIErrorOptions } from "./openApiError.base.js";

/** A single validation issue. */
export interface OpenAPIValidationIssue {
  /** Location of the problem, as a path through the document. */
  readonly path: readonly (string | number)[];
  readonly message: string;
  readonly severity: "error" | "warning";
}

/** Renders an issue path the way a reader would write it. */
export function formatIssuePath(path: readonly (string | number)[]): string {
  return path
    .map((segment) => (typeof segment === "number" ? `[${segment}]` : segment))
    .join(".")
    .replace(/\.\[/g, "[");
}

/**
 * Error thrown when OpenAPI validation fails.
 *
 * The issues are kept on the error. Discarding them left callers with the
 * message "OpenAPI validation failed." and no way to learn what was wrong
 * short of re-running the validator.
 */
export class OpenAPIValidationError extends OpenAPIError {
  readonly issues: readonly OpenAPIValidationIssue[];

  constructor(
    message: string,
    issues: readonly OpenAPIValidationIssue[] = [],
    options: OpenAPIErrorOptions = {},
  ) {
    super(message, {
      code: "OPENAPI_VALIDATION",
      statusCode: 500,
      expose: false,
      ...options,
      metadata: {
        issueCount: issues.length,
        issues: issues.map((issue) => ({
          path: formatIssuePath(issue.path),
          message: issue.message,
          severity: issue.severity,
        })),
        ...(options.metadata ?? {}),
      },
    });
    this.name = "OpenAPIValidationError";
    this.issues = Object.freeze([...issues]);
  }

  /** A multi-line summary suitable for a log line or a CLI. */
  format(): string {
    if (this.issues.length === 0) return this.message;
    const lines = this.issues.map(
      (issue) =>
        `  ${issue.severity}: ${formatIssuePath(issue.path)} — ${issue.message}`,
    );
    return [this.message, ...lines].join("\n");
  }
}

/** Error thrown when the OpenAPI document is invalid. */
export class OpenAPIDocumentError extends OpenAPIError {
  constructor(message: string, options: OpenAPIErrorOptions = {}) {
    super(message, {
      code: "OPENAPI_DOCUMENT",
      statusCode: 500,
      expose: false,
      ...options,
    });
    this.name = "OpenAPIDocumentError";
  }
}

/** Error thrown when an OpenAPI component is invalid. */
export class OpenAPIComponentError extends OpenAPIError {
  constructor(message: string, options: OpenAPIErrorOptions = {}) {
    super(message, {
      code: "OPENAPI_COMPONENT",
      statusCode: 500,
      expose: false,
      ...options,
    });
    this.name = "OpenAPIComponentError";
  }
}

/** Error thrown when a component name is already registered. */
export class OpenAPIComponentConflictError extends OpenAPIError {
  readonly section: string;
  readonly componentName: string;

  constructor(
    section: string,
    componentName: string,
    options: OpenAPIErrorOptions = {},
  ) {
    super(
      `A component named "${componentName}" is already registered under "${section}". ` +
        `Component names must be unique within a section.`,
      {
        code: "OPENAPI_COMPONENT_CONFLICT",
        statusCode: 500,
        expose: false,
        ...options,
        metadata: { section, componentName, ...(options.metadata ?? {}) },
      },
    );
    this.name = "OpenAPIComponentConflictError";
    this.section = section;
    this.componentName = componentName;
  }
}

/** Error thrown when an OpenAPI reference is invalid or cannot be resolved. */
export class OpenAPIReferenceError extends OpenAPIError {
  readonly reference: string;

  constructor(reference: string, options: OpenAPIErrorOptions = {}) {
    super(`Unresolvable OpenAPI reference: "${reference}".`, {
      code: "OPENAPI_REFERENCE",
      statusCode: 500,
      expose: false,
      ...options,
      metadata: { reference, ...(options.metadata ?? {}) },
    });
    this.name = "OpenAPIReferenceError";
    this.reference = reference;
  }
}

/** Error thrown when an OpenAPI route cannot be converted. */
export class OpenAPIRouteError extends OpenAPIError {
  constructor(message: string, options: OpenAPIErrorOptions = {}) {
    super(message, {
      code: "OPENAPI_ROUTE",
      statusCode: 500,
      expose: false,
      ...options,
    });
    this.name = "OpenAPIRouteError";
  }
}

/** Error thrown when an OpenAPI schema is invalid. */
export class OpenAPISchemaError extends OpenAPIError {
  constructor(message: string, options: OpenAPIErrorOptions = {}) {
    super(message, {
      code: "OPENAPI_SCHEMA",
      statusCode: 500,
      expose: false,
      ...options,
    });
    this.name = "OpenAPISchemaError";
  }
}

/** Error thrown when OpenAPI serialization fails. */
export class OpenAPISerializationError extends OpenAPIError {
  constructor(message: string, options: OpenAPIErrorOptions = {}) {
    super(message, {
      code: "OPENAPI_SERIALIZATION",
      statusCode: 500,
      expose: false,
      ...options,
    });
    this.name = "OpenAPISerializationError";
  }
}

/** Error thrown when the OpenAPI version is unsupported. */
export class OpenAPIVersionError extends OpenAPIError {
  readonly version: string;

  constructor(
    version: string,
    supported: readonly string[] = [],
    options: OpenAPIErrorOptions = {},
  ) {
    super(
      `Unsupported OpenAPI version "${version}".` +
        (supported.length > 0 ? ` Supported: ${supported.join(", ")}.` : ""),
      {
        code: "OPENAPI_VERSION",
        statusCode: 500,
        expose: false,
        ...options,
        metadata: { version, supported, ...(options.metadata ?? {}) },
      },
    );
    this.name = "OpenAPIVersionError";
    this.version = version;
  }
}

/** Error thrown when an OpenAPI operation is invalid. */
export class OpenAPIOperationError extends OpenAPIError {
  constructor(message: string, options: OpenAPIErrorOptions = {}) {
    super(message, {
      code: "OPENAPI_OPERATION",
      statusCode: 500,
      expose: false,
      ...options,
    });
    this.name = "OpenAPIOperationError";
  }
}
