import type { Logger } from "@zudojs/logger";
import type { EventBus } from "@zudojs/events";
import type { CommandBus, QueryBus } from "@zudojs/cqrs";
import type { EnrollmentRepository } from "../repositories/index.js";
import { registerEnrollmentService } from "../services/index.js";

/** Configuration for the module loader. */
export interface ModuleLoaderConfig {
  /** The enrollment repository instance. */
  readonly enrollments: EnrollmentRepository;
  /** The command bus instance. */
  readonly commandBus: CommandBus;
  /** The query bus instance. */
  readonly queryBus: QueryBus;
  /** The event bus instance. */
  readonly events: EventBus;
  /** The logger instance. */
  readonly logger: Logger;
}

/**
 * Registers all application modules with their command and query handlers.
 * @param config - The module loader configuration.
 */
export function loadModules(config: ModuleLoaderConfig): void {
  const { logger } = config;

  logger.info("Registering modules...");

  registerEnrollmentService({
    enrollments: config.enrollments,
    commandBus: config.commandBus,
    queryBus: config.queryBus,
    events: config.events,
  });
  logger.info("  - enrollment module registered");

  logger.info(
    `All modules registered (${config.commandBus.size()} command handlers)`,
  );
}
