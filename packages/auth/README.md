# @zudojs/auth

Authentication primitives including JWT, sessions, password hashing, and RBAC delegation.

## Installation

```bash
npm install @zudojs/auth
```

## Quick Start

```typescript
import {
  createTokenPair,
  verifyAccessToken,
  createMemorySessionStore,
  hashPassword,
  verifyPassword,
  type TokenConfig,
} from "@zudojs/auth";

const tokenConfig: TokenConfig = {
  accessSecret: process.env.JWT_ACCESS_SECRET!,
  refreshSecret: process.env.JWT_REFRESH_SECRET!,
  accessTtl: 900, // seconds (15 minutes)
  refreshTtl: 604_800, // seconds (7 days)
};

const tokens = createTokenPair(user.id, tokenConfig, { roles: user.roles });
const result = verifyAccessToken(tokens.accessToken, tokenConfig);

const sessionStore = createMemorySessionStore();
const hash = await hashPassword("plain-text-password");
const ok = await verifyPassword("plain-text-password", hash);
```

## Features

- JWT creation and verification
- Session management with stores
- Password hashing and verification
- RBAC delegation to `@zudojs/permissions`
- Token refresh and revocation

## Use Cases

- API authentication
- Session-based login
- Password reset flows
- Role-based access control
