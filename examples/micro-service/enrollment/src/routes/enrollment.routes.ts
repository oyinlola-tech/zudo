import type { CommandBus, QueryBus } from "@zudojs/cqrs";
import { EnrollmentController } from "../controllers/enrollment.controller.js";

/** A registered HTTP route. */
export interface Route {
  /** HTTP method (GET, POST, PATCH, DELETE). */
  readonly method: string;
  /** URL path pattern. */
  readonly path: string;
  /** Route handler function. */
  readonly handler: (body: any, params: any, query?: any) => Promise<unknown>;
}

/**
 * Creates enrollment-related HTTP routes.
 * @param commandBus - The command bus instance.
 * @param queryBus - The query bus instance.
 * @returns Array of route definitions.
 */
export function createEnrollmentRoutes(
  commandBus: CommandBus,
  queryBus: QueryBus,
): readonly Route[] {
  const controller = new EnrollmentController(commandBus, queryBus);

  return [
    {
      method: "POST",
      path: "/enrollments",
      handler: async (body: any) => controller.enroll(body),
    },
    {
      method: "POST",
      path: "/enrollments/withdraw",
      handler: async (body: any) => controller.withdraw(body),
    },
    {
      method: "GET",
      path: "/enrollments/:id",
      handler: async (_body: any, params: any) => controller.get(params.id),
    },
    {
      method: "GET",
      path: "/enrollments/student/:studentId",
      handler: async (_body: any, params: any) =>
        controller.listByStudent(params.studentId),
    },
  ];
}
