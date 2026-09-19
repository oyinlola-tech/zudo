import { CommandHandler } from "@zudojs/cqrs";
import type { CqrsContext } from "@zudojs/cqrs";
import {
  CreateNotificationCommand,
  CREATE_NOTIFICATION_COMMAND,
} from "./create-notification.command.js";
import type { INotificationRepository } from "../../../../interfaces/index.js";
import type { NotificationModel } from "../../../../models/index.js";
import { NotificationStatus } from "../../../../enums/index.js";
import { createNotificationId } from "../../../../types/index.js";
import { generateId } from "../../../../utils/index.js";

export class CreateNotificationCommandHandler extends CommandHandler<
  CreateNotificationCommand,
  NotificationModel
> {
  public readonly commandType = CREATE_NOTIFICATION_COMMAND;

  private readonly repository: INotificationRepository;

  constructor(repository: INotificationRepository) {
    super();
    this.repository = repository;
  }

  public async execute(
    command: CreateNotificationCommand,
    _context?: CqrsContext,
  ): Promise<NotificationModel> {
    const now = new Date();
    const notification: NotificationModel = {
      id: createNotificationId(generateId()),
      type: command.notificationType,
      title: command.title,
      message: command.message,
      userId: command.userId,
      status: NotificationStatus.UNREAD,
      metadata: command.metadata,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.save(notification);
    return notification;
  }
}
