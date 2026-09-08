/**
 * Application root module.
 *
 * Imports and composes feature modules.
 */
import { BaseModule } from "@zudojs/core";
export declare class AppModule extends BaseModule {
    readonly id = "app";
    readonly name = "App Module";
    readonly version = "0.1.0";
    readonly dependencies: string[];
    private usersModule;
    private healthModule;
    constructor();
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    getUsersController(): import("../users/users.controller.js").UsersController;
    getHealthController(): import("../health/health.controller.js").HealthController;
}
//# sourceMappingURL=app.module.d.ts.map