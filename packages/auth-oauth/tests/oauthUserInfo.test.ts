import { describe, expect, it } from "vitest";

import {
  fetchUserInfo,
  normalizeUserInfo,
  OAuthConfigurationError,
  OAuthResponseError,
} from "../src/index.js";
import { headerOf, makeConfig, stubFetch, stubFetchSequence } from "./helpers.js";

describe("fetchUserInfo", () => {
  it("sends the access token as a bearer header, never in the URL", async () => {
    const { fetch, calls } = stubFetch(
      JSON.stringify({ sub: "g-1", email: "a@example.com", name: "A", picture: "https://img/1" }),
    );
    const info = await fetchUserInfo(makeConfig({ fetch }), "at-123");
    expect(calls[0]?.url).toBe("https://openidconnect.googleapis.com/v1/userinfo");
    expect(calls[0]?.url).not.toContain("at-123");
    expect(headerOf(calls[0], "Authorization")).toBe("Bearer at-123");
    expect(info).toMatchObject({
      providerId: "g-1",
      email: "a@example.com",
      name: "A",
      avatarUrl: "https://img/1",
    });
  });

  it("normalises each provider's payload", () => {
    expect(
      normalizeUserInfo("google", {
        sub: "1",
        email: "g@example.com",
        email_verified: true,
        name: "G",
        picture: "p",
      }),
    ).toMatchObject({ providerId: "1", email: "g@example.com", emailVerified: true });

    expect(
      normalizeUserInfo("github", { id: 42, login: "octocat", avatar_url: "a", email: null }),
    ).toMatchObject({ providerId: "42", name: "octocat", avatarUrl: "a" });

    expect(
      normalizeUserInfo("microsoft", { id: "m1", userPrincipalName: "m@x.com", displayName: "M" }),
    ).toMatchObject({ providerId: "m1", email: "m@x.com", name: "M" });

    expect(
      normalizeUserInfo("discord", { id: "d1", username: "u", global_name: "G", avatar: "hash" }),
    ).toMatchObject({
      providerId: "d1",
      name: "G",
      avatarUrl: "https://cdn.discordapp.com/avatars/d1/hash.png",
    });
  });

  it("returns no email rather than inventing one", () => {
    const github = normalizeUserInfo("github", { id: 42, login: "octocat" });
    expect(github?.email).toBeUndefined();
    const discord = normalizeUserInfo("discord", { id: "d1", username: "u" });
    expect(discord?.email).toBeUndefined();
  });

  it("falls back to GitHub /user/emails when user:email was granted", async () => {
    const { fetch, calls } = stubFetchSequence([
      { body: JSON.stringify({ id: 42, login: "octocat" }) },
      {
        body: JSON.stringify([
          { email: "secondary@example.com", primary: false, verified: true },
          { email: "primary@example.com", primary: true, verified: true },
        ]),
      },
    ]);
    const info = await fetchUserInfo(
      makeConfig({ provider: "github", fetch }),
      "gho_token",
    );
    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toBe("https://api.github.com/user/emails");
    expect(info.email).toBe("primary@example.com");
    expect(info.emailVerified).toBe(true);
  });

  it("does not query /user/emails without the scope, and reports no email", async () => {
    const { fetch, calls } = stubFetch(JSON.stringify({ id: 42, login: "octocat" }));
    const info = await fetchUserInfo(
      makeConfig({ provider: "github", fetch, scopes: ["read:user"] }),
      "gho_token",
    );
    expect(calls).toHaveLength(1);
    expect(info.email).toBeUndefined();
  });

  it("keeps no email when /user/emails has no verified primary address", async () => {
    const { fetch } = stubFetchSequence([
      { body: JSON.stringify({ id: 42, login: "octocat" }) },
      { body: JSON.stringify([{ email: "u@example.com", primary: true, verified: false }]) },
    ]);
    const info = await fetchUserInfo(makeConfig({ provider: "github", fetch }), "gho");
    expect(info.email).toBeUndefined();
  });

  it("says plainly that Apple has no user-info endpoint", async () => {
    const { fetch, calls } = stubFetch("{}");
    await expect(
      fetchUserInfo(makeConfig({ provider: "apple", fetch }), "at"),
    ).rejects.toThrow(OAuthConfigurationError);
    expect(calls).toHaveLength(0);
  });

  it("rejects a payload with no stable identifier", async () => {
    const { fetch } = stubFetch(JSON.stringify({ email: "a@example.com" }));
    await expect(fetchUserInfo(makeConfig({ fetch }), "at")).rejects.toThrow(
      OAuthResponseError,
    );
  });

  it("requires an access token", async () => {
    const { fetch, calls } = stubFetch("{}");
    await expect(fetchUserInfo(makeConfig({ fetch }), "  ")).rejects.toThrow(
      OAuthResponseError,
    );
    expect(calls).toHaveLength(0);
  });

  it("strips prototype-polluting keys from the profile payload", async () => {
    const { fetch } = stubFetch('{"sub":"1","__proto__":{"polluted":"yes"}}');
    const info = await fetchUserInfo(makeConfig({ fetch }), "at");
    expect(Object.prototype.hasOwnProperty.call(info.raw ?? {}, "__proto__")).toBe(false);
    const probe: Record<string, unknown> = {};
    expect(probe["polluted"]).toBeUndefined();
  });

  it("applies the size cap to the user-info endpoint too", async () => {
    const { fetch } = stubFetch(JSON.stringify({ sub: "1", bio: "x".repeat(4096) }));
    await expect(
      fetchUserInfo(makeConfig({ fetch, maxResponseBytes: 1024 }), "at"),
    ).rejects.toThrow();
  });
});
