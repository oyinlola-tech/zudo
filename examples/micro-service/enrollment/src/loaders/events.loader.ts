import type { Logger } from "@zudojs/logger";
import type { EventBus } from "@zudojs/events";
import {
  StudentEnrolledEvent,
  StudentWithdrawnEvent,
} from "../events/index.js";

/** Configuration for the event loader. */
export interface EventLoaderConfig {
  /** The event bus instance. */
  readonly events: EventBus;
  /** The logger instance. */
  readonly logger: Logger;
}

/**
 * Registers all event definitions with the event bus and starts it.
 * @param config - The event loader configuration.
 */
export function loadEvents(config: EventLoaderConfig): void {
  const { events, logger } = config;

  logger.info("Registering event definitions...");

  events.register(StudentEnrolledEvent);
  events.register(StudentWithdrawnEvent);

  logger.info("  - enrollment.student-enrolled");
  logger.info("  - enrollment.student-withdrawn");

  events.start();

  logger.info("Event bus started");
}
