import { Query } from "@zudojs/cqrs";

/**
 * Query to retrieve a user by their ID.
 */
export class GetUserQuery extends Query<"GetUser"> {
  public static readonly TYPE = "GetUser" as const;

  public readonly userId: string;

  constructor(params: { readonly userId: string }) {
    super(GetUserQuery.TYPE);
    this.userId = params.userId;
  }
}
