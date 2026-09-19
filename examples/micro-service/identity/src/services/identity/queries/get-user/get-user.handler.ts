import { QueryHandler } from "@zudojs/cqrs";
import type { CqrsContext } from "@zudojs/cqrs";
import type { GetUserQuery } from "./get-user.query.js";
import type { UserRepository } from "../../../../repositories/index.js";
import type { UserModel } from "../../../../models/user.model.js";
import { NotFoundError } from "../../../../errors/index.js";

/**
 * Public user response (without password hash).
 */
export interface GetUserResult {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly role: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Handles the GetUserQuery.
 * Looks up a user by ID and returns the public profile.
 */
export class GetUserHandler extends QueryHandler<GetUserQuery, GetUserResult> {
  public static readonly TYPE = "GetUser" as const;
  public readonly queryType = GetUserHandler.TYPE;

  private readonly userRepository: UserRepository;

  constructor(userRepository: UserRepository) {
    super();
    this.userRepository = userRepository;
  }

  public execute(query: GetUserQuery, _context?: CqrsContext): GetUserResult {
    const user = this.userRepository.findById(
      query.userId as Parameters<UserRepository["findById"]>[0],
    );

    if (!user) {
      throw new NotFoundError(`User with ID "${query.userId}" was not found.`);
    }

    return this.toPublicUser(user);
  }

  private toPublicUser(user: UserModel): GetUserResult {
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
