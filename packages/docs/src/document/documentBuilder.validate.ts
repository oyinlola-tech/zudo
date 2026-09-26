/**
 * Input and strict-mode checks for `createDocument`.
 *
 * @module document/documentBuilder.validate
 */

import { DocumentValidationError } from "@zudojs/errors";

import type { DocumentationDocument } from "../docsTypes/index.js";
import { isValidDocumentId } from "../utils/utils.helper.js";
import { validateDocument } from "../validator/validatorDocument.core.js";
import type { DocumentBuilderOptions } from "./documentBuilder.core.js";

/**
 * Validates document builder options.
 * Throws on invalid input.
 */
export function validateDocumentOptions(options: DocumentBuilderOptions): void {
  if (typeof options.id !== "string" || options.id.trim().length === 0) {
    throw new DocumentValidationError("Document ID is required.");
  }

  if (!isValidDocumentId(options.id)) {
    throw new DocumentValidationError(
      `Document ID "${options.id}" is invalid. Use dot-separated segments of letters, digits, "_" and "-".`,
      options.id,
    );
  }

  if (
    typeof options.title !== "string" ||
    options.title.trim().length === 0
  ) {
    throw new DocumentValidationError(
      "Document title is required.",
      options.id,
    );
  }

  if (!options.content || typeof options.content !== "object") {
    throw new DocumentValidationError(
      "Document content is required.",
      options.id,
    );
  }
}

/**
 * Throws when `validateDocument` reports an error issue for `document`.
 */
export function assertValid(document: DocumentationDocument): void {
  const failure = validateDocument(document).issues.find(
    (issue) => issue.severity === "error",
  );

  if (failure) {
    throw new DocumentValidationError(failure.message, document.id);
  }
}
