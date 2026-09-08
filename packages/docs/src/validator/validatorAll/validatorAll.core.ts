/**
 * Validates an entire documentation set.
 */

import type {
  DocumentationDocument,
  DocumentationNavigationItem,
} from "../../docsTypes/index.js";
import { flattenNavigation } from "../../navigation/navigation.core.js";
import {
  toValidationResult,
  type ValidationResult,
  type ValidationIssue,
} from "../validator.types.js";
import { validateDocument } from "../validatorDocument.core.js";
import { validateNoDuplicateIds } from "../validatorDuplicates.core.js";
import {
  validateLinks,
  type ValidateLinksOptions,
} from "../validatorLinks.core.js";
import { validateNavigation } from "./validatorNavigation.core.js";

/** Options for `validateAll`. */
export interface ValidateAllOptions extends ValidateLinksOptions {
  /**
   * When a navigation tree is supplied, report documents that do not
   * appear in it as `NAVIGATION_ORPHAN_DOCUMENT` warnings. Default true.
   */
  readonly reportOrphans?: boolean;
}

/**
 * Validates all documents and optionally a navigation tree.
 */
export function validateAll(
  documents: readonly DocumentationDocument[],
  navigation?: readonly DocumentationNavigationItem[],
  options: ValidateAllOptions = {},
): ValidationResult {
  const allIssues: ValidationIssue[] = [];

  const idResult = validateNoDuplicateIds(documents);
  allIssues.push(...idResult.issues);

  const registeredIds = new Set(documents.map((d) => d.id));

  for (const doc of documents) {
    const docResult = validateDocument(doc);
    allIssues.push(...docResult.issues);

    const linkResult = validateLinks(doc, registeredIds, options);
    allIssues.push(...linkResult.issues);
  }

  if (navigation) {
    const navResult = validateNavigation(navigation, registeredIds);
    allIssues.push(...navResult.issues);

    if (options.reportOrphans ?? true) {
      const inNavigation = new Set(flattenNavigation(navigation));

      for (const id of registeredIds) {
        if (!inNavigation.has(id)) {
          allIssues.push({
            severity: "warning",
            code: "NAVIGATION_ORPHAN_DOCUMENT",
            message: `Document "${id}" is not reachable from the navigation.`,
            documentId: id,
          });
        }
      }
    }
  }

  return toValidationResult(allIssues);
}
