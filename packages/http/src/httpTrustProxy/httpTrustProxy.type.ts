/**
 * Trust proxy types and constants.
 *
 * @module httpTrustProxy/types
 */

export type TrustProxy =
  | boolean
  | "all"
  | "linklocal"
  | "loopback"
  | string
  | readonly string[]
  | ((value: string, index: number) => boolean);

export interface TrustProxyOptions {
  readonly trustProxy?: TrustProxy;
  readonly maxDepth?: number;
  readonly strict?: boolean;
}

export interface ProxyRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly socket?: { readonly remoteAddress?: string };
}

export interface ForwardedAddress {
  readonly address: string;
  readonly port: number | undefined;
  /** RFC 7239 `proto=` parameter, when present. */
  readonly protocol?: string;
  /** RFC 7239 `host=` parameter, when present. */
  readonly host?: string;
  readonly source: string;
}

export interface ProxyInfo {
  readonly clientIp: string | undefined;
  readonly clientPort: number | undefined;
  readonly protocol: string | undefined;
  readonly hostname: string | undefined;
  readonly port: number | undefined;
  readonly chain: readonly string[];
}

export const X_FORWARDED_FOR = "x-forwarded-for" as const;

export const X_FORWARDED_PROTO = "x-forwarded-proto" as const;

export const X_FORWARDED_HOST = "x-forwarded-host" as const;

export const X_FORWARDED_PORT = "x-forwarded-port" as const;

export const X_FORWARDED_PREFIX = "x-forwarded-prefix" as const;

export const FORWARDED_HEADER = "forwarded" as const;
