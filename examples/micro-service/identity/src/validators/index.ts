import { z } from "zod";
import { UserRole } from "../enums/index.js";

/**
 * Schema for creating a new user.
 */
export const CreateUserSchema = z.object({
  email: z.string().email("Invalid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  firstName: z.string().min(1, "First name is required.").max(100),
  lastName: z.string().min(1, "Last name is required.").max(100),
  role: z.nativeEnum(UserRole).default(UserRole.STUDENT),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;

/**
 * Schema for authenticating a user.
 */
export const AuthenticateUserSchema = z.object({
  email: z.string().email("Invalid email address."),
  password: z.string().min(1, "Password is required."),
});

export type AuthenticateUserInput = z.infer<typeof AuthenticateUserSchema>;

/**
 * Schema for updating a user profile.
 */
export const UpdateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  role: z.nativeEnum(UserRole).optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
