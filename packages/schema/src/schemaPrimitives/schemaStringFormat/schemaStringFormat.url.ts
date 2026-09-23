/**
 * @zudojs/schema/primitives/stringFormat/url
 *
 * The `protocols` option of `string().url()`.
 */

/** Options for `string().url()`. */
export interface StringUrlOptions {
  /**
   * URL schemes to accept, without the colon and in any case, e.g.
   * `["postgres", "postgresql"]` for a database URL or
   * `["redis", "rediss"]` for a cache URL. `"any"` accepts every scheme the
   * WHATWG URL parser understands, including `javascript:` and `data:`, so
   * use it only for values that are never rendered or followed.
   *
   * Without this option, `url()` accepts `http` and `https` only.
   */
  readonly protocols?: readonly string[] | "any";
}

/** Normalized scheme allow-list, or `"any"`. */
export type UrlProtocolPolicy = ReadonlySet<string> | "any";

const SCHEME = /^[a-z][a-z0-9+.-]*$/;

/** Rejects whitespace and control characters the URL parser would strip. */
const UNSAFE_CHARACTERS = /[\s\u0000-\u001f\u007f]/u;

/**
 * Validates and normalizes the `protocols` option.
 *
 * @throws TypeError for an empty list or a value that is not a scheme name.
 */
export function normalizeUrlProtocols(
  protocols: StringUrlOptions["protocols"],
): UrlProtocolPolicy | undefined {
  if (protocols === undefined) return undefined;
  if (protocols === "any") return "any";
  if (!Array.isArray(protocols) || protocols.length === 0) {
    throw new TypeError('url({ protocols }) must be a non-empty array or "any".');
  }
  const normalized = new Set<string>();
  for (const protocol of protocols) {
    const scheme =
      typeof protocol === "string" ? protocol.trim().toLowerCase().replace(/:$/u, "") : "";
    if (!SCHEME.test(scheme)) {
      throw new TypeError(`Invalid URL protocol in url({ protocols }): ${String(protocol)}`);
    }
    normalized.add(scheme);
  }
  return normalized;
}

/**
 * Whether `value` parses as a WHATWG URL whose scheme `policy` allows.
 * Surrounding or embedded whitespace and control characters are refused
 * rather than silently stripped by the parser.
 */
export function isUrlWithProtocol(value: string, policy: UrlProtocolPolicy): boolean {
  if (UNSAFE_CHARACTERS.test(value)) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return policy === "any" || policy.has(url.protocol.slice(0, -1));
}
