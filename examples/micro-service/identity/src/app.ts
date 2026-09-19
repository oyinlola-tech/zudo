import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
  type Server,
} from "node:http";
import { createCommandBus } from "@zudojs/cqrs";
import { createQueryBus } from "@zudojs/cqrs";
import { createEventBus } from "@zudojs/events";
import { createAppConfig } from "./config/app.config.js";
import { createDatabaseConfig } from "./config/database.config.js";
import { createSecurityConfig } from "./config/security.config.js";
import { createServiceConfig } from "./config/service.config.js";
import { createIdentityDatabase } from "./databases/index.js";
import { SqliteUserRepository } from "./repositories/index.js";
import { IdentityController } from "./controllers/index.js";
import { createIdentityRoutes } from "./routes/index.js";
import { loadModules, loadEvents } from "./loaders/index.js";
import {
  requestIdMiddleware,
  loggingMiddleware,
  errorMiddleware,
} from "./middlewares/index.js";
import { APP_NAME } from "./constants/index.js";

/**
 * Application context holding all resolved dependencies.
 */
export interface AppContext {
  readonly server: Server;
  readonly config: ReturnType<typeof createAppConfig>;
  readonly shutdown: () => void;
}

/**
 * Creates and configures the full Identity service application.
 */
export function createApp(): AppContext {
  const appConfig = createAppConfig();
  const dbConfig = createDatabaseConfig();
  const securityConfig = createSecurityConfig();
  const serviceConfig = createServiceConfig();

  const db = createIdentityDatabase(dbConfig);
  const userRepository = new SqliteUserRepository(db);

  const eventBus = createEventBus();
  const commandBus = createCommandBus();
  const queryBus = createQueryBus();

  loadEvents(eventBus);
  loadModules({
    commandBus,
    queryBus,
    eventBus,
    userRepository,
    jwtSecret: securityConfig.jwtSecret,
    jwtExpiresIn: securityConfig.jwtExpiresIn,
  });

  const controller = new IdentityController(commandBus, queryBus);
  const routes = createIdentityRoutes(controller);

  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      try {
        requestIdMiddleware(req, res, () => {});
        loggingMiddleware(req, res, () => {});

        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, DELETE, OPTIONS",
        );
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization, X-Request-Id",
        );

        if (req.method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }

        const handled = await routes.handle(req, res);

        if (!handled) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: {
                message: `Route ${req.method} ${req.url} not found.`,
                statusCode: 404,
              },
            }),
          );
        }
      } catch (err) {
        errorMiddleware(err, req, res);
      }
    },
  );

  const shutdown = (): void => {
    console.log(`[${APP_NAME}] Shutting down...`);
    server.close(() => {
      db.close();
      console.log(`[${APP_NAME}] Shutdown complete.`);
    });
  };

  return { server, config: appConfig, shutdown };
}
