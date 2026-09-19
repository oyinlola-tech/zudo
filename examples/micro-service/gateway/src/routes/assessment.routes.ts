import type { Route } from "../routes/index.js";
import {
  createAssessment,
  listAssessments,
  getAssessmentById,
  createSubmission,
  listSubmissions,
  gradeSubmission,
} from "../controllers/index.js";

/**
 * Assessment routes.
 * All routes require authentication.
 */
export const assessmentRoutes: readonly Route[] = [
  {
    method: "GET",
    pattern: /^\/api\/v1\/assessments$/,
    handler: listAssessments,
    requiresAuth: true,
  },
  {
    method: "GET",
    pattern: /^\/api\/v1\/assessments\/(?<id>[^/]+)$/,
    handler: getAssessmentById,
    requiresAuth: true,
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/assessments$/,
    handler: createAssessment,
    requiresAuth: true,
  },
  {
    method: "GET",
    pattern: /^\/api\/v1\/submissions$/,
    handler: listSubmissions,
    requiresAuth: true,
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/submissions$/,
    handler: createSubmission,
    requiresAuth: true,
  },
  {
    method: "PATCH",
    pattern: /^\/api\/v1\/submissions\/(?<id>[^/]+)\/grade$/,
    handler: gradeSubmission,
    requiresAuth: true,
  },
];
