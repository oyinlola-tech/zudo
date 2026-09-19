import { Query } from "@zudojs/cqrs";

/**
 * Query to retrieve a user profile by email.
 */
export class GetUserProfileQuery extends Query<"GetUserProfile"> {
  public static readonly TYPE = "GetUserProfile" as const;

  public readonly email: string;

  constructor(params: { readonly email: string }) {
    super(GetUserProfileQuery.TYPE);
    this.email = params.email;
  }
}
