/**
 * Canonical request-target parsing.
 *
 * Every place that derives a path or query from `request.url` (the request
 * context, the router, path-scoped middleware, static files) parses it here,
 * so routing and middleware can never disagree about which path a request
 * addresses.
 *
 * `new URL(target, base)` is the wrong tool for an origin-form target:
 * `//evil/admin` is read as a scheme-relative URL with authority `evil`, so
 * the path silently became `/admin` while `request.url` still said
 * `//evil/admin`. Prefixing the base as a string keeps an origin-form target
 * a path.
 *
 * @module httpRequest/target
 */

const TARGET_BASE = "http://zudojs.invalid";

const ABSOLUTE_FORM = /^https?:\/\//i;

const ENCODED_DOT = /%2e/gi;

/**
 * Parses a request-target (origin-form, absolute-form or `*`) into a URL.
 *
 * An origin-form target is never parsed as an authority. Unparseable input
 * yields the root URL.
 */
export function parseRequestTarget(target: string): URL {
  try {
    if (target.startsWith("/")) {
      return new URL(`${TARGET_BASE}${target}`);
    }

    if (ABSOLUTE_FORM.test(target)) {
      return new URL(target);
    }

    return new URL(`${TARGET_BASE}/${target === "*" ? "" : target}`);
  } catch {
    return new URL(`${TARGET_BASE}/`);
  }
}

/**
 * Returns the canonical path of a request-target.
 */
export function getCanonicalPath(target: string): string {
  return parseRequestTarget(target).pathname || "/";
}

function rawPathOf(target: string): string {
  let path = target;

  if (ABSOLUTE_FORM.test(path)) {
    const afterScheme = path.indexOf("//") + 2;

    const slash = path.indexOf("/", afterScheme);

    path = slash === -1 ? "/" : path.slice(slash);
  }

  const end = path.search(/[?#]/);

  return end === -1 ? path : path.slice(0, end);
}

/**
 * Explains why a request-target is refused, or returns `undefined` when it is
 * acceptable.
 *
 * Refused: anything that is not origin-form, absolute-form (`http(s)://`) or
 * the asterisk-form `*`; a backslash (WHATWG URL parsing treats it as a
 * separator); and any `.` / `..` segment, plain or percent-encoded
 * (`%2e%2e`). Those segments are resolved away by URL parsing, so a front
 * proxy matching `/admin*` on the raw target and the router dispatching on
 * the resolved path would otherwise disagree about the same request.
 */
export function findRequestTargetViolation(
  target: string,
): string | undefined {
  if (target === "*") {
    return undefined;
  }

  if (!target.startsWith("/") && !ABSOLUTE_FORM.test(target)) {
    return "Request target is not in origin-form or absolute-form.";
  }

  const path = rawPathOf(target);

  if (path.includes("\\")) {
    return "Request target contains a backslash.";
  }

  for (const segment of path.split("/")) {
    const decoded = segment.replace(ENCODED_DOT, ".");

    if (decoded === "." || decoded === "..") {
      return "Request target contains a dot segment.";
    }
  }

  return undefined;
}

/**
 * Whether a request-target is acceptable (see
 * {@link findRequestTargetViolation}).
 */
export function isCanonicalRequestTarget(target: string): boolean {
  return findRequestTargetViolation(target) === undefined;
}
