/**
 * Users service.
 *
 * Contains business logic for user management.
 * Controllers should delegate to this service rather than
 * implementing business logic directly.
 */
import type { User, CreateUserInput } from "./users.types.js";
export declare class UsersService {
    private readonly users;
    findAll(): readonly User[];
    findById(id: string): User | undefined;
    create(input: CreateUserInput): User;
    delete(id: string): boolean;
}
//# sourceMappingURL=users.service.d.ts.map