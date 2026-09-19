import { createApp } from "./app.js";

/**
 * Bootstrap and start the CampusFlow Gateway.
 */
async function main(): Promise<void> {
  const app = createApp();

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\nReceived ${signal}. Shutting down gateway...`);
    await app.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.start();
    console.log(
      `CampusFlow Gateway running on http://${app.config.host}:${app.config.port}`,
    );
    console.log(
      `Health check: http://${app.config.host}:${app.config.port}/health`,
    );
  } catch (error) {
    console.error("Failed to start gateway:", error);
    process.exit(1);
  }
}

void main();
