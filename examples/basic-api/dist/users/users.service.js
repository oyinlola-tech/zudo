/**
 * Users service.
 *
 * Contains business logic for user management.
 * Controllers should delegate to this service rather than
 * implementing business logic directly.
 */
export class UsersService {
    users = new Map();
    findAll() {
        return [...this.users.values()];
    }
    findById(id) {
        return this.users.get(id);
    }
    create(input) {
        const user = {
            id: crypto.randomUUID(),
            name: input.name,
            email: input.email,
            createdAt: new Date().toISOString(),
        };
        this.users.set(user.id, user);
        return user;
    }
    delete(id) {
        return this.users.delete(id);
    }
}
//# sourceMappingURL=users.service.js.map