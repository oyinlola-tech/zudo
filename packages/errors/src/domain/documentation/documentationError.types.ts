/**
 * Specific documentation error classes.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import {
  DocumentationError,
  type DocumentationErrorOptions,
} from "./documentationError.base.js";

/** Error thrown when a document fails to parse. */
export class DocumentParseError extends DocumentationError {
  constructor(
    message: string,
    documentId?: string,
    options: DocumentationErrorOptions = {},
  ) {
    super(message, {
      ...options,
      code: ErrorCode.DOCUMENT_PARSE,
      documentId,
      statusCode: 400,
      expose: true,
    });
  }
}

/** Error thrown when a document fails validation. */
export class DocumentValidationError extends DocumentationError {
  constructor(
    message: string,
    documentId?: string,
    options: DocumentationErrorOptions = {},
  ) {
    super(message, {
      ...options,
      code: ErrorCode.DOCUMENT_VALIDATION,
      documentId,
      statusCode: 422,
      expose: true,
    });
  }
}

/** Error thrown when a duplicate document ID is detected. */
export class DuplicateDocumentError extends DocumentationError {
  constructor(documentId: string, options: DocumentationErrorOptions = {}) {
    super(`Document "${documentId}" is already registered.`, {
      ...options,
      code: ErrorCode.DOCUMENT_DUPLICATE,
      documentId,
      statusCode: 409,
      expose: true,
    });
  }
}

/** Error thrown when a document is not found. */
export class DocumentNotFoundError extends DocumentationError {
  constructor(documentId: string, options: DocumentationErrorOptions = {}) {
    super(`Document "${documentId}" was not found.`, {
      ...options,
      code: ErrorCode.DOCUMENT_NOT_FOUND,
      documentId,
      statusCode: 404,
      expose: true,
    });
  }
}

/** Error thrown when a documentation link is broken. */
export class BrokenDocumentationLinkError extends DocumentationError {
  public readonly target: string;

  constructor(
    source: string,
    target: string,
    options: DocumentationErrorOptions = {},
  ) {
    super(`Broken link in "${source}": target "${target}" does not exist.`, {
      ...options,
      code: ErrorCode.DOCUMENT_LINK_BROKEN,
      documentId: source,
      metadata: { ...options.metadata, source, target },
      statusCode: 400,
      expose: true,
    });
    this.target = target;
  }
}

/** Error thrown when frontmatter is invalid. */
export class InvalidFrontmatterError extends DocumentationError {
  constructor(
    message: string,
    documentId?: string,
    options: DocumentationErrorOptions = {},
  ) {
    super(message, {
      ...options,
      code: ErrorCode.DOCUMENT_FRONTMATTER_INVALID,
      documentId,
      statusCode: 400,
      expose: true,
    });
  }
}

/** Error thrown when navigation is invalid. */
export class InvalidNavigationError extends DocumentationError {
  constructor(message: string, options: DocumentationErrorOptions = {}) {
    super(message, {
      ...options,
      code: ErrorCode.DOCUMENT_NAVIGATION_INVALID,
      statusCode: 400,
      expose: true,
    });
  }
}

/** Error thrown when a documentation example fails validation. */
export class ExampleValidationError extends DocumentationError {
  constructor(
    message: string,
    documentId?: string,
    options: DocumentationErrorOptions = {},
  ) {
    super(message, {
      ...options,
      code: ErrorCode.DOCUMENT_EXAMPLE_INVALID,
      documentId,
      statusCode: 422,
      expose: true,
    });
  }
}

/** Error thrown when documentation generation fails. */
export class GenerationError extends DocumentationError {
  constructor(message: string, options: DocumentationErrorOptions = {}) {
    super(message, {
      ...options,
      code: ErrorCode.DOCUMENT_GENERATION,
      statusCode: 500,
      expose: false,
    });
  }
}

/** Error thrown when a documentation version operation fails. */
export class DocumentationVersionError extends DocumentationError {
  constructor(message: string, options: DocumentationErrorOptions = {}) {
    super(message, {
      ...options,
      code: ErrorCode.DOCUMENT_VERSION,
      statusCode: 400,
      expose: true,
    });
  }
}
