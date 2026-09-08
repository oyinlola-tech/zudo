/**
 * Validates internal links within markdown and structured documentation.
 */

import type { DocumentationDocument } from "../docsTypes/index.js";
import {
  resolveDocumentLink,
  stripFencedCodeBlocks,
  stripLinkDecorations,
} from "../utils/utils.helper.js";
import {
  toValidationResult,
  type ValidationResult,
  type ValidationIssue,
} from "./validator.types.js";

/** Default maximum markdown length that is scanned for links. */
export const DEFAULT_MAX_LINK_SCAN_LENGTH = 100_000;

/** Options for `validateLinks`. */
export interface ValidateLinksOptions {
  /**
   * Markdown longer than this (in characters) is not scanned; a
   * `LINK_VALIDATION_SKIPPED` warning is reported instead.
   * Defaults to {@link DEFAULT_MAX_LINK_SCAN_LENGTH}.
   */
  readonly maxContentLength?: number;
}

/**
 * Matches `[text](target)` and `![alt](target)` links. Group 1 is the
 * optional image bang, group 2 the target (optionally `<…>` wrapped
 * and followed by a `"title"`).
 */
const LINK_PATTERN = /(!?)\[[^\]\n]*\]\(\s*(<[^>\n]*>|[^)\s]*)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;

/** `scheme:` (mailto:, ftp:, http:) or protocol-relative `//`. */
const EXTERNAL_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]*:|\/\/)/;

/**
 * Validates internal links in a document's markdown content and in
 * structured `link` nodes.
 *
 * Skipped (never reported): images, anchors (`#…`), any target with a
 * URL scheme or `//` prefix, links inside fenced or inline code.
 * Relative targets (`./x`, `../x`, `/x`) are resolved against the
 * document ID with `resolveDocumentLink`; bare targets are looked up
 * both as-is and resolved.
 */
export function validateLinks(
  document: DocumentationDocument,
  registeredIds: ReadonlySet<string>,
  options: ValidateLinksOptions = {},
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const content = document.content;

  if (content.type === "structured") {
    for (const node of content.nodes) {
      if (node.type === "link") {
        checkTarget(node.href, document, registeredIds, issues);
      }
    }
    return toValidationResult(issues);
  }

  if (content.type !== "markdown") {
    return toValidationResult(issues);
  }

  const maxLength = options.maxContentLength ?? DEFAULT_MAX_LINK_SCAN_LENGTH;

  if (content.value.length > maxLength) {
    issues.push({
      severity: "warning",
      code: "LINK_VALIDATION_SKIPPED",
      message: `Document "${document.id}" content (${content.value.length} chars) exceeds the ${maxLength} char link-scan limit; links were not validated.`,
      documentId: document.id,
    });
    return toValidationResult(issues);
  }

  const source = stripInlineCode(stripFencedCodeBlocks(content.value));

  for (const match of source.matchAll(LINK_PATTERN)) {
    const isImage = match[1] === "!";
    let target = match[2] ?? "";

    if (isImage) continue;

    if (target.startsWith("<") && target.endsWith(">")) {
      target = target.slice(1, -1);
    }

    checkTarget(target, document, registeredIds, issues);
  }

  return toValidationResult(issues);
}

function checkTarget(
  rawTarget: string,
  document: DocumentationDocument,
  registeredIds: ReadonlySet<string>,
  issues: ValidationIssue[],
): void {
  const target = rawTarget.trim();

  if (target === "" || target.startsWith("#")) return;
  if (EXTERNAL_PATTERN.test(target)) return;

  const stripped = stripLinkDecorations(target);

  if (stripped === "") return;

  const candidates = new Set<string>([
    stripped,
    stripped.replace(/^\.\//, "").replace(/\//g, "."),
    resolveDocumentLink(document.id, stripped),
  ]);

  for (const candidate of candidates) {
    if (registeredIds.has(candidate)) return;
  }

  issues.push({
    severity: "warning",
    code: "BROKEN_LINK",
    message: `Document "${document.id}" links to "${rawTarget}" which is not registered.`,
    documentId: document.id,
  });
}

/** Blanks out inline code spans so links inside them are ignored. */
function stripInlineCode(markdown: string): string {
  return markdown.replace(/(`+)[^`\n][\s\S]*?\1/g, (m) => " ".repeat(m.length));
}
