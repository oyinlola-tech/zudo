import type { Job } from "@zudojs/queue";
import type { JobContext } from "@zudojs/queue";
import type { CommandBus } from "@zudojs/cqrs";
import { CreateNotificationCommand } from "../services/notification/commands/create-notification/create-notification.command.js";
import { NotificationType } from "../enums/index.js";
import {
  mapEventTypeToNotificationType,
  buildNotificationTitle,
  buildNotificationMessage,
} from "../utils/index.js";

export interface ProcessNotificationJobData {
  readonly eventType: string;
  readonly userId: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export function createProcessNotificationProcessor(commandBus: CommandBus) {
  return async (
    job: Job<ProcessNotificationJobData>,
    _context: JobContext<ProcessNotificationJobData>,
  ) => {
    const { eventType, userId, metadata } = job.data;

    const notificationType = mapEventTypeToNotificationType(eventType);
    const title = buildNotificationTitle(notificationType);
    const message = buildNotificationMessage(notificationType, metadata);

    const command = new CreateNotificationCommand({
      userId,
      type: notificationType,
      title,
      message,
      metadata: { ...metadata, sourceEvent: eventType },
    });

    await commandBus.execute(command);
  };
}
