/**
 * Validates internal links within markdown and structured documentation.
 */

import type { DocumentationDocument } from "../docsTypes/index.js";
import {
  resolveDocumentLink,
  stripFencedCodeBlocks,
  stripLinkDecorations,
} from "../utils/utils.helper.js";
import { isSafeLinkHref } from "../utils/utils.href.js";
import {
  extractLinkTargets,
  stripInlineCode,
} from "./validatorLinks.extract.js";
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
  /**
   * Severity of a `BROKEN_LINK` issue (a relative link to an unregistered
   * document). Defaults to `"warning"`, which never makes a result invalid;
   * pass `"error"` to fail validation on dead links.
   */
  readonly brokenLinkSeverity?: "error" | "warning";
}

/** `scheme:` (mailto:, ftp:, http:) or protocol-relative `//`. */
const EXTERNAL_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]*:|\/\/)/;

/**
 * Validates internal links in a document's markdown content and in
 * structured `link` nodes.
 *
 * Every markdown link form is scanned: inline `[text](target)` (with
 * balanced parentheses, `<…>` targets and titles), reference definitions
 * `[label]: target`, raw HTML `href="…"` attributes and `<scheme:…>`
 * autolinks. A target whose scheme is not on the allow-list (http, https,
 * mailto, tel, ftp, ftps) — `javascript:`, `data:`, `vbscript:` … — is
 * reported as an `UNSAFE_LINK` error.
 * Skipped (never reported): images, anchors (`#…`), other targets with an
 * allowed URL scheme or `//` prefix, links inside fenced or inline code.
 * Relative targets (`./x`, `../x`, `/x`) are resolved against the
 * document ID with `resolveDocumentLink`; bare targets are looked up
 * both as-is and resolved. An unregistered target is a `BROKEN_LINK`
 * whose severity is `options.brokenLinkSeverity` (default `"warning"`).
 */
export function validateLinks(
  document: DocumentationDocument,
  registeredIds: ReadonlySet<string>,
  options: ValidateLinksOptions = {},
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const content = document.content;
  const brokenSeverity = options.brokenLinkSeverity ?? "warning";

  if (content.type === "structured") {
    for (const node of content.nodes) {
      if (node.type === "link") {
        checkTarget(node.href, document, registeredIds, issues, brokenSeverity);
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

  for (const link of extractLinkTargets(source)) {
    if (link.isImage) continue;
    checkTarget(link.target, document, registeredIds, issues, brokenSeverity);
  }

  return toValidationResult(issues);
}

function checkTarget(
  rawTarget: string,
  document: DocumentationDocument,
  registeredIds: ReadonlySet<string>,
  issues: ValidationIssue[],
  brokenSeverity: "error" | "warning",
): void {
  const target = rawTarget.trim();

  if (target === "" || target.startsWith("#")) return;
  if (!isSafeLinkHref(target)) {
    issues.push({
      severity: "error",
      code: "UNSAFE_LINK",
      message: `Document "${document.id}" links to "${rawTarget}", whose scheme is not allowed (http, https, mailto, tel, ftp, ftps).`,
      documentId: document.id,
    });
    return;
  }
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
    severity: brokenSeverity,
    code: "BROKEN_LINK",
    message: `Document "${document.id}" links to "${rawTarget}" which is not registered.`,
    documentId: document.id,
  });
}
