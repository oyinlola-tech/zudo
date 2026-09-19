---
"@zudojs/auth-oauth": patch
---

Round 10 security fix:

- SEC-06: the SSRF guard on server-fetched endpoints judges IPv6 literals that embed an IPv4 address as that IPv4 address. This covers IPv4-compatible `[::127.0.0.1]` (serialised as `[::7f00:1]`), mapped, translated `[::ffff:0:a9fe:a9fe]`, NAT64 `[64:ff9b::169.254.169.254]` and 6to4 `2002::/16`. It also refuses the local-use NAT64 prefix `64:ff9b:1::/48` and fails closed on an unparseable literal.
