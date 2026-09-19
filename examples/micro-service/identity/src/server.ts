import { createApp } from "./app.js";
import { APP_NAME } from "./constants/index.js";

/**
 * Bootstraps and starts the Identity service.
 * Seeds demo data if the database is empty.
 */
async function main(): Promise<void> {
  const { server, config, shutdown } = createApp();

  process.on("SIGINT", () => {
    shutdown();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    shutdown();
    process.exit(0);
  });

  server.listen(config.port, config.host, () => {
    console.log(
      `[${APP_NAME}] Server running at http://${config.host}:${config.port}`,
    );
    console.log(
      `[${APP_NAME}] Health check: http://${config.host}:${config.port}/api/identity/health`,
    );
  });
}

main().catch((err) => {
  console.error(`[${APP_NAME}] Fatal error during startup:`, err);
  process.exit(1);
});
