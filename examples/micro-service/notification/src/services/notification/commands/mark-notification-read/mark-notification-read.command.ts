import { Command } from "@zudojs/cqrs";

export const MARK_NOTIFICATION_READ_COMMAND = "notification.markRead" as const;

export class MarkNotificationReadCommand extends Command<
  typeof MARK_NOTIFICATION_READ_COMMAND
> {
  public readonly notificationId: string;

  constructor(payload: { readonly notificationId: string }) {
    super(MARK_NOTIFICATION_READ_COMMAND);
    this.notificationId = payload.notificationId;
  }
}
