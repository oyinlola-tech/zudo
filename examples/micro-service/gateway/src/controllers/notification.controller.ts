import type { IncomingMessage, ServerResponse } from "node:http";
import { createServiceClient } from "../services/index.js";
import { serviceConfigs } from "../config/index.js";
import { createNotificationSchema } from "../validators/index.js";

const client = createServiceClient(serviceConfigs["notification"]);

async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString();
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
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
 * Proxies notification creation to the notification service.
 */
export async function createNotification(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await parseBody(req);
  const validation = createNotificationSchema.safeParse(body);

  if (!validation.success) {
    jsonResponse(res, 400, {
      error: "Validation failed",
      details: validation.error.flatten(),
    });
    return;
  }

  const authHeader = req.headers["authorization"] ?? "";
  const result = await client.post("/api/v1/notifications", validation.data, {
    authorization: authHeader,
  });

  jsonResponse(res, result.status, result.data);
}

/**
 * Proxies notification listing to the notification service.
 */
export async function listNotifications(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const authHeader = req.headers["authorization"] ?? "";

  const result = await client.get(`/api/v1/notifications${url.search}`, {
    authorization: authHeader,
  });

  jsonResponse(res, result.status, result.data);
}

/**
 * Proxies get notification by ID to the notification service.
 */
export async function getNotificationById(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const pathParts = url.pathname.split("/");
  const notificationId = pathParts[pathParts.length - 1];
  const authHeader = req.headers["authorization"] ?? "";

  if (!notificationId) {
    jsonResponse(res, 400, { error: "Notification ID is required" });
    return;
  }

  const result = await client.get(`/api/v1/notifications/${notificationId}`, {
    authorization: authHeader,
  });

  jsonResponse(res, result.status, result.data);
}

/**
 * Proxies marking notification as read to the notification service.
 */
export async function markNotificationRead(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const pathParts = url.pathname.split("/");
  const notificationId = pathParts[pathParts.length - 2]; // Before "read"
  const authHeader = req.headers["authorization"] ?? "";

  if (!notificationId) {
    jsonResponse(res, 400, { error: "Notification ID is required" });
    return;
  }

  const result = await client.patch(
    `/api/v1/notifications/${notificationId}/read`,
    {},
    {
      authorization: authHeader,
    },
  );

  jsonResponse(res, result.status, result.data);
}

/**
 * Proxies marking all notifications as read to the notification service.
 */
export async function markAllNotificationsRead(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const authHeader = req.headers["authorization"] ?? "";

  const result = await client.post(
    "/api/v1/notifications/read-all",
    {},
    {
      authorization: authHeader,
    },
  );

  jsonResponse(res, result.status, result.data);
}
