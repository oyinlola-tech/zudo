import type { NotificationModel } from "../models/index.js";
import type { NotificationId } from "../types/index.js";

export interface INotificationRepository {
  findAll(userId?: string): Promise<readonly NotificationModel[]>;
  findById(id: NotificationId): Promise<NotificationModel | null>;
  save(notification: NotificationModel): Promise<void>;
  update(notification: NotificationModel): Promise<void>;
}
