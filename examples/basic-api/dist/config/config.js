/**
 * Application configuration.
 *
 * Loaded from environment variables with sensible defaults.
 */
export function loadConfig() {
    return {
        port: Number(process.env.PORT ?? 3000),
        host: process.env.HOST ?? "0.0.0.0",
        nodeEnv: process.env.NODE_ENV ?? "development",
    };
}
//# sourceMappingURL=config.js.map