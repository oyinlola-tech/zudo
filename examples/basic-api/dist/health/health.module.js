/**
 * Health module.
 *
 * Provides the /health endpoint.
 */
import { BaseModule } from "@zudojs/core";
import { HealthController } from "./health.controller.js";
export class HealthModule extends BaseModule {
    id = "health";
    name = "Health Module";
    version = "0.1.0";
    controller;
    constructor() {
        super({ version: "0.1.0" });
    }
    initialize() {
        this.controller = new HealthController();
    }
    getController() {
        if (!this.controller) {
            throw new Error("HealthModule has not been initialized.");
        }
        return this.controller;
    }
}
//# sourceMappingURL=health.module.js.map