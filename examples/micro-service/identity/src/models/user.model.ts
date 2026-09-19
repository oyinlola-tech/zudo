import type { UserId } from "../types/index.js";
import type { UserRole } from "../enums/index.js";

/**
 * User model representing a persisted user record.
 */
export interface UserModel {
  readonly id: UserId;
  readonly email: string;
  readonly passwordHash: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly role: UserRole;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
