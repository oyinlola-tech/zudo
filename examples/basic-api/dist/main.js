/**
 * Basic API Example — Entry Point
 *
 * A minimal REST API built with Zudojs.
 *
 * This example demonstrates:
 * - Module system with lifecycle hooks
 * - Dependency injection through modules
 * - HTTP request handling
 * - Request validation
 * - Configuration
 * - Health checks
 */
import * as http from "node:http";
import { loadConfig } from "./config/config.js";
import { AppModule } from "./app/app.module.js";
const config = loadConfig();
async function bootstrap() {
    const app = new AppModule();
    await app.initialize();
    const usersController = app.getUsersController();
    const healthController = app.getHealthController();
    const server = http.createServer(async (req, res) => {
        const url = req.url ?? "/";
        const method = req.method ?? "GET";
        try {
            const body = await readBody(req);
            const request = {
                method,
                url,
                headers: req.headers,
                body,
                params: {},
                query: {},
                id: crypto.randomUUID(),
            };
            let result;
            if (url.startsWith("/health")) {
                result = await healthController.handleRequest(request);
            }
            else if (url.startsWith("/users")) {
                result = await usersController.handleRequest(request);
            }
            else {
                result = { status: 404, body: { error: "Not found" } };
            }
            res.writeHead(result.status, { "Content-Type": "application/json" });
            if (result.body !== undefined) {
                res.end(JSON.stringify(result.body));
            }
            else {
                res.end();
            }
        }
        catch (error) {
            console.error("Unhandled error:", error);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal server error" }));
        }
    });
    server.listen(config.port, config.host, () => {
        console.log(`Server running at http://${config.host}:${config.port}`);
        console.log(`Environment: ${config.nodeEnv}`);
    });
    const shutdown = async () => {
        console.log("\nShutting down...");
        server.close();
        await app.shutdown();
        process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}
function readBody(req) {
    return new Promise((resolve) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => {
            const raw = Buffer.concat(chunks).toString();
            if (!raw) {
                resolve(undefined);
                return;
            }
            try {
                resolve(JSON.parse(raw));
            }
            catch {
                resolve(undefined);
            }
        });
    });
}
bootstrap().catch((error) => {
    console.error("Failed to start application:", error);
    process.exit(1);
});
//# sourceMappingURL=main.js.map