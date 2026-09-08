/**
 * Dependency injection token definitions for Zudojs.
 * Tokens identify dependencies within the container.
 */

/**
 * A class constructor usable as a token or provider implementation.
 *
 * The parameter list is intentionally loose (`any[]`) so classes with typed
 * constructor parameters are accepted; the container supplies arguments via
 * the provider's `inject` list (or none for zero-arg constructors).
 */
export interface Constructor<T = unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new (...args: any[]): T;
}
export type TokenSymbol = symbol;
export type TokenString = string;
export type Token<T = unknown> = Constructor<T> | TokenSymbol | TokenString;

export interface InjectionToken<T = unknown> {
  readonly token: Token<T>;
  readonly description?: string;
}

/**
 * Creates a unique, typed injection token backed by a fresh `Symbol`.
 *
 * Note on typing: plain string and symbol tokens are *untyped casts* — the
 * container cannot verify at compile time that the value registered under a
 * string/symbol actually has type `T`. Prefer `InjectionToken`s created here
 * (or constructor tokens) so the association between token and type lives in
 * one place.
 */
export function createToken<T>(description: string): InjectionToken<T> {
  return Object.freeze({ token: Symbol(description), description });
}

/**
 * Creates a typed injection token backed by `Symbol.for(key)`.
 *
 * Because `Symbol.for` uses the process-wide global symbol registry, two
 * independent calls (even from different packages) with the same `key`
 * produce the SAME token and will collide in the container — this is by
 * design for cross-package sharing, but means keys must be namespaced
 * (e.g. `"myapp:db"`). Use {@link createToken} for collision-free tokens.
 */
export function createGlobalToken<T>(key: string): InjectionToken<T> {
  return Object.freeze({ token: Symbol.for(key), description: key });
}

export function unwrapToken<T>(token: Token<T> | InjectionToken<T>): Token<T> {
  if (isInjectionToken<T>(token)) return token.token;
  return token;
}

export function isInjectionToken<T = unknown>(
  value: unknown,
): value is InjectionToken<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "token" in value &&
    (typeof (value as { token?: unknown }).token === "function" ||
      typeof (value as { token?: unknown }).token === "string" ||
      typeof (value as { token?: unknown }).token === "symbol")
  );
}

export function isConstructorToken<T = unknown>(
  token: Token<T>,
): token is Constructor<T> {
  return typeof token === "function";
}
export function isSymbolToken<T = unknown>(token: Token<T>): token is symbol {
  return typeof token === "symbol";
}
export function isStringToken<T = unknown>(token: Token<T>): token is string {
  return typeof token === "string";
}

export function describeToken<T>(token: Token<T> | InjectionToken<T>): string {
  const resolved = unwrapToken(token);
  if (typeof resolved === "string") return resolved;
  if (typeof resolved === "symbol")
    return resolved.description
      ? `Symbol(${resolved.description})`
      : "Symbol()";
  if (typeof resolved === "function")
    return resolved.name || "AnonymousConstructor";
  return "UnknownToken";
}
