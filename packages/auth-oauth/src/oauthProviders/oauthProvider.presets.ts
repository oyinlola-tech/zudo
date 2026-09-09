/**
 * Endpoint presets and profile normalisation for the supported providers.
 *
 * @module oauthProviders/oauthProvider
 *
 * A preset only supplies defaults. Anything set on the `OAuthConfig` wins, so
 * a tenanted Microsoft install or a self-hosted GitLab can override the URLs
 * without leaving the `custom` provider behind.
 */

import type {
  ClientAuthMethod,
  OAuthProvider,
  OAuthUserInfo,
} from "../oauthTypes/index.js";

/** Everything the client needs to know about one provider. */
export interface OAuthProviderPreset {
  /** Default authorization endpoint. */
  readonly authorizeUrl?: string;
  /** Default token endpoint. */
  readonly tokenUrl?: string;
  /**
   * Default user-info endpoint. Absent for providers that have none — Apple
   * returns the profile in the `id_token` on the first authorization only.
   */
  readonly userInfoUrl?: string;
  /** Scopes requested when the caller does not specify any. */
  readonly defaultScopes: readonly string[];
  /** How this provider expects the client to authenticate at the token endpoint. */
  readonly clientAuth: ClientAuthMethod;
  /**
   * Whether the provider issues refresh tokens on the standard flow.
   *
   * `false` for GitHub: classic OAuth App tokens do not expire and no refresh
   * token is issued. (GitHub Apps with expiring tokens do — override the
   * endpoints via `custom` if that is your setup.)
   */
  readonly supportsRefresh: boolean;
  /** Extra parameters appended to every authorization request. */
  readonly authorizeParams?: Readonly<Record<string, string>>;
  /** Extra headers sent to the user-info endpoint. */
  readonly userInfoHeaders?: Readonly<Record<string, string>>;
}

/** Read a string field from a sanitized provider payload. */
function str(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/** Read a boolean field from a sanitized provider payload. */
function bool(payload: Record<string, unknown>, key: string): boolean | undefined {
  const value = payload[key];
  return typeof value === "boolean" ? value : undefined;
}

/** Assemble an {@link OAuthUserInfo} without emitting `undefined` fields. */
function profile(
  providerId: string,
  fields: {
    readonly email?: string;
    readonly emailVerified?: boolean;
    readonly name?: string;
    readonly avatarUrl?: string;
  },
  raw: Record<string, unknown>,
): OAuthUserInfo {
  return {
    providerId,
    ...(fields.email !== undefined ? { email: fields.email } : {}),
    ...(fields.emailVerified !== undefined
      ? { emailVerified: fields.emailVerified }
      : {}),
    ...(fields.name !== undefined ? { name: fields.name } : {}),
    ...(fields.avatarUrl !== undefined ? { avatarUrl: fields.avatarUrl } : {}),
    raw,
  };
}

/** Endpoint presets, keyed by provider. */
export const PROVIDER_PRESETS: Readonly<
  Record<OAuthProvider, OAuthProviderPreset>
> = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    defaultScopes: ["openid", "email", "profile"],
    clientAuth: "body",
    supportsRefresh: true,
    // Google only returns a refresh token when both are set.
    authorizeParams: { access_type: "offline", prompt: "consent" },
  },
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    defaultScopes: ["read:user", "user:email"],
    clientAuth: "body",
    supportsRefresh: false,
    userInfoHeaders: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  },
  microsoft: {
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    userInfoUrl: "https://graph.microsoft.com/v1.0/me",
    defaultScopes: ["openid", "email", "profile", "offline_access", "User.Read"],
    clientAuth: "body",
    supportsRefresh: true,
  },
  apple: {
    authorizeUrl: "https://appleid.apple.com/auth/authorize",
    tokenUrl: "https://appleid.apple.com/auth/token",
    // Apple has no user-info endpoint; the profile arrives in the id_token.
    defaultScopes: ["name", "email"],
    clientAuth: "body",
    supportsRefresh: true,
    // Apple requires form_post when name/email scopes are requested.
    authorizeParams: { response_mode: "form_post" },
  },
  discord: {
    authorizeUrl: "https://discord.com/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    userInfoUrl: "https://discord.com/api/v10/users/@me",
    defaultScopes: ["identify", "email"],
    clientAuth: "basic",
    supportsRefresh: true,
  },
  custom: {
    defaultScopes: [],
    clientAuth: "body",
    supportsRefresh: true,
  },
};

