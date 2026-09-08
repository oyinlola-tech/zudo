/**
 * @zudojs/docs/errors
 *
 * The documentation error hierarchy is defined in `@zudojs/errors` and
 * re-exported here so consumers can discriminate registry and builder
 * failures with `instanceof` without a second import.
 */

import { DocumentationError } from "@zudojs/errors";
import type { DocumentationErrorOptions } from "@zudojs/errors";

export {
  DocumentationError,
  DocumentParseError,
  DocumentValidationError,
  DuplicateDocumentError,
  DocumentNotFoundError,
  BrokenDocumentationLinkError,
  InvalidFrontmatterError,
  InvalidNavigationError,
  ExampleValidationError,
  GenerationError,
  DocumentationVersionError,
} from "@zudojs/errors";

export type { DocumentationErrorOptions } from "@zudojs/errors";

/** Creates a generic documentation error. */
export function createDocumentationError(
  message: string,
  options?: DocumentationErrorOptions,
): DocumentationError {
  return new DocumentationError(message, options);
}

/** Determines whether an unknown value is a `DocumentationError`. */
export function isDocumentationError(
  value: unknown,
): value is DocumentationError {
  return value instanceof DocumentationError;
}
