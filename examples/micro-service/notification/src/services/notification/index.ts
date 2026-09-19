import { CommandBus } from "@zudojs/cqrs";
import { QueryBus } from "@zudojs/cqrs";
import type { INotificationRepository } from "../../interfaces/index.js";
import { CreateNotificationCommandHandler } from "./commands/create-notification/create-notification.handler.js";
import { MarkNotificationReadCommandHandler } from "./commands/mark-notification-read/mark-notification-read.handler.js";
import { GetNotificationsQueryHandler } from "./queries/get-notifications/get-notifications.handler.js";

export interface NotificationServiceDeps {
  readonly repository: INotificationRepository;
  readonly commandBus: CommandBus;
  readonly queryBus: QueryBus;
}

export function registerNotificationService(
  deps: NotificationServiceDeps,
): void {
  const createHandler = new CreateNotificationCommandHandler(deps.repository);
  const markReadHandler = new MarkNotificationReadCommandHandler(
    deps.repository,
  );
  const getNotificationsHandler = new GetNotificationsQueryHandler(
    deps.repository,
  );

  deps.commandBus.register(createHandler.commandType, createHandler);
  deps.commandBus.register(markReadHandler.commandType, markReadHandler);
  deps.queryBus.register(
    getNotificationsHandler.queryType,
    getNotificationsHandler,
  );
}
