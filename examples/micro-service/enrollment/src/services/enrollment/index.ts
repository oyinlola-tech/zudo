import type { CommandBus, QueryBus } from "@zudojs/cqrs";
import type { EventBus } from "@zudojs/events";
import type { EnrollmentRepository } from "../../repositories/enrollment.repository.js";
import { EnrollStudentHandler } from "./commands/enroll-student/enroll-student.handler.js";
import { WithdrawStudentHandler } from "./commands/withdraw-student/withdraw-student.handler.js";
import { GetEnrollmentHandler } from "./queries/get-enrollment/get-enrollment.handler.js";
import { ListStudentEnrollmentsHandler } from "./queries/list-student-enrollments/list-student-enrollments.handler.js";

/** Configuration for the enrollment service registration. */
export interface EnrollmentServiceConfig {
  /** The enrollment repository instance. */
  readonly enrollments: EnrollmentRepository;
  /** The command bus to register handlers on. */
  readonly commandBus: CommandBus;
  /** The query bus to register handlers on. */
  readonly queryBus: QueryBus;
  /** The event bus for publishing events. */
  readonly events: EventBus;
}

/**
 * Registers all enrollment command and query handlers with their respective buses.
 * @param config - The service configuration containing dependencies.
 */
export function registerEnrollmentService(
  config: EnrollmentServiceConfig,
): void {
  const { enrollments, commandBus, queryBus, events } = config;

  const enrollStudentHandler = new EnrollStudentHandler(enrollments, events);
  const withdrawStudentHandler = new WithdrawStudentHandler(
    enrollments,
    events,
  );
  const getEnrollmentHandler = new GetEnrollmentHandler(enrollments);
  const listStudentEnrollmentsHandler = new ListStudentEnrollmentsHandler(
    enrollments,
  );

  commandBus.register("enrollment.enroll-student", enrollStudentHandler);
  commandBus.register("enrollment.withdraw-student", withdrawStudentHandler);

  queryBus.register("enrollment.get", getEnrollmentHandler);
  queryBus.register("enrollment.list-student", listStudentEnrollmentsHandler);
}
