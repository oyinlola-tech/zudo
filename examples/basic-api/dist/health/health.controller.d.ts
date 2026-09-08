/**
 * Health HTTP handler.
 *
 * Returns application health status.
 */
export declare class HealthController {
    handleRequest(_request: {
        method: string;
        url: string;
        headers: Record<string, string>;
        body: unknown;
        params: Record<string, string>;
        query: Record<string, string>;
        id: string;
    }): Promise<{
        status: number;
        body: unknown;
    }>;
}
//# sourceMappingURL=health.controller.d.ts.map