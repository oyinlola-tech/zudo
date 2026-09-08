---
"@zudojs/tenancy": minor
---

Stop tenant resolution failing open, and make the HTTP adapter usable.

These are behavioural changes to a security boundary. Requests that previously
resolved to a tenant may now be refused.

**A resolver that rejects a credential aborts the chain.** Every resolver ran
inside `try { … } catch { /* skip */ }`. For a resolver that found nothing,
skipping is right; for the JWT resolver, a throw means the signature failed to
verify or the token expired — and the chain went on to the next resolver, which
is the client-controlled `x-tenant-id` header. A forged JWT therefore let the
caller name any tenant, labelled `trust: "verified"` with `conflict: false`. A
throw from any resolver now raises `TenantResolutionError`; returning
`undefined` remains the way to say "found nothing".

**Conflicts throw by default.** Two resolvers naming different tenants is the
signature of an attempted cross-tenant request; it was resolved silently in
favour of the highest priority. `throwOnConflict` now defaults to true. The
chain also stops at the first match unless `detectConflicts` is set, which is
what that previously-unread option now does.

**The HTTP middleware can drive the shipped resolvers.** It passed the raw
`HttpMiddlewareContext` to `resolver.resolve()`, while every resolver in the
package expects a narrow accessor object — so it type-checked (the context
parameter defaulted to `unknown`) and threw `context.getHeader is not a
function` on the first request. The middleware now builds that accessor.
`ResolveTenantMiddlewareOptions.resolver` is typed
`TenantResolver<HttpResolverContext>`, so a mismatch is a compile error. Token
claims are read from `tenancy:claims` in middleware state, or from a
`getClaims` option.

**Trust is enforced, and the header is untrusted by default.**
`assertTrustLevel` existed and was called by nothing. The resolve middleware
now takes `minimumTrust` and refuses a resolution below it. `x-tenant-id` is
graded `untrusted` rather than `verified`, because the value is client-supplied
unless a trusted proxy overwrites it — pass
`createHeaderResolver({ trust: "verified" })` where the edge guarantees that.

**Non-active tenants are refused during resolution,** rather than only by a
separate guard middleware someone had to remember to install. Pass
`allowInactive: true` on routes that exist to serve suspended tenants.
`createContextManager` applies the same rule to background jobs, which is where
no HTTP guard runs at all.

**`createTenantId` validates.** It previously rejected only empty and
whitespace, so a header could produce a tenant id containing `:`, `/` or `..`.
Ids are now normalized (NFKC, trimmed, lowercased) and constrained to
`^[a-z0-9][a-z0-9_-]*$` with a 64-character cap, throwing `InvalidTenantIdError`
rather than a bare `Error`. `tryCreateTenantId` and `isValidTenantId` are the
non-throwing forms, and resolvers use them so an unusable candidate means
"found nothing". `tenantKey` escapes its segments, so a key of `"cache:k"` can
no longer collide with another tenant's namespace.

**The memory repository indexes domains and drops stale entries.**
`findByDomain` could never return a tenant: nothing populated the index.
`add(tenant, domains)` now registers them, and re-adding a tenant re-indexes it,
so a changed slug no longer leaves the pre-update record — including its
pre-suspension status — reachable under the old one.

**Subdomain resolution is case-insensitive,** refuses multi-label subdomains
unless `allowMultiLabel` is set, and parses the authority rather than splitting
on `":"`, which mangled bracketed IPv6 hosts.

**Other corrections.** `assertTrustLevel` raises a new `TenantTrustLevelError`
carrying the source and both levels in metadata, instead of formatting a
sentence into `TenantAccessDeniedError`'s tenant-id field. The tenant cache
takes a `cacheTtlMs` (30s default), bounding how long a suspended tenant keeps
being served. Both 404 paths in the resolve middleware return the same body, so
it is no longer a tenant-existence oracle.
