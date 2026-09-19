import type { IncomingMessage, ServerResponse } from "node:http";
import type { Route } from "../routes/index.js";
import { userRoutes } from "../routes/user.routes.js";
import { enrollmentRoutes } from "../routes/enrollment.routes.js";
import { assessmentRoutes } from "../routes/assessment.routes.js";
import { notificationRoutes } from "../routes/notification.routes.js";

/**
 * All registered routes in priority order.
 */
const allRoutes: readonly Route[] = [
  ...userRoutes,
  ...enrollmentRoutes,
  ...assessmentRoutes,
  ...notificationRoutes,
];

/**
 * Extracts named parameters from a regex match.
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
 * Finds a matching route for the given request.
 */
export function findRoute(
  method: string | undefined,
  pathname: string,
): { route: Route; params: Record<string, string> } | null {
  for (const route of allRoutes) {
    if (route.method !== method && route.method !== "*") continue;

    const params = extractParams(route.pattern, pathname);
    if (params !== null) {
      return { route, params };
    }
  }
  return null;
}

/**
 * Returns all registered routes.
 */
export function getAllRoutes(): readonly Route[] {
  return allRoutes;
}
