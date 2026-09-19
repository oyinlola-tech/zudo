import type { CommandBus, QueryBus } from "@zudojs/cqrs";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { INotificationRepository } from "../interfaces/index.js";
import { CreateNotificationCommand } from "../services/notification/commands/create-notification/create-notification.command.js";
import { MarkNotificationReadCommand } from "../services/notification/commands/mark-notification-read/mark-notification-read.command.js";
import { GetNotificationsQuery } from "../services/notification/queries/get-notifications/get-notifications.query.js";
import {
  validateCreateNotificationDto,
  validateMarkNotificationReadDto,
} from "../validators/index.js";

export interface NotificationControllerDeps {
  readonly commandBus: CommandBus;
  readonly queryBus: QueryBus;
}

/**
 * Thin HTTP controller that delegates to the CQRS buses.
 */
export class NotificationController {
  private readonly commandBus: CommandBus;
  private readonly queryBus: QueryBus;

  constructor(deps: NotificationControllerDeps) {
    this.commandBus = deps.commandBus;
    this.queryBus = deps.queryBus;
  }

  /**
   * GET /api/notifications
   */
  async getNotifications(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      const userId = url.searchParams.get("userId") ?? undefined;
      const query = new GetNotificationsQuery({ userId });
      const result = await this.queryBus.execute(query);
      this.sendJson(res, 200, { notifications: result });
    } catch (err) {
      this.sendError(res, 500, "Internal server error");
    }
  }

  /**
   * POST /api/notifications
   */
  async createNotification(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    try {
      const body = await this.readBody(req);
      const dto = validateCreateNotificationDto(body);
      const command = new CreateNotificationCommand({
        userId: dto.userId,
        type: dto.type as import("../enums/index.js").NotificationType,
        title: dto.title,
        message: dto.message,
        metadata: dto.metadata,
      });
      const result = await this.commandBus.execute(command);
      this.sendJson(res, 201, result);
    } catch (err) {
      this.sendError(res, 500, "Internal server error");
    }
  }

  /**
   * POST /api/notifications/read
   */
  async markAsRead(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const dto = validateMarkNotificationReadDto(body);
      const command = new MarkNotificationReadCommand({
        notificationId: dto.notificationId,
      });
      const result = await this.commandBus.execute(command);
      this.sendJson(res, 200, result);
    } catch (err) {
      this.sendError(res, 500, "Internal server error");
    }
  }

  /**
   * GET /api/notifications/health
   */
  health(_req: IncomingMessage, res: ServerResponse): void {
    this.sendJson(res, 200, {
      service: "notification",
      status: "healthy",
      timestamp: new Date().toISOString(),
    });
  }

  private readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        try {
          const raw = Buffer.concat(chunks).toString("utf-8");
          resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
        } catch (err) {
          reject(err);
        }
      });
      req.on("error", reject);
    });
  }

  private sendJson(
    res: ServerResponse,
    statusCode: number,
    data: unknown,
  ): void {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }

  private sendError(
    res: ServerResponse,
    statusCode: number,
    message: string,
  ): void {
    this.sendJson(res, statusCode, { error: { message, statusCode } });
  }
}
