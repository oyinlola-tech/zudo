/**
 * Application root module.
 *
 * Imports and composes feature modules.
 */
import { BaseModule } from "@zudojs/core";
import { UsersModule } from "../users/users.module.js";
import { HealthModule } from "../health/health.module.js";
export class AppModule extends BaseModule {
    id = "app";
    name = "App Module";
    version = "0.1.0";
    dependencies = ["users", "health"];
    usersModule;
    healthModule;
    constructor() {
        super({ version: "0.1.0", dependencies: ["users", "health"] });
    }
    async initialize() {
        this.usersModule = new UsersModule();
        this.healthModule = new HealthModule();
        this.usersModule.initialize();
        this.healthModule.initialize();
    }
    async shutdown() {
        // Cleanup resources if needed.
    }
    getUsersController() {
        if (!this.usersModule) {
            throw new Error("AppModule has not been initialized.");
        }
        return this.usersModule.getController();
    }
    getHealthController() {
        if (!this.healthModule) {
            throw new Error("AppModule has not been initialized.");
        }
        return this.healthModule.getController();
    }
}
//# sourceMappingURL=app.module.js.map