---
"@zudojs/http": minor
---

Harden and consolidate the HTTP query layer.

`NodeHTTPRequest.query`, `createHTTPRequest()` and the `parseQueryString` the
package barrel exports all ran a second, unhardened query parser that
accumulated into an object literal and read `result[key]` without an
own-property check. On fully attacker-controlled input that meant:

- `?__proto__=a&__proto__=b` assigned an array through the `__proto__` setter,
  replacing the returned query object's prototype. The parameter vanished from
  its own keys while the object silently gained `length`, `map` and the rest of
  `Array.prototype`.
- `?constructor=x` read the inherited `Object` constructor as the "existing"
  value and stored it in the result, handing a handler
  `query.constructor === [Object, "x"]`.
- None of the four documented query limits applied, so a request carrying
  50,000 parameters was parsed in full.

All of these paths now delegate to the hardened `httpQuery` parser that the
Node adapter and the router already used, so every entry point produces a
null-prototype record, drops `__proto__` / `constructor` / `prototype`, and
throws `HTTPQueryLimitError` (414) on a limit breach.

Also fixed in `httpQuery`:

- `getQueryStrings()` threw `TypeError: Cannot convert object to primitive
  value` for `?a[b]=1&a=2`, because the parsed array holds a null-prototype
  object that `String()` cannot coerce. It is now total over every parseable
  shape.
- `getQueryString()` returned `null` while declaring `string | undefined`; a
  literal `?a=null` now yields `"null"`.
- `hasQuery()` and `querySize()` answered from the raw search params rather
  than the parsed query, so `hasQuery(req, "a")` was `false` for `?a[b]=1` and
  `hasQuery(req, "__proto__")` was `true` for a key the parser drops. They now
  answer about the object `getQuery()` returns.
- `maxKeys` was checked before comma expansion, so one parameter could expand
  past the cap under `commaSeparated`. It now counts emitted pairs.
- `maxTotalLength` and `commaSeparated` were ignored when the input was a
  `URLSearchParams`; both entry points now share one tokenizer.
- `cloneQuery()` used a `JSON.parse(JSON.stringify(…))` round-trip, which
  rebuilt every level with `Object.prototype` and so discarded the null
  prototype the parser exists to guarantee. It is now a structural deep copy.
- `mergeQuery()` assigned nested source objects by reference, so the merged
  result aliased its inputs. Values are deep-copied.
- `stringifyQuery()` / `buildQueryString()` had no depth or cycle guard and
  overflowed the stack with a bare `RangeError` on a cyclic or deeply nested
  object. Both now throw `HTTPQueryLimitError`, and both accept a `maxDepth`
  option.

`QueryValue` is now recursive (`QueryPrimitive | QueryValue[] | QueryObject`).
The previous `QueryPrimitive[]` described a shape the parser could not
produce, since `?a[b]=1&a=2` puts an object inside the array.

`httpQuery` is split into `queryTypes/`, `queryParse/`, `queryRequest/` and
`querySerialize/`. The public API is unchanged and still re-exported from
`@zudojs/http`.
