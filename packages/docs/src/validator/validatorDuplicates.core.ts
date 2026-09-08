/**
 * Validates that no documents share the same ID.
 */

import type { DocumentationDocument } from "../docsTypes/index.js";
import {
  toValidationResult,
  type ValidationResult,
  type ValidationIssue,
} from "./validator.types.js";

/**
 * Validates no duplicate IDs exist in a collection of documents.
 */
export function validateNoDuplicateIds(
  documents: readonly DocumentationDocument[],
): ValidationResult {
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];

  for (const doc of documents) {
    if (seen.has(doc.id)) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_ID",
        message: `Duplicate document ID: "${doc.id}".`,
        documentId: doc.id,
      });
    } else {
      seen.add(doc.id);
    }
  }

  return toValidationResult(issues);
}
