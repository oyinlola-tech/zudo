import type { CommandBus, QueryBus } from "@zudojs/cqrs";
import { createEnrollmentRoutes } from "./enrollment.routes.js";

/** A registered HTTP route. */
export interface Route {
  /** HTTP method. */
  readonly method: string;
  /** URL path pattern. */
  readonly path: string;
  /** Route handler function. */
  readonly handler: (body: any, params: any, query?: any) => Promise<unknown>;
}

/**
 * Creates all application routes.
 * @param commandBus - The command bus instance.
 * @param queryBus - The query bus instance.
 * @returns Combined array of all routes.
 */
export function createAllRoutes(
  commandBus: CommandBus,
  queryBus: QueryBus,
): readonly Route[] {
  return [...createEnrollmentRoutes(commandBus, queryBus)];
}
