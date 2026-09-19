import { Command } from "@zudojs/cqrs";

/**
 * Command to create a new user.
 */
export class CreateUserCommand extends Command<"CreateUser"> {
  public static readonly TYPE = "CreateUser" as const;

  public readonly email: string;
  public readonly password: string;
  public readonly firstName: string;
  public readonly lastName: string;
  public readonly role: string;

  constructor(params: {
    readonly email: string;
    readonly password: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly role: string;
  }) {
    super(CreateUserCommand.TYPE);
    this.email = params.email;
    this.password = params.password;
    this.firstName = params.firstName;
    this.lastName = params.lastName;
    this.role = params.role;
  }
}
