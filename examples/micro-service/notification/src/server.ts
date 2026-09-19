import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { INotificationRepository } from "./interfaces/index.js";
import type { NotificationModel } from "./models/index.js";
import { NotificationStatus } from "./enums/index.js";
import { createNotificationId } from "./types/index.js";
import { createApp } from "./app.js";
import { NotificationController } from "./controllers/index.js";
import { registerNotificationRoutes } from "./routes/index.js";
import { createAppConfig } from "./config/index.js";

class InMemoryNotificationRepository implements INotificationRepository {
  private readonly store = new Map<string, NotificationModel>();

  async findAll(userId?: string): Promise<readonly NotificationModel[]> {
    const all = Array.from(this.store.values());
    if (userId) {
      return all
        .filter((n) => n.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    return all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findById(id: string): Promise<NotificationModel | null> {
    return this.store.get(id) ?? null;
  }

  async save(notification: NotificationModel): Promise<void> {
    this.store.set(notification.id as string, notification);
  }

  async update(notification: NotificationModel): Promise<void> {
    this.store.set(notification.id as string, notification);
  }
}

async function main(): Promise<void> {
  const config = createAppConfig();
  const repository = new InMemoryNotificationRepository();
  const app = createApp(repository);

  const controller = new NotificationController({
    commandBus: app.commandBus,
    queryBus: app.queryBus,
  });

  const routes = new Map<
    string,
    (req: IncomingMessage, res: ServerResponse) => Promise<void>
  >();
  registerNotificationRoutes(routes, controller);

  const server = createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const urlStr = req.url ?? "/";
    const host = req.headers.host ?? "localhost";
    const url = new URL(urlStr, `http://${host}`);
    const path = url.pathname;

    // Match routes (simple prefix matching)
    for (const [key, handler] of routes) {
      const parts = key.split(":");
      const routeMethod = parts[0];
      const routePath = parts[1];
      if (
        routeMethod &&
        routePath &&
        routeMethod === method &&
        path.startsWith(routePath)
      ) {
        await handler(req, res);
        return;
      }
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  server.listen(config.port, config.host, () => {
    console.log(
      `Notification service running at http://${config.host}:${config.port}`,
    );
  });

  const shutdown = async () => {
    console.log("Shutting down notification service...");
    await app.shutdown();
    server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Failed to start notification service:", error);
  process.exit(1);
});
