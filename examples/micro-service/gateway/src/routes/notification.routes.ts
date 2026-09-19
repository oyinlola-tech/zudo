import type { Route } from "../routes/index.js";
import {
  createNotification,
  listNotifications,
  getNotificationById,
  markNotificationRead,
  markAllNotificationsRead,
} from "../controllers/index.js";

/**
 * Notification routes.
 * All routes require authentication.
 */
export const notificationRoutes: readonly Route[] = [
  {
    method: "GET",
    pattern: /^\/api\/v1\/notifications$/,
    handler: listNotifications,
    requiresAuth: true,
  },
  {
    method: "GET",
    pattern: /^\/api\/v1\/notifications\/(?<id>[^/]+)$/,
    handler: getNotificationById,
    requiresAuth: true,
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/notifications$/,
    handler: createNotification,
    requiresAuth: true,
  },
  {
    method: "PATCH",
    pattern: /^\/api\/v1\/notifications\/(?<id>[^/]+)\/read$/,
    handler: markNotificationRead,
    requiresAuth: true,
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/notifications\/read-all$/,
    handler: markAllNotificationsRead,
    requiresAuth: true,
  },
];
