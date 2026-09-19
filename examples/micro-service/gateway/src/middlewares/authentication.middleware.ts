import type { IncomingMessage, ServerResponse } from "node:http";
import jwt from "jsonwebtoken";
import { createLogger } from "@zudojs/logger";

const logger = createLogger({ name: "gateway:auth" });

/**
 * Validates the JWT token from the Authorization header.
 * Attaches the decoded payload to the request for downstream use.
 */
export function authenticationMiddleware(
  jwtSecret: string,
): (req: IncomingMessage, res: ServerResponse, next: () => void) => void {
  return (req, res, next) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing Authorization header" }));
      return;
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Invalid Authorization format. Use: Bearer <token>",
        }),
      );
      return;
    }

    const token = parts[1];
    if (!token) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing token" }));
      return;
    }

    try {
      const decoded = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });

      // Attach decoded user to request
      (req as IncomingMessage & { user: unknown }).user = decoded;

      logger.debug("Token validated", {
        userId:
          typeof decoded === "object" && decoded !== null && "sub" in decoded
            ? String((decoded as { sub: unknown }).sub)
            : undefined,
      });

      next();
    } catch (error) {
      logger.warn("Token validation failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid or expired token" }));
    }
  };
}
