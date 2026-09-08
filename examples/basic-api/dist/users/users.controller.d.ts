/**
 * Users HTTP handler.
 *
 * Handles incoming HTTP requests for the /users route.
 * Delegates business logic to UsersService.
 */
import type { UsersService } from "./users.service.js";
type HttpRequest = {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: unknown;
    params: Record<string, string>;
    query: Record<string, string>;
    id: string;
};
export declare class UsersController {
    private readonly service;
    constructor(service: UsersService);
    handleRequest(request: HttpRequest): Promise<{
        status: number;
        body: unknown;
    }>;
    private findAll;
    private findOne;
    private create;
    private remove;
}
export {};
//# sourceMappingURL=users.controller.d.ts.map