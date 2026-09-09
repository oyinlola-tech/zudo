/**
 * @zudojs/auth-oauth
 *
 * A small, strict OAuth2 authorization-code client: PKCE `S256` by default,
 * mandatory anti-CSRF `state` with a timing-safe check, an SSRF guard on
 * every endpoint URL, a redirect-URI allowlist, size- and time-bounded
 * provider requests, and defensive parsing of everything a provider returns.
 *
 * Depends on nothing but Node built-ins.
 *
 * @module @zudojs/auth-oauth
 */

export * from "./oauthTypes/index.js";
export * from "./oauthErrors/index.js";
export * from "./oauthSecurity/index.js";
export * from "./oauthProviders/index.js";
export * from "./oauthClient/index.js";
