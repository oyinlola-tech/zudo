import type { IncomingMessage, ServerResponse } from "node:http";
import type { IdentityController } from "../controllers/index.js";

/**
 * Creates route handler functions bound to the IdentityController.
 */
export function createIdentityRoutes(controller: IdentityController) {
  return {
    /**
     * Routes incoming requests to the appropriate controller method.
     */
    async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
      const method = req.method ?? "GET";
      const url = req.url ?? "/";
      const path = url.split("?")[0] ?? "/";

      // Health check
      if (method === "GET" && path === "/api/identity/health") {
        controller.health(req, res);
        return true;
      }

      // Register
      if (method === "POST" && path === "/api/identity/register") {
        await controller.register(req, res);
        return true;
      }

      // Authenticate
      if (method === "POST" && path === "/api/identity/authenticate") {
        await controller.authenticate(req, res);
        return true;
      }

      // Get user by ID: /api/identity/users/:id
      if (method === "GET" && path.startsWith("/api/identity/users/")) {
        const userId = path.split("/api/identity/users/")[1];
        if (userId) {
          await controller.getUser(req, res, userId);
          return true;
        }
      }

      // Get user profile by email: /api/identity/profile?email=...
      if (method === "GET" && path === "/api/identity/profile") {
        const parsedUrl = new URL(
          url,
          `http://${req.headers.host ?? "localhost"}`,
        );
        const email = parsedUrl.searchParams.get("email");
        if (email) {
          await controller.getUserProfile(req, res, email);
          return true;
        }
      }

      return false;
    },
  };
}