/**
 * Normalise a provider's user-info payload into {@link OAuthUserInfo}.
 *
 * No field is invented. Where a provider does not return an email — GitHub
 * with a private address, Discord without the `email` scope — the result
 * simply has no `email`, and the caller decides what to do about it.
 *
 * @param provider - Which provider produced the payload.
 * @param payload - The sanitized JSON object from the user-info endpoint.
 * @returns The normalised profile, or `undefined` if no stable id was found.
 */
export function normalizeUserInfo(
  provider: OAuthProvider,
  payload: Record<string, unknown>,
): OAuthUserInfo | undefined {
  switch (provider) {
    case "google": {
      const id = str(payload, "sub");
      if (id === undefined) return undefined;
      return profile(
        id,
        {
          ...(str(payload, "email") !== undefined
            ? { email: str(payload, "email") }
            : {}),
          ...(bool(payload, "email_verified") !== undefined
            ? { emailVerified: bool(payload, "email_verified") }
            : {}),
          ...(str(payload, "name") !== undefined
            ? { name: str(payload, "name") }
            : {}),
          ...(str(payload, "picture") !== undefined
            ? { avatarUrl: str(payload, "picture") }
            : {}),
        },
        payload,
      );
    }
    case "github": {
      const id = str(payload, "id");
      if (id === undefined) return undefined;
      const email = str(payload, "email");
      const name = str(payload, "name") ?? str(payload, "login");
      return profile(
        id,
        {
          ...(email !== undefined ? { email } : {}),
          ...(name !== undefined ? { name } : {}),
          ...(str(payload, "avatar_url") !== undefined
            ? { avatarUrl: str(payload, "avatar_url") }
            : {}),
        },
        payload,
      );
    }
    case "microsoft": {
      const id = str(payload, "id") ?? str(payload, "sub");
      if (id === undefined) return undefined;
      const email = str(payload, "mail") ?? str(payload, "userPrincipalName");
      const name = str(payload, "displayName") ?? str(payload, "name");
      return profile(
        id,
        {
          ...(email !== undefined ? { email } : {}),
          ...(name !== undefined ? { name } : {}),
        },
        payload,
      );
    }
    case "discord": {
      const id = str(payload, "id");
      if (id === undefined) return undefined;
      const email = str(payload, "email");
      const verified = bool(payload, "verified");
      const name =
        str(payload, "global_name") ?? str(payload, "username");
      const avatarHash = str(payload, "avatar");
      const avatarUrl =
        avatarHash === undefined
          ? undefined
          : `https://cdn.discordapp.com/avatars/${encodeURIComponent(id)}/${encodeURIComponent(avatarHash)}.png`;
      return profile(
        id,
        {
          ...(email !== undefined ? { email } : {}),
          ...(email !== undefined && verified !== undefined
            ? { emailVerified: verified }
            : {}),
          ...(name !== undefined ? { name } : {}),
          ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        },
        payload,
      );
    }
    case "apple":
    case "custom": {
      const id = str(payload, "sub") ?? str(payload, "id");
      if (id === undefined) return undefined;
      const name = str(payload, "name") ?? str(payload, "displayName");
      const avatarUrl =
        str(payload, "picture") ?? str(payload, "avatar_url");
      return profile(
        id,
        {
          ...(str(payload, "email") !== undefined
            ? { email: str(payload, "email") }
            : {}),
          ...(bool(payload, "email_verified") !== undefined
            ? { emailVerified: bool(payload, "email_verified") }
            : {}),
          ...(name !== undefined ? { name } : {}),
          ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        },
        payload,
      );
    }
  }
}
