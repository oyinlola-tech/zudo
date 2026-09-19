import { Command } from "@zudojs/cqrs";
import type { NotificationType } from "../../../../enums/index.js";

export const CREATE_NOTIFICATION_COMMAND = "notification.create" as const;

export class CreateNotificationCommand extends Command<
  typeof CREATE_NOTIFICATION_COMMAND
> {
  public readonly userId: string;
  public readonly notificationType: NotificationType;
  public readonly title: string;
  public readonly message: string;
  public readonly metadata?: Readonly<Record<string, unknown>>;

  constructor(payload: {
    readonly userId: string;
    readonly type: NotificationType;
    readonly title: string;
    readonly message: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
  }) {
    super(CREATE_NOTIFICATION_COMMAND);
    this.userId = payload.userId;
    this.notificationType = payload.type;
    this.title = payload.title;
    this.message = payload.message;
    this.metadata = payload.metadata;
  }
}
