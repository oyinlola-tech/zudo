import type { Route } from "../routes/index.js";
import {
  createUser,
  listUsers,
  getUserById,
  updateUser,
  deleteUser,
} from "../controllers/index.js";

/**
 * User routes.
 * All routes require authentication.
 */
export const userRoutes: readonly Route[] = [
  {
    method: "GET",
    pattern: /^\/api\/v1\/users$/,
    handler: listUsers,
    requiresAuth: true,
  },
  {
    method: "GET",
    pattern: /^\/api\/v1\/users\/(?<id>[^/]+)$/,
    handler: getUserById,
    requiresAuth: true,
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/users$/,
    handler: createUser,
    requiresAuth: true,
  },
  {
    method: "PATCH",
    pattern: /^\/api\/v1\/users\/(?<id>[^/]+)$/,
    handler: updateUser,
    requiresAuth: true,
  },
  {
    method: "DELETE",
    pattern: /^\/api\/v1\/users\/(?<id>[^/]+)$/,
    handler: deleteUser,
    requiresAuth: true,
  },
];
