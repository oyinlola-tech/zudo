import type { Route } from "../routes/index.js";
import {
  createEnrollment,
  listEnrollments,
  getEnrollmentById,
  updateEnrollmentStatus,
  withdrawEnrollment,
} from "../controllers/index.js";

/**
 * Enrollment routes.
 * All routes require authentication.
 */
export const enrollmentRoutes: readonly Route[] = [
  {
    method: "GET",
    pattern: /^\/api\/v1\/enrollments$/,
    handler: listEnrollments,
    requiresAuth: true,
  },
  {
    method: "GET",
    pattern: /^\/api\/v1\/enrollments\/(?<id>[^/]+)$/,
    handler: getEnrollmentById,
    requiresAuth: true,
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/enrollments$/,
    handler: createEnrollment,
    requiresAuth: true,
  },
  {
    method: "PATCH",
    pattern: /^\/api\/v1\/enrollments\/(?<id>[^/]+)\/status$/,
    handler: updateEnrollmentStatus,
    requiresAuth: true,
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/enrollments\/(?<id>[^/]+)\/withdraw$/,
    handler: withdrawEnrollment,
    requiresAuth: true,
  },
];
