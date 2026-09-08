/**
 * Health module.
 *
 * Provides the /health endpoint.
 */
import { BaseModule } from "@zudojs/core";
import { HealthController } from "./health.controller.js";
export declare class HealthModule extends BaseModule {
    readonly id = "health";
    readonly name = "Health Module";
    readonly version = "0.1.0";
    private controller;
    constructor();
    initialize(): void;
    getController(): HealthController;
}
//# sourceMappingURL=health.module.d.ts.map