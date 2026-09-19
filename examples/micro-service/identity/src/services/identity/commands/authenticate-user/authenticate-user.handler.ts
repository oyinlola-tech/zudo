import { CommandHandler } from "@zudojs/cqrs";
import type { CqrsContext } from "@zudojs/cqrs";
import jwt from "jsonwebtoken";
import type { AuthenticateUserCommand } from "./authenticate-user.command.js";
import type { UserRepository } from "../../../../repositories/index.js";
import { comparePassword } from "../../../../utils/index.js";
import { UnauthorizedError } from "../../../../errors/index.js";
import type { EventBus } from "@zudojs/events";
import { UserAuthenticatedEvent } from "../../../../events/index.js";

/**
 * Result returned after successful authentication.
 */
export interface AuthenticateUserResult {
  readonly token: string;
  readonly userId: string;
  readonly email: string;
  readonly role: string;
}

/**
 * Handles the AuthenticateUserCommand.
 * Validates credentials and returns a signed JWT token.
 */
export class AuthenticateUserHandler extends CommandHandler<
  AuthenticateUserCommand,
  AuthenticateUserResult
> {
  public static readonly TYPE = "AuthenticateUser" as const;
  public readonly commandType = AuthenticateUserHandler.TYPE;

  private readonly userRepository: UserRepository;
  private readonly eventBus: EventBus;
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;

  constructor(
    userRepository: UserRepository,
    eventBus: EventBus,
    jwtSecret: string,
    jwtExpiresIn: string,
  ) {
    super();
    this.userRepository = userRepository;
    this.eventBus = eventBus;
    this.jwtSecret = jwtSecret;
    this.jwtExpiresIn = jwtExpiresIn;
  }

  public async execute(
    command: AuthenticateUserCommand,
    _context?: CqrsContext,
  ): Promise<AuthenticateUserResult> {
    const user = this.userRepository.findByEmail(command.email);

    if (!user) {
      throw new UnauthorizedError("Invalid email or password.");
    }

    const passwordValid = await comparePassword(
      command.password,
      user.passwordHash,
    );

    if (!passwordValid) {
      throw new UnauthorizedError("Invalid email or password.");
    }

    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      this.jwtSecret,
      { algorithm: "HS256", expiresIn: this.jwtExpiresIn } as jwt.SignOptions,
    );

    this.eventBus.publish(
      UserAuthenticatedEvent.create({
        userId: user.id,
        email: user.email,
      }),
    );

    return {
      token,
      userId: user.id,
      email: user.email,
      role: user.role,
    };
  }
}
