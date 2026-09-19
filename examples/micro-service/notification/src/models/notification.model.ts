import type { NotificationId } from "../types/index.js";
import type { NotificationType, NotificationStatus } from "../enums/index.js";

export interface NotificationModel {
  readonly id: NotificationId;
  readonly type: NotificationType;
  readonly title: string;
  readonly message: string;
  readonly userId: string;
  readonly status: NotificationStatus;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
