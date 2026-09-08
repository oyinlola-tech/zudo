/**
 * Security headers factory.
 *
 * @module httpSecurityHeaders/factory
 */

import type {
  SecurityHeadersOptions,
  SecurityHeaders,
} from "./core/httpSecurityHeader.type.js";

import {
  SECURITY_HEADER_NAMES,
  DEFAULT_REFERRER_POLICY,
} from "./core/httpSecurityHeader.type.js";

import {
  contentSecurityPolicyHeader,
  strictTransportSecurityHeader,
  xContentTypeOptionsHeader,
  xFrameOptionsHeader,
  referrerPolicyHeader,
  permissionsPolicyHeader,
  crossOriginEmbedderPolicyHeader,
  crossOriginOpenerPolicyHeader,
  crossOriginResourcePolicyHeader,
  xPermittedCrossDomainPoliciesHeader,
} from "./httpSecurityHeader.individual.js";

import {
  createDefaultCSPOptions,
  createDefaultHSTSOptions,
  createDefaultPermissionsPolicy,
} from "./httpSecurityHeader.recommended.js";

/**
 * Creates a complete set of security headers.
 */
export function createSecurityHeaders(
  options: SecurityHeadersOptions = {},
): SecurityHeaders {
  const headers: Record<string, string> = {};

  /*
   * `contentSecurityPolicy: true` used to format `{}` into the empty string,
   * emitting `content-security-policy:` with no directives — a policy that
   * restricts nothing while looking present to a scanner or reviewer. The
   * boolean form now means "the recommended default policy", which is what
   * `createDefaultCSPOptions` was written for and never called for.
   */
  if (options.contentSecurityPolicy) {
    headers[SECURITY_HEADER_NAMES.CSP] = contentSecurityPolicyHeader(
      typeof options.contentSecurityPolicy === "string"
        ? options.contentSecurityPolicy
        : createDefaultCSPOptions(),
    );
  }

  if (options.strictTransportSecurity) {
    headers[SECURITY_HEADER_NAMES.HSTS] = strictTransportSecurityHeader(
      typeof options.strictTransportSecurity === "object"
        ? options.strictTransportSecurity
        : createDefaultHSTSOptions(),
    );
  }

  if (options.xContentTypeOptions) {
    headers[SECURITY_HEADER_NAMES.XCTO] = xContentTypeOptionsHeader();
  }

  if (options.xFrameOptions) {
    headers[SECURITY_HEADER_NAMES.XFO] = xFrameOptionsHeader(
      typeof options.xFrameOptions === "string"
        ? options.xFrameOptions
        : "DENY",
    );
  }

  if (options.referrerPolicy) {
    headers[SECURITY_HEADER_NAMES.RP] = referrerPolicyHeader(
      typeof options.referrerPolicy === "string"
        ? options.referrerPolicy
        : DEFAULT_REFERRER_POLICY,
    );
  }

  if (options.permissionsPolicy) {
    headers[SECURITY_HEADER_NAMES.PP] = permissionsPolicyHeader(
      typeof options.permissionsPolicy === "object"
        ? options.permissionsPolicy
        : createDefaultPermissionsPolicy(),
    );
  }

  if (options.crossOriginEmbedderPolicy) {
    headers[SECURITY_HEADER_NAMES.COEP] = crossOriginEmbedderPolicyHeader(
      typeof options.crossOriginEmbedderPolicy === "string"
        ? options.crossOriginEmbedderPolicy
        : "require-corp",
    );
  }

  if (options.crossOriginOpenerPolicy) {
    headers[SECURITY_HEADER_NAMES.COOP] = crossOriginOpenerPolicyHeader(
      typeof options.crossOriginOpenerPolicy === "string"
        ? options.crossOriginOpenerPolicy
        : "same-origin",
    );
  }

  if (options.crossOriginResourcePolicy) {
    headers[SECURITY_HEADER_NAMES.CORP] = crossOriginResourcePolicyHeader(
      typeof options.crossOriginResourcePolicy === "string"
        ? options.crossOriginResourcePolicy
        : "same-site",
    );
  }

  if (options.xPermittedCrossDomainPolicies) {
    headers[SECURITY_HEADER_NAMES.XPCDP] = xPermittedCrossDomainPoliciesHeader(
      typeof options.xPermittedCrossDomainPolicies === "string"
        ? options.xPermittedCrossDomainPolicies
        : "none",
    );
  }

  return headers as SecurityHeaders;
}
