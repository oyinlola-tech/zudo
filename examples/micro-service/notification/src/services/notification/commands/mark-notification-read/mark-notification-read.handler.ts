import { CommandHandler } from "@zudojs/cqrs";
import type { CqrsContext } from "@zudojs/cqrs";
import {
  MarkNotificationReadCommand,
  MARK_NOTIFICATION_READ_COMMAND,
} from "./mark-notification-read.command.js";
import type { INotificationRepository } from "../../../../interfaces/index.js";
import type { NotificationModel } from "../../../../models/index.js";
import { NotificationStatus } from "../../../../enums/index.js";
import { NotificationNotFoundError } from "../../../../errors/index.js";
import { createNotificationId } from "../../../../types/index.js";

export class MarkNotificationReadCommandHandler extends CommandHandler<
  MarkNotificationReadCommand,
  NotificationModel
> {
  public readonly commandType = MARK_NOTIFICATION_READ_COMMAND;

  private readonly repository: INotificationRepository;

  constructor(repository: INotificationRepository) {
    super();
    this.repository = repository;
  }

  public async execute(
    command: MarkNotificationReadCommand,
    _context?: CqrsContext,
  ): Promise<NotificationModel> {
    const notificationId = createNotificationId(command.notificationId);
    const existing = await this.repository.findById(notificationId);

    if (!existing) {
      throw new NotificationNotFoundError(command.notificationId);
    }

    const updated: NotificationModel = {
      ...existing,
      status: NotificationStatus.READ,
      updatedAt: new Date(),
    };

    await this.repository.update(updated);
    return updated;
  }
}
