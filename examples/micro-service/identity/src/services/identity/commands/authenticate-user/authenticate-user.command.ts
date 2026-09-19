import { Command } from "@zudojs/cqrs";

/**
 * Command to authenticate a user with email and password.
 */
export class AuthenticateUserCommand extends Command<"AuthenticateUser"> {
  public static readonly TYPE = "AuthenticateUser" as const;

  public readonly email: string;
  public readonly password: string;

  constructor(params: { readonly email: string; readonly password: string }) {
    super(AuthenticateUserCommand.TYPE);
    this.email = params.email;
    this.password = params.password;
  }
}
