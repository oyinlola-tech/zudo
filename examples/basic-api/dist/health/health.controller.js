/**
 * Health HTTP handler.
 *
 * Returns application health status.
 */
export class HealthController {
    async handleRequest(_request) {
        return {
            status: 200,
            body: {
                status: "ok",
                timestamp: new Date().toISOString(),
            },
        };
    }
}
//# sourceMappingURL=health.controller.js.map