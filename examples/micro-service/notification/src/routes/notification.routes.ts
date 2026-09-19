import type { IncomingMessage, ServerResponse } from "node:http";
import { NotificationController } from "../controllers/index.js";

/**
 * Registers notification routes on a simple path-based router.
 */
export function registerNotificationRoutes(
  routes: Map<
    string,
    (req: IncomingMessage, res: ServerResponse) => Promise<void>
  >,
  controller: NotificationController,
): void {
  routes.set("GET:/api/notifications", (req, res) =>
    controller.getNotifications(req, res),
  );
  routes.set("POST:/api/notifications", (req, res) =>
    controller.createNotification(req, res),
  );
  routes.set("POST:/api/notifications/read", (req, res) =>
    controller.markAsRead(req, res),
  );
  routes.set("GET:/api/notifications/health", (req, res) => {
    controller.health(req, res);
    return Promise.resolve();
  });
}
