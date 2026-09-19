export interface CreateNotificationDto {
  readonly userId: string;
  readonly type: string;
  readonly title: string;
  readonly message: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface MarkNotificationReadDto {
  readonly notificationId: string;
}
