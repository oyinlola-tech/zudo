import { createServer } from "node:http";
import { assessmentConfig } from "./config/app.config.js";
import { createApp } from "./app.js";

async function main() {
  const handler = await createApp();

  const server = createServer(async (req, res) => {
    const url = `http://${req.headers.host ?? "localhost"}${req.url}`;
    const method = req.method ?? "GET";

    let body: string | undefined;
    if (method !== "GET" && method !== "HEAD") {
      body = await new Promise<string>((resolve) => {
        let data = "";
        req.on("data", (chunk) => {
          data += chunk;
        });
        req.on("end", () => resolve(data));
      });
    }

    const request = new Request(url, {
      method,
      headers: req.headers as Record<string, string>,
      body: body ?? undefined,
    });

    const response = await handler(request);

    res.writeHead(
      response.status,
      Object.fromEntries(response.headers.entries()),
    );
    const responseBody = await response.text();
    res.end(responseBody);
  });

  server.listen(assessmentConfig.port, assessmentConfig.host, () => {
    console.log(
      `[${assessmentConfig.serviceName}] listening on http://${assessmentConfig.host}:${assessmentConfig.port}`,
    );
  });
}

main().catch((error) => {
  console.error("Failed to start assessment service:", error);
  process.exit(1);
});
