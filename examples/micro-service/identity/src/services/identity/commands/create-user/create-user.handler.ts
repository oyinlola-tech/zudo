import { CommandHandler } from "@zudojs/cqrs";
import type { CqrsContext } from "@zudojs/cqrs";
import type { CreateUserCommand } from "./create-user.command.js";
import type { UserRepository } from "../../../../repositories/index.js";
import type { UserId } from "../../../../types/index.js";
import { createUserId } from "../../../../types/index.js";
import { generateId, hashPassword } from "../../../../utils/index.js";
import { UserRole } from "../../../../enums/index.js";
import { ConflictError } from "../../../../errors/index.js";
import type { EventBus } from "@zudojs/events";
import { UserCreatedEvent } from "../../../../events/index.js";

/**
 * Result returned after creating a user.
 */
export interface CreateUserResult {
  readonly userId: UserId;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly role: UserRole;
  readonly createdAt: Date;
}

/**
 * Handles the CreateUserCommand.
 * Validates uniqueness, hashes password, persists user, and emits an event.
 */
export class CreateUserHandler extends CommandHandler<
  CreateUserCommand,
  CreateUserResult
> {
  public static readonly TYPE = "CreateUser" as const;
  public readonly commandType = CreateUserHandler.TYPE;

  private readonly userRepository: UserRepository;
  private readonly eventBus: EventBus;

  constructor(userRepository: UserRepository, eventBus: EventBus) {
    super();
    this.userRepository = userRepository;
    this.eventBus = eventBus;
  }

  public async execute(
    command: CreateUserCommand,
    _context?: CqrsContext,
  ): Promise<CreateUserResult> {
    const existing = this.userRepository.findByEmail(command.email);

    if (existing) {
      throw new ConflictError(
        `A user with email "${command.email}" already exists.`,
        {
          metadata: { email: command.email },
        },
      );
    }

    const id = createUserId(generateId());
    const passwordHash = await hashPassword(command.password);
    const now = new Date();

    const user = this.userRepository.create({
      id,
      email: command.email,
      passwordHash,
      firstName: command.firstName,
      lastName: command.lastName,
      role: command.role as UserRole,
      createdAt: now,
      updatedAt: now,
    });

    this.eventBus.publish(
      UserCreatedEvent.create({
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      }),
    );

    return {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      createdAt: user.createdAt,
    };
  }
}
