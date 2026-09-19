import type { IncomingMessage, ServerResponse } from "node:http";
import type { CommandBus, QueryBus } from "@zudojs/cqrs";
import { CreateUserCommand } from "../services/identity/commands/create-user/create-user.command.js";
import { AuthenticateUserCommand } from "../services/identity/commands/authenticate-user/authenticate-user.command.js";
import { GetUserQuery } from "../services/identity/queries/get-user/get-user.query.js";
import { GetUserProfileQuery } from "../services/identity/queries/get-user-profile/get-user-profile.query.js";
import {
  CreateUserSchema,
  AuthenticateUserSchema,
} from "../validators/index.js";
import { errorMiddleware } from "../middlewares/index.js";

/**
 * Thin HTTP controller that delegates to the CQRS buses.
 */
export class IdentityController {
  private readonly commandBus: CommandBus;
  private readonly queryBus: QueryBus;

  constructor(commandBus: CommandBus, queryBus: QueryBus) {
    this.commandBus = commandBus;
    this.queryBus = queryBus;
  }

  /**
   * POST /api/identity/register
   */
  async register(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const parsed = CreateUserSchema.safeParse(body);

      if (!parsed.success) {
        this.sendError(
          res,
          400,
          "Validation failed.",
          parsed.error.flatten().fieldErrors,
        );
        return;
      }

      const result = await this.commandBus.execute<
        CreateUserCommand,
        Record<string, unknown>
      >(
        new CreateUserCommand({
          email: parsed.data.email,
          password: parsed.data.password,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          role: parsed.data.role,
        }),
      );

      this.sendJson(res, 201, { user: result });
    } catch (err) {
      errorMiddleware(err, req, res);
    }
  }

  /**
   * POST /api/identity/authenticate
   */
  async authenticate(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const parsed = AuthenticateUserSchema.safeParse(body);

      if (!parsed.success) {
        this.sendError(
          res,
          400,
          "Validation failed.",
          parsed.error.flatten().fieldErrors,
        );
        return;
      }

      const result = await this.commandBus.execute<
        AuthenticateUserCommand,
        Record<string, unknown>
      >(
        new AuthenticateUserCommand({
          email: parsed.data.email,
          password: parsed.data.password,
        }),
      );

      this.sendJson(res, 200, result);
    } catch (err) {
      errorMiddleware(err, req, res);
    }
  }

  /**
   * GET /api/identity/users/:id
   */
  async getUser(
    req: IncomingMessage,
    res: ServerResponse,
    userId: string,
  ): Promise<void> {
    try {
      const result = await this.queryBus.execute(new GetUserQuery({ userId }));

      this.sendJson(res, 200, { user: result });
    } catch (err) {
      errorMiddleware(err, req, res);
    }
  }

  /**
   * GET /api/identity/profile?email=...
   */
  async getUserProfile(
    req: IncomingMessage,
    res: ServerResponse,
    email: string,
  ): Promise<void> {
    try {
      const result = await this.queryBus.execute(
        new GetUserProfileQuery({ email }),
      );

      this.sendJson(res, 200, { user: result });
    } catch (err) {
      errorMiddleware(err, req, res);
    }
  }

  /**
   * GET /api/identity/health
   */
  health(_req: IncomingMessage, res: ServerResponse): void {
    this.sendJson(res, 200, {
      service: "identity",
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
    details?: unknown,
  ): void {
    this.sendJson(res, statusCode, {
      error: { message, statusCode, details },
    });
  }
}
