/**
 * Validates a single document for structural correctness.
 */

import type {
  DocumentationDocument,
  DocumentationNode,
} from "../docsTypes/index.js";
import { isValidDocumentId } from "../utils/utils.helper.js";
import {
  toValidationResult,
  type ValidationResult,
  type ValidationIssue,
} from "./validator.types.js";

const CONTENT_TYPES = new Set(["markdown", "mdx", "html", "structured"]);
const STATUSES = new Set([
  "stable",
  "experimental",
  "beta",
  "deprecated",
  "internal",
]);
const CATEGORIES = new Set([
  "introduction",
  "guide",
  "tutorial",
  "reference",
  "api",
  "architecture",
  "configuration",
  "deployment",
  "security",
  "migration",
  "examples",
]);
const VISIBILITIES = new Set(["SERVER", "CLIENT"]);
const NODE_TYPES = new Set([
  "heading",
  "paragraph",
  "code",
  "list",
  "link",
  "table",
  "quote",
  "callout",
]);
const CALLOUT_KINDS = new Set(["note", "warning", "tip", "danger"]);

/**
 * Validates a single document: ID syntax, required fields, content
 * shape (including structured nodes), and the metadata enums.
 */
export function validateDocument(
  document: DocumentationDocument,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const id = document.id;

  if (typeof id !== "string" || id.trim().length === 0) {
    issues.push({
      severity: "error",
      code: "MISSING_ID",
      message: "Document ID is required.",
    });
  } else if (!isValidDocumentId(id)) {
    issues.push({
      severity: "error",
      code: "INVALID_ID",
      message: `Document ID "${id}" is invalid. Use dot-separated segments of letters, digits, "_" and "-".`,
      documentId: id,
    });
  }

  if (typeof document.title !== "string" || document.title.trim().length === 0) {
    issues.push({
      severity: "error",
      code: "MISSING_TITLE",
      message: `Document "${id}" is missing a title.`,
      documentId: id,
    });
  }

  validateContent(document, issues);

  if (document.status !== undefined && !STATUSES.has(document.status)) {
    issues.push({
      severity: "error",
      code: "INVALID_STATUS",
      message: `Document "${id}" has unknown status "${String(document.status)}".`,
      documentId: id,
    });
  }

  if (document.category !== undefined && !CATEGORIES.has(document.category)) {
    issues.push({
      severity: "error",
      code: "INVALID_CATEGORY",
      message: `Document "${id}" has unknown category "${String(document.category)}".`,
      documentId: id,
    });
  }

  if (
    document.visibility !== undefined &&
    !VISIBILITIES.has(document.visibility)
  ) {
    issues.push({
      severity: "error",
      code: "INVALID_VISIBILITY",
      message: `Document "${id}" has unknown visibility "${String(document.visibility)}".`,
      documentId: id,
    });
  }

  if (
    document.tags !== undefined &&
    (!Array.isArray(document.tags) ||
      document.tags.some((tag) => typeof tag !== "string" || tag.trim() === ""))
  ) {
    issues.push({
      severity: "error",
      code: "INVALID_TAGS",
      message: `Document "${id}" has tags that are not non-empty strings.`,
      documentId: id,
    });
  }

  if (document.deprecated && !document.deprecatedMessage) {
    issues.push({
      severity: "warning",
      code: "DEPRECATED_WITHOUT_MESSAGE",
      message: `Document "${id}" is deprecated but has no deprecation message.`,
      documentId: id,
    });
  }

  if (
    (document.status === "deprecated") !== Boolean(document.deprecated) &&
    (document.status === "deprecated" || document.deprecated)
  ) {
    issues.push({
      severity: "warning",
      code: "DEPRECATION_MISMATCH",
      message: `Document "${id}" has status "${document.status ?? "unset"}" but deprecated=${String(Boolean(document.deprecated))}.`,
      documentId: id,
    });
  }

  return toValidationResult(issues);
}

function validateContent(
  document: DocumentationDocument,
  issues: ValidationIssue[],
): void {
  const id = document.id;
  const content = document.content as unknown;

  if (!content || typeof content !== "object") {
    issues.push({
      severity: "error",
      code: "MISSING_CONTENT",
      message: `Document "${id}" is missing content.`,
      documentId: id,
    });
    return;
  }

  const type = (content as { type?: unknown }).type;

  if (typeof type !== "string" || !CONTENT_TYPES.has(type)) {
    issues.push({
      severity: "error",
      code: "INVALID_CONTENT_TYPE",
      message: `Document "${id}" has unknown content type "${String(type)}".`,
      documentId: id,
    });
    return;
  }

  if (type === "structured") {
    const nodes = (content as { nodes?: unknown }).nodes;

    if (!Array.isArray(nodes)) {
      issues.push({
        severity: "error",
        code: "INVALID_NODE",
        message: `Document "${id}" structured content must have a "nodes" array.`,
        documentId: id,
      });
      return;
    }

    nodes.forEach((node, index) => {
      const problem = describeNodeProblem(node);
      if (problem) {
        issues.push({
          severity: "error",
          code: "INVALID_NODE",
          message: `Document "${id}" node ${index}: ${problem}`,
          documentId: id,
        });
      }
    });
    return;
  }

  if (typeof (content as { value?: unknown }).value !== "string") {
    issues.push({
      severity: "error",
      code: "INVALID_CONTENT_TYPE",
      message: `Document "${id}" ${type} content must have a string "value".`,
      documentId: id,
    });
  }
}

/** Returns a description of what is wrong with a node, or undefined. */
function describeNodeProblem(node: unknown): string | undefined {
  if (!node || typeof node !== "object") return "node is not an object.";

  const n = node as Partial<Record<keyof DocumentationNode | string, unknown>>;

  if (typeof n.type !== "string" || !NODE_TYPES.has(n.type)) {
    return `unknown node type "${String(n.type)}".`;
  }

  const isString = (v: unknown): v is string => typeof v === "string";
  const isStringArray = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every(isString);

  switch (n.type) {
    case "heading":
      if (!Number.isInteger(n.level) || (n.level as number) < 1 || (n.level as number) > 6) {
        return "heading level must be an integer from 1 to 6.";
      }
      return isString(n.value) ? undefined : "heading value must be a string.";
    case "paragraph":
    case "quote":
      return isString(n.value) ? undefined : `${n.type} value must be a string.`;
    case "code":
      if (n.language !== undefined && !isString(n.language)) {
        return "code language must be a string.";
      }
      return isString(n.value) ? undefined : "code value must be a string.";
    case "list":
      if (typeof n.ordered !== "boolean") return "list ordered must be a boolean.";
      return isStringArray(n.items) ? undefined : "list items must be strings.";
    case "link":
      if (!isString(n.href)) return "link href must be a string.";
      return isString(n.value) ? undefined : "link value must be a string.";
    case "table":
      if (!isStringArray(n.headers)) return "table headers must be strings.";
      if (!Array.isArray(n.rows) || !n.rows.every(isStringArray)) {
        return "table rows must be arrays of strings.";
      }
      return undefined;
    case "callout":
      if (!isString(n.kind) || !CALLOUT_KINDS.has(n.kind)) {
        return `unknown callout kind "${String(n.kind)}".`;
      }
      return isString(n.value) ? undefined : "callout value must be a string.";
    default:
      return undefined;
  }
}
