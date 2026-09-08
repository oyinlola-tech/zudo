/**
 * Users HTTP handler.
 *
 * Handles incoming HTTP requests for the /users route.
 * Delegates business logic to UsersService.
 */
import { CreateUserSchema } from "./users.schema.js";
import { validate } from "@zudojs/validation";
export class UsersController {
    service;
    constructor(service) {
        this.service = service;
    }
    async handleRequest(request) {
        const method = request.method;
        const path = request.url;
        if (method === "GET" && path === "/users") {
            return this.findAll();
        }
        if (method === "GET" && path.startsWith("/users/")) {
            const id = path.split("/users/")[1];
            return this.findOne(id);
        }
        if (method === "POST" && path === "/users") {
            return this.create(request);
        }
        if (method === "DELETE" && path.startsWith("/users/")) {
            const id = path.split("/users/")[1];
            return this.remove(id);
        }
        return { status: 404, body: { error: "Not found" } };
    }
    findAll() {
        const users = this.service.findAll();
        return { status: 200, body: users };
    }
    findOne(id) {
        if (!id) {
            return { status: 400, body: { error: "Missing user id" } };
        }
        const user = this.service.findById(id);
        if (!user) {
            return { status: 404, body: { error: "User not found" } };
        }
        return { status: 200, body: user };
    }
    create(request) {
        const body = request.body;
        if (!body || typeof body !== "object") {
            return { status: 400, body: { error: "Request body is required" } };
        }
        const result = validate(CreateUserSchema, body);
        if (!result.success) {
            return {
                status: 400,
                body: { error: "Validation failed", issues: result.issues },
            };
        }
        const user = this.service.create(result.data);
        return { status: 201, body: user };
    }
    remove(id) {
        if (!id) {
            return { status: 400, body: { error: "Missing user id" } };
        }
        const deleted = this.service.delete(id);
        if (!deleted) {
            return { status: 404, body: { error: "User not found" } };
        }
        return { status: 204, body: undefined };
    }
}
//# sourceMappingURL=users.controller.js.map