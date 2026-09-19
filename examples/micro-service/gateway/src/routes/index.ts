import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Route definition matching HTTP method and path pattern.
 */
export interface Route {
  readonly method: string;
  readonly pattern: RegExp;
  readonly handler: (
    req: IncomingMessage,
    res: ServerResponse,
  ) => Promise<void>;
  readonly requiresAuth: boolean;
}

/**
 * Extracts named parameters from a regex match using the pattern source.
 * We parse the pattern source to find named groups like (?<name>...)
 */
function extractParams(
  pattern: RegExp,
  pathname: string,
): Record<string, string> | null {
  const match = pathname.match(pattern);
  if (!match) return null;

  const params: Record<string, string> = {};
  const namedGroups = match.groups ?? {};

  for (const [key, value] of Object.entries(namedGroups)) {
    params[key] = value ?? "";
  }

  return params;
}

/**
 * Matches a route against a request.
 */
export function matchRoute(
  routes: readonly Route[],
  method: string | undefined,
  pathname: string,
): { route: Route; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method && route.method !== "*") continue;

    const params = extractParams(route.pattern, pathname);
    if (params !== null) {
      return { route, params };
    }
  }
  return null;
}
