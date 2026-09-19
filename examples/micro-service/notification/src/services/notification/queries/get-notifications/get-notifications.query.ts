import { Query } from "@zudojs/cqrs";

export const GET_NOTIFICATIONS_QUERY = "notification.list" as const;

export class GetNotificationsQuery extends Query<
  typeof GET_NOTIFICATIONS_QUERY
> {
  public readonly userId?: string;

  constructor(payload?: { readonly userId?: string }) {
    super(GET_NOTIFICATIONS_QUERY);
    this.userId = payload?.userId;
  }
}
