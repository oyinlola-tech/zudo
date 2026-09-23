/**
 * zudojs-cli — `zudojs add websockets`: a `ws` WebSocketServer attached to
 * the app's HTTP server at WEBSOCKET_PATH. Browser connections are only
 * accepted from CORS_ORIGINS (cross-site WebSocket hijacking), messages
 * are capped at 64 KiB, and open sockets are closed with 1001 when
 * shutdown begins so the HTTP server can stop.
 */

import { DEPENDENCY_VERSION_RANGES } from "../../resolvers/dependency/dependencyVersions.constant.js";
import type { AppRecipe } from "../recipe.type.js";

const source = (): string => `import { WebSocketServer, type WebSocket } from "ws";

import type { Integration } from "./integration.js";

let server: WebSocketServer | undefined;

/** The WebSocket server. Throws before the runtime has started. */
export function websockets(): WebSocketServer {
  if (server === undefined) {
    throw new Error("The WebSocket server is not running: start the runtime first.");
  }
  return server;
}

/** Sends \`data\` to every open connection. */
export function broadcast(data: string): void {
  for (const socket of websockets().clients) {
    if (socket.readyState === socket.OPEN) socket.send(data);
  }
}

export const websocketsIntegration: Integration = {
  name: "websockets",

  async start({ config, httpServer, logger }) {
    if (httpServer === undefined) {
      throw new Error("WebSockets need the HTTP server: pass httpServer to createApp().");
    }
    const allowed = new Set(config.corsOrigins);
    server = new WebSocketServer({
      server: httpServer,
      path: config.websockets.path,
      maxPayload: 64 * 1024,
      // A browser always sends Origin; refuse pages from origins not in
      // CORS_ORIGINS. Clients without Origin are not browsers.
      verifyClient: ({ origin }: { origin?: string }) =>
        origin === undefined || origin === "" || allowed.has(origin),
    });
    server.on("connection", (socket: WebSocket) => {
      socket.on("error", (error: Error) => logger.warn("WebSocket error", { error }));
      // Example handler: echo each message back. Replace with your protocol.
      socket.on("message", (data) => socket.send(data.toString()));
    });
  },

  async drain() {
    for (const socket of server?.clients ?? []) socket.close(1001, "Server shutting down");
  },

  async stop() {
    const current = server;
    server = undefined;
    if (current === undefined) return;
    for (const socket of current.clients) socket.terminate();
    await new Promise<void>((resolve) => current.close(() => resolve()));
  },

  async health() {
    return server !== undefined;
  },
};
`;

export const websocketsRecipe: AppRecipe = {
  scope: "app",
  feature: "websockets",
  summary: "WebSocket server attached to the HTTP server (src/integrations/websockets.ts)",
  dependencies: { ws: DEPENDENCY_VERSION_RANGES.ws },
  devDependencies: { "@types/ws": DEPENDENCY_VERSION_RANGES["@types/ws"] },
  env: () => [{ name: "WEBSOCKET_PATH", value: "/ws" }],
  configSection: `websockets: Object.freeze({ path: text(config, "websocket_path", "/ws") }),`,
  integration: { file: "websockets.ts", exportName: "websocketsIntegration", source },
  nextSteps: () => [
    `Connect to ws://localhost:<PORT>/ws; browsers must be on an origin listed in CORS_ORIGINS.`,
  ],
};
