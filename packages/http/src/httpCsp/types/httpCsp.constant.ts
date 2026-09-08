/**
 * CSP constants and directive names.
 */

export const CONTENT_SECURITY_POLICY_HEADER = "Content-Security-Policy";

export const CONTENT_SECURITY_POLICY_REPORT_ONLY_HEADER =
  "Content-Security-Policy-Report-Only";

export const DEFAULT_NONCE_LENGTH = 16;

export const CSP_DIRECTIVES = Object.freeze([
  "default-src",
  "script-src",
  "script-src-elem",
  "script-src-attr",
  "style-src",
  "style-src-elem",
  "style-src-attr",
  "img-src",
  "font-src",
  "connect-src",
  "media-src",
  "object-src",
  "frame-src",
  "child-src",
  "worker-src",
  "manifest-src",
  "prefetch-src",
  "navigate-to",
  "base-uri",
  "form-action",
  "frame-ancestors",
  "plugin-types",
  "sandbox",
  "report-uri",
  "report-to",
  "upgrade-insecure-requests",
  "block-all-mixed-content",
  "require-sri-for",
  "require-trusted-types-for",
  "trusted-types",
] as const);
/*
 * The five duplicated entries (script-src-elem, script-src-attr,
 * style-src-elem, style-src-attr, worker-src) and `wasm-unsafe-eval` — which
 * is a source expression, not a directive — have been removed. The list is the
 * public vocabulary of directive names; a source expression in it would make
 * `wasm-unsafe-eval` a valid `CSPDirectiveName`.
 */

export type CSPDirectiveName = (typeof CSP_DIRECTIVES)[number];
