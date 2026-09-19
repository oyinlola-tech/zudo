import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createLogger } from "@zudojs/logger";
import { createGatewayConfig } from "./config/index.js";
import { findRoute } from "./loaders/index.js";
import { requestIdMiddleware } from "./middlewares/request-id.middleware.js";
import { authenticationMiddleware } from "./middlewares/authentication.middleware.js";
import { loggingMiddleware } from "./middlewares/logging.middleware.js";
import { rateLimitMiddleware } from "./middlewares/rate-limit.middleware.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";

const logger = createLogger({ name: "gateway" });

export interface GatewayApp {
  readonly server: ReturnType<typeof createServer>;
  readonly config: ReturnType<typeof createGatewayConfig>;
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

function jsonResponse(
  res: ServerResponse,
  status: number,
  data: unknown,
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

/**
 * Creates the gateway application with all routes and middleware wired.
 */
export function createApp(): GatewayApp {
  const config = createGatewayConfig();
  const authMiddleware = authenticationMiddleware(config.jwtSecret);
  const rateLimit = rateLimitMiddleware(60_000, 100);

  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      try {
        // 1. Assign request ID
        requestIdMiddleware(req, res, () => {});

        // 2. Rate limiting
        let rateLimited = false;
        rateLimit(req, res, () => {});
        if (res.headersSent) {
          rateLimited = true;
        }

        if (rateLimited) return;

        // 3. Logging
        loggingMiddleware(req, res, () => {});

        // 4. CORS preflight
        if (req.method === "OPTIONS") {
          res.writeHead(204, {
            "Access-Control-Allow-Origin": config.corsOrigin,
            "Access-Control-Allow-Methods":
              "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers":
              "Content-Type, Authorization, X-Request-Id",
            "Access-Control-Max-Age": "86400",
          });
          res.end();
          return;
        }

        // 5. Set CORS header on all responses
        res.setHeader("Access-Control-Allow-Origin", config.corsOrigin);

        // 6. Health check
        const url = new URL(
          req.url ?? "/",
          `http://${req.headers.host ?? "localhost"}`,
        );
        if (url.pathname === "/health") {
          jsonResponse(res, 200, {
            status: "healthy",
            service: "gateway",
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // 7. Find matching route
        const match = findRoute(req.method, url.pathname);

        if (!match) {
          jsonResponse(res, 404, {
            error: "Not Found",
            message: `No route found for ${req.method} ${url.pathname}`,
          });
          return;
        }

        // 8. Authentication (if required)
        if (match.route.requiresAuth) {
          let authPassed = false;
          authMiddleware(req, res, () => {
            authPassed = true;
          });
          if (!authPassed) return;
        }

        // 9. Execute route handler
        await match.route.handler(req, res);
      } catch (error) {
        errorMiddleware(req, res, error);
      }
    },
  );

  const start = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      server.listen(config.port, config.host, () => {
        logger.info(`Gateway started`, {
          host: config.host,
          port: config.port,
        });
        resolve();
      });
      server.on("error", reject);
    });
  };

  const stop = (): Promise<void> => {
    return new Promise((resolve) => {
      server.close(() => {
        logger.info("Gateway stopped");
        resolve();
      });
    });
  };

  return { server, config, start, stop };
}
