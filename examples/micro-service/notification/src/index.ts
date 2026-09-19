export type { NotificationModel } from "./models/index.js";
export type { INotificationRepository } from "./interfaces/index.js";
export type { NotificationId } from "./types/index.js";
export { NotificationType, NotificationStatus } from "./enums/index.js";
export type {
  CreateNotificationDto,
  MarkNotificationReadDto,
} from "./dtos/index.js";
export {
  CreateNotificationCommand,
  MarkNotificationReadCommand,
} from "./services/notification/commands/index.js";
export { GetNotificationsQuery } from "./services/notification/queries/index.js";
export { registerNotificationService } from "./services/index.js";
export type { NotificationServiceDeps } from "./services/index.js";
export {
  UserCreatedEvent,
  StudentEnrolledEvent,
  AssessmentSubmittedEvent,
  ResultPublishedEvent,
} from "./events/index.js";
export type {
  UserCreatedPayload,
  StudentEnrolledPayload,
  AssessmentSubmittedPayload,
  ResultPublishedPayload,
} from "./events/index.js";
