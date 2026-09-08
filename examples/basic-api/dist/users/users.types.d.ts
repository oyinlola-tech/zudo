/**
 * User domain types.
 */
export interface User {
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly createdAt: string;
}
export interface CreateUserInput {
    readonly name: string;
    readonly email: string;
}
//# sourceMappingURL=users.types.d.ts.map