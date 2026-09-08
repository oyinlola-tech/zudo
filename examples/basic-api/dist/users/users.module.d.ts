/**
 * Users module.
 *
 * Registers the UsersService and UsersController.
 */
import { BaseModule } from "@zudojs/core";
import { UsersService } from "./users.service.js";
import { UsersController } from "./users.controller.js";
export declare class UsersModule extends BaseModule {
    readonly id = "users";
    readonly name = "Users Module";
    readonly version = "0.1.0";
    private service;
    private controller;
    constructor();
    initialize(): void;
    getController(): UsersController;
    getService(): UsersService;
}
//# sourceMappingURL=users.module.d.ts.map