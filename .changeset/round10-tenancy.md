---
"@zudojs/tenancy": minor
---

Round 10 fixes.

- **cross/X-03 (bug):** the HTTP middleware works with the real `@zudojs/http` request, whose `headers` is a plain object. Headers are read through `request.getHeader()` when present, else from a plain object or a `Map`, case-insensitively. New export: `readRequestHeader`; mirrored request types accept both shapes (`HttpRequestBag`).
- **TEN-01 (security, secure default):** `createResolveTenantMiddleware` defaults `minimumTrust` to `"verified"`. A tenant named only by a client header or URL path is refused (403) unless `minimumTrust: "untrusted"` is passed explicitly.
- **TEN-02 (gap):** new `createDomainResolver({ registry | repository })` resolves custom domains (source `domain`, trust `verified`). The resolve middleware falls back to `repository.findBySlug` for subdomain/path resolutions (new option `slugLookup`, default `true`).
- **TEN-03 (docs):** README now says conflict detection is opt-in (`detectConflicts: true`).
- **TEN-04 (convention):** `TenantId` is the branded type from `@zudojs/constants`, re-exported; tenancy's `createTenantId` stays the validating constructor.
- **TEN-05 (security):** an unknown tenant and a non-active one both get `404 Tenant not found`; the guard middleware answers `403 Tenant is not available` without the tenant id or status.
- **cross/CV-01:** removed the `@zudojs/http` peer dependency (higher tier, never imported).

Behaviour changes: header/path-only tenancy is refused by default; suspended tenants answer 404 instead of 403 in the resolve middleware; the guard's 403 body no longer names the tenant or its status; `TenantId` brand changed to the shared one (values from either package are accepted by both).
