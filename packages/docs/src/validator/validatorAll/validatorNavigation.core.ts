/**
 * Validates navigation tree references against registered documents.
 */

import type { DocumentationNavigationItem } from "../../docsTypes/index.js";
import { MAX_NAVIGATION_DEPTH } from "../../navigation/navigation.core.js";
import {
  toValidationResult,
  type ValidationResult,
  type ValidationIssue,
} from "../validator.types.js";

/**
 * Validates navigation tree references.
 *
 * Reports `NAVIGATION_UNKNOWN_DOCUMENT` (error) for references to
 * unregistered documents, `NAVIGATION_CYCLE` (error) when a node is
 * its own ancestor or the tree is deeper than `MAX_NAVIGATION_DEPTH`,
 * `NAVIGATION_DUPLICATE_DOCUMENT` (warning) when a document is
 * referenced more than once, and `NAVIGATION_EMPTY_ITEM` (warning)
 * for items with neither `documentId` nor `children`.
 */
export function validateNavigation(
  items: readonly DocumentationNavigationItem[],
  registeredIds: ReadonlySet<string>,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const seenIds = new Set<string>();
  const visited = new WeakSet<DocumentationNavigationItem>();

  function walk(
    nodes: readonly DocumentationNavigationItem[],
    ancestors: readonly DocumentationNavigationItem[],
  ): void {
    if (ancestors.length > MAX_NAVIGATION_DEPTH) {
      issues.push({
        severity: "error",
        code: "NAVIGATION_CYCLE",
        message: `Navigation tree exceeds the maximum depth of ${MAX_NAVIGATION_DEPTH}.`,
      });
      return;
    }

    for (const node of nodes) {
      if (!node || typeof node !== "object") {
        issues.push({
          severity: "error",
          code: "NAVIGATION_EMPTY_ITEM",
          message: "Navigation item is not an object.",
        });
        continue;
      }

      if (ancestors.includes(node)) {
        issues.push({
          severity: "error",
          code: "NAVIGATION_CYCLE",
          message: `Navigation item "${node.title}" is its own ancestor.`,
        });
        continue;
      }

      if (visited.has(node)) continue;
      visited.add(node);

      if (node.documentId) {
        if (!registeredIds.has(node.documentId)) {
          issues.push({
            severity: "error",
            code: "NAVIGATION_UNKNOWN_DOCUMENT",
            message: `Navigation item "${node.title}" references unknown document "${node.documentId}".`,
            documentId: node.documentId,
          });
        }

        if (seenIds.has(node.documentId)) {
          issues.push({
            severity: "warning",
            code: "NAVIGATION_DUPLICATE_DOCUMENT",
            message: `Document "${node.documentId}" is referenced more than once in the navigation.`,
            documentId: node.documentId,
          });
        }
        seenIds.add(node.documentId);
      } else if (!node.children || node.children.length === 0) {
        issues.push({
          severity: "warning",
          code: "NAVIGATION_EMPTY_ITEM",
          message: `Navigation item "${node.title}" has neither a documentId nor children.`,
        });
      }

      if (node.children) {
        walk(node.children, [...ancestors, node]);
      }
    }
  }

  walk(items, []);

  return toValidationResult(issues);
}
