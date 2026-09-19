import type { CommandBus } from "@zudojs/cqrs";
import type { QueryBus } from "@zudojs/cqrs";
import type { EventBus } from "@zudojs/events";
import type { UserRepository } from "../../repositories/index.js";
import { CreateUserHandler } from "./commands/create-user/create-user.handler.js";
import { AuthenticateUserHandler } from "./commands/authenticate-user/authenticate-user.handler.js";
import { GetUserHandler } from "./queries/get-user/get-user.handler.js";
import { GetUserProfileHandler } from "./queries/get-user-profile/get-user-profile.handler.js";
import { CreateUserCommand } from "./commands/create-user/create-user.command.js";
import { AuthenticateUserCommand } from "./commands/authenticate-user/authenticate-user.command.js";
import { GetUserQuery } from "./queries/get-user/get-user.query.js";
import { GetUserProfileQuery } from "./queries/get-user-profile/get-user-profile.query.js";

/**
 * Registers all identity CQRS handlers onto the provided buses.
 */
export function registerIdentityService(params: {
  readonly commandBus: CommandBus;
  readonly queryBus: QueryBus;
  readonly eventBus: EventBus;
  readonly userRepository: UserRepository;
  readonly jwtSecret: string;
  readonly jwtExpiresIn: string;
}): void {
  const {
    commandBus,
    queryBus,
    eventBus,
    userRepository,
    jwtSecret,
    jwtExpiresIn,
  } = params;

  const createUserHandler = new CreateUserHandler(userRepository, eventBus);
  const authenticateUserHandler = new AuthenticateUserHandler(
    userRepository,
    eventBus,
    jwtSecret,
    jwtExpiresIn,
  );
  const getUserHandler = new GetUserHandler(userRepository);
  const getUserProfileHandler = new GetUserProfileHandler(userRepository);

  commandBus.register(CreateUserCommand.TYPE, createUserHandler);
  commandBus.register(AuthenticateUserCommand.TYPE, authenticateUserHandler);

  queryBus.register(GetUserQuery.TYPE, getUserHandler);
  queryBus.register(GetUserProfileQuery.TYPE, getUserProfileHandler);
}
