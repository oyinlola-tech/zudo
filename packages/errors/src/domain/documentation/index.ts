/**
 * @zudojs/errors/documentation
 *
 * Documentation-specific error types.
 */

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
  createDocumentationError,
  isDocumentationError,
} from "./documentation.error.js";

export type { DocumentationErrorOptions } from "./documentation.error.js";
