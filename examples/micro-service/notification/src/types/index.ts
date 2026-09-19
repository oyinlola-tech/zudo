export type NotificationId = string & { readonly __brand: "NotificationId" };

export function createNotificationId(id: string): NotificationId {
  return id as NotificationId;
}
