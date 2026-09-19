import { CommandBus, createCommandBus } from "@zudojs/cqrs";
import { QueryBus, createQueryBus } from "@zudojs/cqrs";
import { createEventBus } from "@zudojs/events";
import { LoggerLevel } from "@zudojs/logger";
import { createAppLogger } from "./config/logger.js";
import { createAppConfig } from "./config/app.config.js";
import { initDatabase } from "./databases/enrollment.database.js";
import { SqliteEnrollmentRepository } from "./repositories/index.js";
import { loadModules } from "./loaders/modules.loader.js";
import { loadEvents } from "./loaders/events.loader.js";
import { createAllRoutes, type Route } from "./routes/index.js";

/** The application interface. */
export interface App {
  /** The command bus instance. */
  readonly commandBus: CommandBus;
  /** The query bus instance. */
  readonly queryBus: QueryBus;
  /** The registered HTTP routes. */
  readonly routes: readonly Route[];
  /** Starts the application. */
  readonly start: () => Promise<void>;
  /** Stops the application gracefully. */
  readonly stop: () => Promise<void>;
}

/**
 * Creates and configures the enrollment application.
 * @returns The configured App instance.
 */
export async function createApp(): Promise<App> {
  const appConfig = createAppConfig();
  const logger = createAppLogger(
    appConfig.env === "production" ? LoggerLevel.INFO : LoggerLevel.DEBUG,
  );

  logger.info("=".repeat(60));
  logger.info(`  ${appConfig.name} v${appConfig.version}`);
  logger.info(`  Environment: ${appConfig.env}`);
  logger.info("=".repeat(60));

  const db = initDatabase({
    filename: process.env["DATABASE_FILENAME"] ?? "./data/enrollment.db",
    verbose: appConfig.env === "development",
  });
  logger.info("Database initialized");

  const commandBus = createCommandBus();
  const queryBus = createQueryBus();
  const events = createEventBus();
  logger.info("CQRS buses and event bus created");

  const enrollments = new SqliteEnrollmentRepository();
  logger.info("Repositories initialized");

  loadEvents({ events, logger });

  loadModules({
    enrollments,
    commandBus,
    queryBus,
    events,
    logger,
  });

  const routes = createAllRoutes(commandBus, queryBus);

  logger.info("Registered routes:");
  for (const route of routes) {
    logger.info(`  ${route.method.padEnd(7)} ${route.path}`);
  }

  return {
    commandBus,
    queryBus,
    routes,
    start: async () => {
      logger.info("=".repeat(60));
      logger.info("  Application ready");
      logger.info("=".repeat(60));
    },
    stop: async () => {
      logger.info("Shutting down...");
      const { closeDatabase } =
        await import("./databases/enrollment.database.js");
      closeDatabase();
      logger.info("Database closed");
    },
  };
}
