import type {
  CreateNotificationDto,
  MarkNotificationReadDto,
} from "../dtos/index.js";
import { NotificationValidationError } from "../errors/index.js";

export function validateCreateNotificationDto(
  dto: unknown,
): CreateNotificationDto {
  const input = dto as Record<string, unknown>;

  if (!input || typeof input !== "object") {
    throw new NotificationValidationError(
      "Notification data must be an object",
    );
  }

  if (typeof input.userId !== "string" || input.userId.trim().length === 0) {
    throw new NotificationValidationError("userId is required");
  }

  if (typeof input.type !== "string" || input.type.trim().length === 0) {
    throw new NotificationValidationError("type is required");
  }

  if (typeof input.title !== "string" || input.title.trim().length === 0) {
    throw new NotificationValidationError("title is required");
  }

  if (typeof input.message !== "string" || input.message.trim().length === 0) {
    throw new NotificationValidationError("message is required");
  }

  return {
    userId: input.userId as string,
    type: input.type as string,
    title: input.title as string,
    message: input.message as string,
    metadata: input.metadata as Readonly<Record<string, unknown>> | undefined,
  };
}

export function validateMarkNotificationReadDto(
  dto: unknown,
): MarkNotificationReadDto {
  const input = dto as Record<string, unknown>;

  if (!input || typeof input !== "object") {
    throw new NotificationValidationError("Request body must be an object");
  }

  if (
    typeof input.notificationId !== "string" ||
    input.notificationId.trim().length === 0
  ) {
    throw new NotificationValidationError("notificationId is required");
  }

  return {
    notificationId: input.notificationId as string,
  };
}
