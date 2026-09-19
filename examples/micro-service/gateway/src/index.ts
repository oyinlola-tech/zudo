/**
 * @zudojs/campusflow-gateway
 *
 * CampusFlow Gateway - Public entry point for the microservice architecture.
 * Handles authentication, request validation, and service orchestration.
 */

export { createApp, type GatewayApp } from "./app.js";

export {
  createGatewayConfig,
  serviceConfigs,
  type ServiceConfigs,
} from "./config/index.js";

export { SERVICE_NAMES, API_VERSION } from "./constants/index.js";

export {
  createUser,
  listUsers,
  getUserById,
  updateUser,
  deleteUser,
  loginUser,
  registerUser,
  createEnrollment,
  listEnrollments,
  getEnrollmentById,
  updateEnrollmentStatus,
  withdrawEnrollment,
  createAssessment,
  listAssessments,
  getAssessmentById,
  createSubmission,
  listSubmissions,
  gradeSubmission,
  createNotification,
  listNotifications,
  getNotificationById,
  markNotificationRead,
  markAllNotificationsRead,
} from "./controllers/index.js";

export { findRoute, getAllRoutes } from "./loaders/index.js";

export {
  requestIdMiddleware,
  authenticationMiddleware,
  loggingMiddleware,
  rateLimitMiddleware,
  errorMiddleware,
} from "./middlewares/index.js";

export {
  HttpClient,
  createServiceClient,
  type ServiceResponse,
  type ProxyRequestOptions,
} from "./services/index.js";

export type { UserId } from "./types/index.js";
export { createUserId, isValidUserId } from "./types/index.js";

export {
  generateId,
  parseBoolean,
  extractBearerToken,
  buildQueryString,
} from "./utils/index.js";

export {
  createUserSchema,
  updateUserSchema,
  loginUserSchema,
  createEnrollmentSchema,
  createAssessmentSchema,
  createSubmissionSchema,
  createNotificationSchema,
  type CreateUserInput,
  type UpdateUserInput,
  type LoginUserInput,
  type CreateEnrollmentInput,
  type CreateAssessmentInput,
  type CreateSubmissionInput,
  type CreateNotificationInput,
} from "./validators/index.js";

export { GatewayError, ServiceUnavailableError } from "./errors/index.js";

export type { ServiceConfig, GatewayConfig } from "./interfaces/index.js";
