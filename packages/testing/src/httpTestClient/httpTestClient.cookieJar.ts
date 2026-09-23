/**
 * @zudojs/testing — cookie jar for the HTTP test client.
 *
 * Stores cookies from `Set-Cookie` and sends matching ones back, the way a
 * browser session would against a single origin. `Path`, `Max-Age` and
 * `Expires` are honoured; `Domain`, `Secure` and `SameSite` are not, since
 * every request goes to the one origin under test (a `Secure` cookie is sent
 * over plain `http://127.0.0.1` too).
 */

interface StoredCookie {
  readonly name: string;
  readonly value: string;
  readonly path: string;
  readonly expiresAt: number | undefined;
}

/** Cookies kept by a test client across requests. */
export interface HttpTestCookieJar {
  /** Number of live cookies. */
  readonly size: number;
  /** Value of the named cookie (the most specific path wins), if any. */
  readonly get: (name: string) => string | undefined;
  /** Sets a cookie by hand, as if the server had sent it. */
  readonly set: (name: string, value: string, path?: string) => void;
  /** Removes every cookie with this name. Returns whether one existed. */
  readonly delete: (name: string) => boolean;
  readonly clear: () => void;
  /** Live cookies as `name → value`. */
  readonly toJSON: () => Readonly<Record<string, string>>;
  /** The `Cookie` header for a request to `path`, if any cookie applies. */
  readonly headerFor: (path: string) => string | undefined;
  /** Stores `Set-Cookie` values received for a request to `requestPath`. */
  readonly store: (setCookies: readonly string[], requestPath: string) => void;
}

function defaultPath(requestPath: string): string {
  const pathname = requestPath.split("?")[0] ?? "/";
  const slash = pathname.lastIndexOf("/");
  return slash <= 0 ? "/" : pathname.slice(0, slash);
}

function pathMatches(cookiePath: string, requestPath: string): boolean {
  const pathname = requestPath.split("?")[0] || "/";
  if (cookiePath === "/" || pathname === cookiePath) return true;
  const prefix = cookiePath.endsWith("/") ? cookiePath : `${cookiePath}/`;
  return pathname.startsWith(prefix);
}

function parseSetCookie(
  header: string,
  requestPath: string,
  now: number,
): StoredCookie | undefined {
  const [pair = "", ...attributes] = header.split(";");
  const equals = pair.indexOf("=");
  if (equals <= 0) return undefined;
  let path = defaultPath(requestPath);
  let expiresAt: number | undefined;
  for (const attribute of attributes) {
    const [rawKey = "", ...rest] = attribute.split("=");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join("=").trim();
    if (key === "path" && value.startsWith("/")) path = value;
    if (key === "max-age" && /^-?\d+$/.test(value)) {
      expiresAt = now + Number(value) * 1000;
    }
    if (key === "expires" && expiresAt === undefined) {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) expiresAt = parsed;
    }
  }
  return {
    name: pair.slice(0, equals).trim(),
    value: pair.slice(equals + 1).trim(),
    path,
    expiresAt,
  };
}

/** Creates an empty cookie jar. */
export function createHttpTestCookieJar(): HttpTestCookieJar {
  const cookies = new Map<string, StoredCookie>();
  const keyOf = (name: string, path: string): string => `${path}\u0000${name}`;

  const live = (): StoredCookie[] => {
    const now = Date.now();
    for (const [key, cookie] of cookies) {
      if (cookie.expiresAt !== undefined && cookie.expiresAt <= now)
        cookies.delete(key);
    }
    return [...cookies.values()].sort((a, b) => b.path.length - a.path.length);
  };

  return {
    get size() {
      return live().length;
    },
    get: (name) => live().find((cookie) => cookie.name === name)?.value,
    set: (name, value, path = "/") => {
      cookies.set(keyOf(name, path), {
        name,
        value,
        path,
        expiresAt: undefined,
      });
    },
    delete: (name) => {
      let found = false;
      for (const [key, cookie] of cookies) {
        if (cookie.name === name) found = cookies.delete(key) || found;
      }
      return found;
    },
    clear: () => cookies.clear(),
    toJSON: () => {
      const entries = live()
        .reverse()
        .map((c) => [c.name, c.value] as const);
      return Object.freeze(Object.fromEntries(entries));
    },
    headerFor: (path) => {
      const matching = live().filter((cookie) =>
        pathMatches(cookie.path, path),
      );
      return matching.length === 0
        ? undefined
        : matching.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    },
    store: (setCookies, requestPath) => {
      const now = Date.now();
      for (const header of setCookies) {
        const cookie = parseSetCookie(header, requestPath, now);
        if (cookie) cookies.set(keyOf(cookie.name, cookie.path), cookie);
      }
    },
  };
}
