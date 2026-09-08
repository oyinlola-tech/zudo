/**
 * Users module.
 *
 * Registers the UsersService and UsersController.
 */
import { BaseModule } from "@zudojs/core";
import { UsersService } from "./users.service.js";
import { UsersController } from "./users.controller.js";
export class UsersModule extends BaseModule {
    id = "users";
    name = "Users Module";
    version = "0.1.0";
    service;
    controller;
    constructor() {
        super({ version: "0.1.0" });
    }
    initialize() {
        this.service = new UsersService();
        this.controller = new UsersController(this.service);
    }
    getController() {
        if (!this.controller) {
            throw new Error("UsersModule has not been initialized.");
        }
        return this.controller;
    }
    getService() {
        if (!this.service) {
            throw new Error("UsersModule has not been initialized.");
        }
        return this.service;
    }
}
//# sourceMappingURL=users.module.js.map