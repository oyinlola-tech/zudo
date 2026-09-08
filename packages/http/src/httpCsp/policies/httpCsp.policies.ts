/**
 * Predefined CSP policies.
 */

import type { CSPResult } from "../types/httpCsp.type.js";
import { createCSP } from "../formatting/httpCsp.formatting.js";
import { createNonceSource } from "../nonce/httpCsp.nonce.js";

export function strictCSP(): CSPResult {
  return createCSP({
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
    formAction: ["'self'"],
    upgradeInsecureRequests: true,
  });
}

export function apiCSP(): CSPResult {
  return createCSP({
    defaultSrc: ["'none'"],
    frameAncestors: ["'none'"],
    baseUri: ["'none'"],
  });
}

/**
 * A browser-facing policy.
 *
 * When a nonce is supplied it is applied to **both** `script-src` and
 * `style-src`, and `style-src` drops `'unsafe-inline'`. Silently keeping
 * `'unsafe-inline'` alongside a nonce defeats the point of asking for one: a
 * caller who went to the trouble of generating a nonce has explicitly opted
 * into strict inline handling.
 */
export function browserCSP(nonce: string | undefined): CSPResult {
  const nonceSource = nonce ? createNonceSource(nonce) : undefined;

  const scriptSrc = nonceSource ? ["'self'", nonceSource] : ["'self'"];

  const styleSrc = nonceSource
    ? ["'self'", nonceSource]
    : ["'self'", "'unsafe-inline'"];

  return createCSP({
    defaultSrc: ["'self'"],
    scriptSrc,
    styleSrc,
    imgSrc: ["'self'", "data:", "https:"],
    fontSrc: ["'self'", "https:", "data:"],
    connectSrc: ["'self'", "https:"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    frameAncestors: ["'none'"],
    formAction: ["'self'"],
    upgradeInsecureRequests: true,
  });
}
