/**
 * CSP formatting and creation functions.
 */

import type {
  CSPDirectiveValue,
  CSPDirectives,
  CSPOptions,
  CSPResult,
} from "../types/httpCsp.type.js";
import { normalizeDirectiveName } from "../validation/httpCsp.validation.js";
import { validateCSP } from "../validation/httpCsp.validate.js";
import {
  normalizeDirectiveValues,
  freezeDirectives,
  addOptionalDirective,
  mergeDirectives,
} from "../internal/httpCsp.internal.js";

export function formatCSP(
  directives: CSPDirectives | Readonly<Record<string, CSPDirectiveValue>>,
): string {
  const parts: string[] = [];

  for (const [rawName, rawValues] of Object.entries(directives)) {
    const name = normalizeDirectiveName(rawName);
    const values = normalizeDirectiveValues(rawValues);

    if (values.length === 0) {
      parts.push(name);
      continue;
    }

    parts.push(`${name} ${values.join(" ")}`);
  }

  return parts.join("; ");
}

export function createCSP(options: CSPOptions | undefined = {}): CSPResult {
  const directives: Record<string, readonly string[]> = {};

  if (options.directives) {
    mergeDirectives(directives, options.directives);
  }

  addOptionalDirective(directives, "default-src", options.defaultSrc);
  addOptionalDirective(directives, "script-src", options.scriptSrc);
  addOptionalDirective(directives, "style-src", options.styleSrc);
  addOptionalDirective(directives, "img-src", options.imgSrc);
  addOptionalDirective(directives, "font-src", options.fontSrc);
  addOptionalDirective(directives, "connect-src", options.connectSrc);
  addOptionalDirective(directives, "media-src", options.mediaSrc);
  addOptionalDirective(directives, "object-src", options.objectSrc);
  addOptionalDirective(directives, "frame-src", options.frameSrc);
  addOptionalDirective(directives, "child-src", options.childSrc);
  addOptionalDirective(directives, "worker-src", options.workerSrc);
  addOptionalDirective(directives, "manifest-src", options.manifestSrc);
  addOptionalDirective(directives, "base-uri", options.baseUri);
  addOptionalDirective(directives, "form-action", options.formAction);
  addOptionalDirective(directives, "frame-ancestors", options.frameAncestors);
  addOptionalDirective(directives, "navigate-to", options.navigateTo);
  addOptionalDirective(directives, "report-uri", options.reportUri);
  addOptionalDirective(directives, "report-to", options.reportTo);
  addOptionalDirective(directives, "sandbox", options.sandbox);
  addOptionalDirective(
    directives,
    "require-trusted-types-for",
    options.requireTrustedTypesFor,
  );
  addOptionalDirective(directives, "trusted-types", options.trustedTypes);

  if (options.upgradeInsecureRequests) {
    directives["upgrade-insecure-requests"] = [];
  }

  if (options.blockAllMixedContent) {
    directives["block-all-mixed-content"] = [];
  }

  const frozen = freezeDirectives(directives);

  /*
   * Belt and braces. `normalizeDirectiveValues` already rejects `;`, `,` and
   * control characters at construction time, but `createCSP` can also be
   * handed a pre-built `directives` record, and this is the last point before
   * a policy string is produced. `validateCSP` previously existed with no
   * call site at all.
   */
  if (!validateCSP(frozen)) {
    throw new TypeError(
      "Invalid Content-Security-Policy: a directive name or value is malformed.",
    );
  }

  const policy = formatCSP(frozen);

  return {
    policy,
    header: policy,
    directives: frozen,
  };
}
