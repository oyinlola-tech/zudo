import { QueryHandler } from "@zudojs/cqrs";
import type { CqrsContext } from "@zudojs/cqrs";
import type { GetUserProfileQuery } from "./get-user-profile.query.js";
import type { UserRepository } from "../../../../repositories/index.js";
import type { UserModel } from "../../../../models/user.model.js";
import { NotFoundError } from "../../../../errors/index.js";

/**
 * Public user profile response (without password hash).
 */
export interface GetUserProfileResult {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly role: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Handles the GetUserProfileQuery.
 * Looks up a user by email and returns the public profile.
 */
export class GetUserProfileHandler extends QueryHandler<
  GetUserProfileQuery,
  GetUserProfileResult
> {
  public static readonly TYPE = "GetUserProfile" as const;
  public readonly queryType = GetUserProfileHandler.TYPE;

  private readonly userRepository: UserRepository;

  constructor(userRepository: UserRepository) {
    super();
    this.userRepository = userRepository;
  }

  public execute(
    query: GetUserProfileQuery,
    _context?: CqrsContext,
  ): GetUserProfileResult {
    const user = this.userRepository.findByEmail(query.email);

    if (!user) {
      throw new NotFoundError(
        `User with email "${query.email}" was not found.`,
      );
    }

    return this.toPublicProfile(user);
  }

  private toPublicProfile(user: UserModel): GetUserProfileResult {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
