---
title: "Regular expressions — ZudoJS Academy"
description: "Validate phone numbers and order codes, parse log lines with named groups, rewrite text with replacers, and avoid regex patterns that freeze a server."
source: https://zudojs.oyinlola.site/learn/js-regexp
---

LEVEL 4 · LESSON 8 OF 20

Built-in objects Core

# Regular expressions

Validate phone numbers and order codes, parse log lines with named groups, rewrite text with replacers, and avoid regex patterns that freeze a server.

- **60 min** to read and try
- **You need:** Strings in depth, Numbers in depth, and Dates and time zones
- **You build:** A toolkit that normalises Nigerian phone numbers to +234 format, parses order codes and structured log lines, masks personal data in logs, and refuses input that could trigger catastrophic backtracking

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Read and write patterns with character classes, quantifiers, anchors, groups and alternation
- Choose flags (g, i, m, s, u, v, y, d) and avoid the lastIndex trap of global patterns
- Extract structured data with named groups, matchAll and lookarounds
- Rewrite text safely with replacer functions and RegExp.escape
- Separate validating a format from parsing and checking its meaning
- Recognise patterns vulnerable to catastrophic backtracking (ReDoS) and defend against them

## The phone number check that let everything in

A shop sends order updates by SMS, so the sign-up form asks for a Nigerian mobile number: eleven digits, such as `08031234567`. The developer writes a regular expression, a small pattern language for text, that means "eleven digits", and tests it on a few values:

naive-phone.js

```ts
const elevenDigits = /\d{11}/;

const inputs = [
  "08031234567",
  "+234 803 123 4567",
  "0803-123-4567",
  "call me on 08031234567 after 5pm",
  "080312345678901234",
  "12345678901",
];

for (const input of inputs) {
  console.log(elevenDigits.test(input) ? "accepted" : "rejected", JSON.stringify(input));
}
```

Output of `node naive-phone.js` and of the browser terminal

```ts
accepted "08031234567"
rejected "+234 803 123 4567"
rejected "0803-123-4567"
accepted "call me on 08031234567 after 5pm"
accepted "080312345678901234"
accepted "12345678901"
```

Every result is a problem except the first. The pattern finds eleven digits *anywhere* inside the text, so a sentence and an 18-digit number pass. `12345678901` is not a Nigerian mobile number at all. And two numbers that *are* valid, `+234 803 123 4567` (the international form) and `0803-123-4567`, are refused because of the separators people naturally type.

Regular expressions are everywhere in backend code: validating input, parsing logs, routing URLs, cleaning data. They are also easy to get subtly wrong, and one kind of mistake can freeze a whole server. This lesson teaches the syntax properly, then the difference between *validating* and *parsing*, and finally how to keep patterns fast.

## The building blocks

A **regular expression** (regex) describes a set of strings. JavaScript writes one between slashes, `/pattern/flags`, or builds one from a string with `new RegExp(source, flags)`. A regex is an object; `pattern.test(text)` answers "does the pattern occur somewhere in `text`?".

| Syntax | Matches | Example |
| --- | --- | --- |
| `abc` | those characters, in order | `/ORD/` |
| `.` | any one character except a line break | `/a.c/` matches `abc`, `a-c` |
| `\d`, `\w`, `\s` | a digit 0-9; a letter, digit or `_`; whitespace | `/\d\d/` |
| `\D`, `\W`, `\S` | the opposite of each | `/\D/` any non-digit |
| `[abc]`, `[a-z]`, `[^0-9]` | one character from a set, a range, or not in it | `/[789][01]/` |
| `x*`, `x+`, `x?` | zero or more, one or more, zero or one | `/\s*/` |
| `x{3}`, `x{2,4}`, `x{2,}` | exactly 3, 2 to 4, at least 2 | `/\d{8}/` |
| `^`, `$` | start and end of the input (not characters) | `/^\d+$/` |
| `\b` | a word boundary: between a `\w` and a non-`\w` | `/\bORD\b/` |
| `a\|b` | either alternative | `/NGN\|USD/` |
| `(…)`, `(?:…)` | a group that captures, a group that does not | `/(?:\+234\|0)/` |
| `\.`, `\+`, `\(`, … | a special character used literally | `/\+234/` |

Quantifiers are **greedy**: they take as much as they can and give back only if the rest of the pattern fails. Adding `?` after a quantifier (`*?`, `+?`) makes it **lazy**: as little as possible.

basics.js

```ts
console.log(/^\d{11}$/.test("08031234567"), /^\d{11}$/.test("080312345678"));
console.log(/\bORD\b/.test("ORD-17"), /\bORD\b/.test("RECORDS"));
console.log("<b>Rice</b> and <b>Oil</b>".match(/<b>.*<\/b>/)[0]);
console.log("<b>Rice</b> and <b>Oil</b>".match(/<b>.*?<\/b>/)[0]);
console.log("2026-03-04".split(/-/), "rice , beans,yam".split(/\s*,\s*/));
```

Output of `node basics.js` and of the browser terminal

```ts
true false
true false
<b>Rice</b> and <b>Oil</b>
<b>Rice</b>
[ '2026', '03', '04' ] [ 'rice', 'beans', 'yam' ]
```

`^` and `$` are what the naive phone check lacked. With them the pattern must match the *whole* input, not a piece of it. The greedy `.*` ran to the last `</b>`; the lazy version stopped at the first. (This is a demonstration of greediness, not a recommendation: HTML should be parsed with an HTML parser.)

### A better phone pattern

A Nigerian mobile number is `0`, then a network prefix such as 703, 803, 810 or 906 (7, 8 or 9, then 0 or 1, then any digit), then 7 more digits. The international form replaces the leading `0` with `+234` or `234`. People also type spaces, dashes and brackets. One readable approach is to remove those separators first, then match a strict pattern:

phone-pattern.js

```ts
const NG_MOBILE = /^(?:\+?234|0)([789][01]\d{8})$/;

const inputs = ["08031234567", "+234 803 123 4567", "234-803-123-4567", "(0803) 123 4567", "call me on 08031234567", "080312345678901234", "12345678901", "06031234567"];

for (const input of inputs) {
  const compact = input.replace(/[\s\-()]/g, "");
  const match = NG_MOBILE.exec(compact);
  console.log(match ? `+234${match[1]}` : "rejected     ", JSON.stringify(input));
}
```

Output of `node phone-pattern.js` and of the browser terminal

```ts
+2348031234567 "08031234567"
+2348031234567 "+234 803 123 4567"
+2348031234567 "234-803-123-4567"
+2348031234567 "(0803) 123 4567"
rejected      "call me on 08031234567"
rejected      "080312345678901234"
rejected      "12345678901"
rejected      "06031234567"
```

`(?:\+?234|0)` groups the two possible prefixes without capturing them; `\+?` makes the plus optional. `([789][01]\d{8})` captures the ten significant digits, which become the number in the international **E.164** format (`+234…`), the one form to store. `exec` returns a match array (the whole match at index 0, then each capture group) or `null`. Inside a character class most characters lose their special meaning, but `-` can mean a range, so it is escaped as `\-`.

## Flags

Flags go after the closing slash and change how the whole pattern behaves:

| Flag | Name | Effect |
| --- | --- | --- |
| `g` | global | find all matches (for `matchAll`, `replaceAll`, `match`); makes the regex remember a position |
| `i` | ignore case | `/ord/i` matches `ORD` |
| `m` | multiline | `^` and `$` match at every line start and end |
| `s` | dotAll | `.` also matches line breaks |
| `u` | unicode | works in code points, enables `\p{…}`, stricter syntax |
| `v` | unicodeSets | everything `u` does, plus set operations and emoji properties |
| `y` | sticky | match only exactly at `lastIndex` |
| `d` | indices | report start and end positions of each group |

flags.js

```ts
const log = "09:15 INFO order ORD-1\n09:16 ERROR payment ORD-2\n09:17 INFO order ORD-3";

console.log(log.match(/^\d\d:\d\d ERROR.*$/)?.[0]);
console.log(log.match(/^\d\d:\d\d ERROR.*$/m)?.[0]);
console.log(log.match(/ORD-\d/g));
console.log(/order.ORD-1.09/.test(log), /order.ORD-1.09/s.test(log));
console.log("👍🏽".match(/./g).length, "👍🏽".match(/./gu).length);
```

Output of `node flags.js` and of the browser terminal

```ts
undefined
09:16 ERROR payment ORD-2
[ 'ORD-1', 'ORD-2', 'ORD-3' ]
false true
4 2
```

Without `m`, `^` only matches at the very start of the whole log, so the ERROR line is not found. Without `u`, `.` matches single UTF-16 code units and splits the emoji into four halves ([Strings in depth](https://zudojs.oyinlola.site/learn/js-strings#three-lengths) explains why). **Use `u` or `v` on every pattern that may see text typed by people.**

### The lastIndex trap

A regex with `g` (or `y`) is *stateful*. `test` and `exec` start searching at its `lastIndex` property and update it after each match. Reusing one global regex for several independent checks gives alternating answers:

last-index.js

```ts
const ORDER_CODE = /ORD-\d+/g;

console.log(ORDER_CODE.test("ORD-1"), ORDER_CODE.lastIndex);
console.log(ORDER_CODE.test("ORD-1"), ORDER_CODE.lastIndex);
console.log(ORDER_CODE.test("ORD-1"), ORDER_CODE.lastIndex);

const VALID_CODE = /^ORD-\d+$/;
console.log(VALID_CODE.test("ORD-1"), VALID_CODE.test("ORD-1"));
```

Output of `node last-index.js` and of the browser terminal

```ts
true 5
false 0
true 5
true true
```

The second call started at position 5, found nothing and reset `lastIndex` to 0. In a server, where one module-level regex validates every request, this makes every second valid request fail. The rule: **never put `g` on a regex used with `test` or `exec` for yes/no questions**. Use `g` only with `matchAll`, `replaceAll` and `match`, which reset it themselves.

## Groups: pulling data out

Capture groups turn a match into data. **Named groups**, `(?<name>…)`, make the result readable and survive changes to the pattern: adding a group does not shift the others' numbers. The shop's order codes look like `ORD-2026-000123-LAG`: a year, a six-digit sequence and a branch code:

order-code.js

```ts
const ORDER = /^ORD-(?<year>\d{4})-(?<seq>\d{6})-(?<branch>LAG|ABJ|PHC)$/;

const match = ORDER.exec("ORD-2026-000123-LAG");
console.log(match[0], match[1], match.index);
console.log(match.groups);

const { year, seq, branch } = ORDER.exec("ORD-2026-004507-ABJ").groups;
console.log(Number(year), Number(seq), branch);

console.log(ORDER.exec("ORD-2026-123-LAG"), ORDER.exec("ord-2026-000123-lag"));
```

Output of `node order-code.js` and of the browser terminal

```ts
ORD-2026-000123-LAG 2026 0
[Object: null prototype] { year: '2026', seq: '000123', branch: 'LAG' }
2026 4507 ABJ
null null
```

`match.groups` is a null-prototype object (it has no inherited keys), so destructuring it is safe. Everything captured is a **string**: converting `year` and `seq` to numbers is your job. The last line shows two rejections: too few digits, and lower case. Whether to accept lower case (with the `i` flag) is a product decision; this pattern says no.

### All matches: matchAll

`text.matchAll(globalRegex)` returns an iterator of full match objects, one per match, with groups and positions. `match` with `g` returns only the matched strings and throws the groups away:

match-all.js

```ts
const line = "order=ORD-2026-000123-LAG amount=1250000 user=USR-7 ms=132";
const PAIR = /(?<key>\w+)=(?<value>\S+)/g;

console.log(line.match(PAIR));

const fields = {};
for (const m of line.matchAll(PAIR)) fields[m.groups.key] = m.groups.value;
console.log(fields);

try {
  line.matchAll(/(\w+)=(\S+)/);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node match-all.js` and of the browser terminal

```json
[
  'order=ORD-2026-000123-LAG',
  'amount=1250000',
  'user=USR-7',
  'ms=132'
]
{
  order: 'ORD-2026-000123-LAG',
  amount: '1250000',
  user: 'USR-7',
  ms: '132'
}
TypeError: String.prototype.matchAll called with a non-global RegExp argument
```

`matchAll` insists on the `g` flag, so you cannot accidentally get only the first match. `Object.fromEntries` could build the same object in one line: `Object.fromEntries([...line.matchAll(PAIR)].map((m) => [m.groups.key, m.groups.value]))`.

### Back-references

Inside a pattern, `\1` or `\k<name>` matches the same text a group already matched. A payment reference that must start and end with the same branch code, or a repeated character check:

backrefs.js

```ts
const SAME_BRANCH = /^(?<branch>[A-Z]{3})-\d+-\k<branch>$/;
console.log(SAME_BRANCH.test("LAG-5521-LAG"), SAME_BRANCH.test("LAG-5521-ABJ"));

const REPEATED_DIGIT = /(\d)\1{3}/;
console.log(REPEATED_DIGIT.test("PIN 7777"), REPEATED_DIGIT.test("PIN 7717"));
```

Output of `node backrefs.js` and of the browser terminal

```ts
true false
true false
```

## Lookarounds: conditions without consuming

A **lookaround** checks what comes before or after the current position without including it in the match. There are four:

- `x(?=y)`: x, if followed by y (lookahead)
- `x(?!y)`: x, if not followed by y (negative lookahead)
- `(?<=y)x`: x, if preceded by y (lookbehind)
- `(?<!y)x`: x, if not preceded by y (negative lookbehind)

lookarounds.js

```ts
const message = "Pay ₦2500 now and ₦300 on delivery, ref 7781";

console.log(message.match(/(?<=₦)\d+/g));
console.log(message.match(/(?<!₦)\b\d+/g));

console.log("1250000".replace(/\B(?=(\d{3})+(?!\d))/g, ","));

const skus = ["RICE-5KG", "RICE-5KG-OLD", "OIL-1L", "OIL-1L-OLD"];
console.log(skus.filter((sku) => /^(?!.*-OLD$)[A-Z]+-\w+/.test(sku)));
console.log(skus.filter((sku) => /^[A-Z]+-\w+(?!-OLD)/.test(sku)));
```

Output of `node lookarounds.js` and of the browser terminal

```json
[ '2500', '300' ]
[ '7781' ]
1,250,000
[ 'RICE-5KG', 'OIL-1L' ]
[ 'RICE-5KG', 'RICE-5KG-OLD', 'OIL-1L', 'OIL-1L-OLD' ]
```

The lookbehind extracts amounts after `₦` without the symbol. The thousands-separator pattern finds positions (`\B`, not at a word boundary) that are followed by groups of exactly three digits up to the end, and inserts a comma there; it is a classic, but for real money prefer `Intl.NumberFormat` from [Numbers in depth](https://zudojs.oyinlola.site/learn/js-numbers#format). The last two lines try to keep only current products. The first puts a negative lookahead at the *start*, checked against the whole string: "not anything followed by -OLD at the end". It works. The second looks natural, "a code not followed by -OLD", and keeps everything. After `\w+` matches `5KG`, the lookahead sees `-OLD` and fails, so the engine **backtracks**: `\w+` gives back one character and matches `5K`, and now the text after it is `G-OLD`, which does not start with `-OLD`. The lookahead succeeds and the pattern matches. Lookarounds are checked wherever the engine happens to be, including positions reached by backtracking.

## Rewriting text: replace with functions

`replace(pattern, replacement)` changes the first match (or all of them with `g`); `replaceAll` requires `g`. The replacement can be a string with references (`$1`, `$<name>`, `$&` for the whole match) or a **function** that receives the match and returns the replacement. Functions are the tool for anything beyond simple rearranging:

replace.js

```ts
console.log("2026-03-04".replace(/(?<y>\d{4})-(?<m>\d{2})-(?<d>\d{2})/, "$<d>/$<m>/$<y>"));

const note = "Customer 08031234567 paid with card 5399 8312 3456 7788, alt phone +2349061112222.";

const masked = note
  .replace(/\b\d{4}(?:[ -]?\d{4}){3}\b/g, (card) => `**** ${card.slice(-4)}`)
  .replace(/(?:\+234|\b0)[789][01]\d{8}\b/g, (phone) => "*".repeat(phone.length - 4) + phone.slice(-4));
console.log(masked);

const prices = "Rice ₦8500, Oil ₦3200, Salt ₦450";
console.log(prices.replace(/₦(\d+)/g, (_, naira) => `₦${Math.round(Number(naira) * 1.075)}`));

try {
  "a-b".replaceAll(/-/, "+");
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node replace.js` and of the browser terminal

```ts
04/03/2026
Customer *******4567 paid with card **** 7788, alt phone **********2222.
Rice ₦9138, Oil ₦3440, Salt ₦484
TypeError: String.prototype.replaceAll called with a non-global RegExp argument
```

The replacer's first argument is the whole match, followed by each capture group, then the position and the whole string; the `_` name marks the whole match as unused. Masking is a real production need: logs must not contain full card numbers or phone numbers, and a replacer can keep the last four digits for support staff.

### Building patterns from data: RegExp.escape

A search box highlights the customer's search term in product names. Turning the term into a regex with `new RegExp(term)` breaks as soon as it contains special characters, and lets users inject pattern syntax, including slow patterns:

escape.js

```ts
const names = ["C++ for beginners", "Rice 5kg (bulk)", "₦5,000 gift card", "Cocoa"];

for (const term of ["c++", "(bulk)", "₦5,000"]) {
  try {
    const unsafe = new RegExp(term, "i");
    console.log("unsafe", term, names.filter((n) => unsafe.test(n)));
  } catch (error) {
    console.log("unsafe", term, `${error.name}: ${error.message}`);
  }
  const safe = new RegExp(RegExp.escape(term), "iu");
  console.log("safe  ", term, names.filter((n) => safe.test(n)));
}
console.log(RegExp.escape("(bulk) 5.5kg"));
```

Output of `node escape.js` and of the browser terminal

```ts
unsafe c++ SyntaxError: Invalid regular expression: /c++/i: Nothing to repeat
safe   c++ [ 'C++ for beginners' ]
unsafe (bulk) [ 'Rice 5kg (bulk)' ]
safe   (bulk) [ 'Rice 5kg (bulk)' ]
unsafe ₦5,000 [ '₦5,000 gift card' ]
safe   ₦5,000 [ '₦5,000 gift card' ]
\(bulk\)\x205\.5kg
```

`RegExp.escape` (ES2025, available in Node.js 24 and current browsers) escapes every character that has a meaning in a pattern. It also escapes a leading letter or digit, whitespace and some punctuation as `\x..` codes, so the result is safe wherever it is inserted. The unescaped `(bulk)` became a group matching the plain word "bulk", which happens to work here and would fail for other inputs; that is worse than an error. Without `RegExp.escape`, use `term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")`, or avoid regexes entirely: `name.toLowerCase().includes(term.toLowerCase())` is often all a search box needs.

## Unicode-aware patterns

`\w` and `[a-z]` only know the English alphabet. Customers' names do not. With the `u` or `v` flag, **Unicode property escapes** match characters by their Unicode category: `\p{L}` any letter, `\p{Lu}` upper-case letters, `\p{M}` combining marks, `\p{Nd}` decimal digits in any script, `\p{Script=Latin}` a script. The newer `v` flag adds set operations inside classes (`--` subtraction, `&&` intersection) and properties of whole strings such as `\p{RGI_Emoji}`, which matches complete emoji including skin tones and joined sequences:

unicode.js

```ts
const names = ["Adaeze", "Ọlá Àkàrà", "Émile", "Chidi-Obi", "R2D2", "Zainab 👩🏾‍🍳"];

const ASCII_NAME = /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/;
const ANY_NAME = /^\p{L}\p{M}*(?:[\p{L}\p{M}]|[ '-]\p{L})*$/u;
for (const name of names) {
  console.log(name.padEnd(12), ASCII_NAME.test(name), ANY_NAME.test(name));
}

console.log(/^\p{RGI_Emoji}$/v.test("👩🏾‍🍳"), /^\p{RGI_Emoji}$/v.test("A"));
console.log("Zainab 👩🏾‍🍳🇳🇬".replace(/\p{RGI_Emoji}/gv, "").trim());
console.log(/^[\p{Lu}--[A-Z]]+$/v.test("ÀÉÌ"), /^[\p{Lu}--[A-Z]]+$/v.test("ÀBÌ"));
console.log(/^\d{3}$/.test("٣٤٥"), /^\p{Nd}{3}$/u.test("٣٤٥"));
```

Output of `node unicode.js` and of the browser terminal

```ts
Adaeze       true true
Ọlá Àkàrà    false true
Émile        false true
Chidi-Obi    true true
R2D2         false false
Zainab 👩🏾‍🍳 false false
true false
Zainab
true false
false true
```

The ASCII-only pattern rejects half of the shop's real customers. The Unicode version accepts letters from any script with their combining marks, and single separators between parts. `[\p{Lu}--[A-Z]]` means "upper-case letters except A to Z", which is only possible with `v`. The last line matters for validation: `\p{Nd}` accepts Arabic-Indic digits, which `Number()` cannot read. When digits will be converted to numbers, `\d` (ASCII only) is the *correct* choice.

## Validating versus parsing

Two different jobs are often mixed together:

- **Validating** answers "is this string in the right format?". The pattern must be anchored (`^…$`) and the answer is yes or no.
- **Parsing** turns a string into structured data: an object with typed fields. It uses groups, then converts and checks the *meaning* of each field, which a regex cannot do.

A log line from the checkout service shows both. The format is checked by the regex, the values by code:

parse-log.js

```ts
const LINE = /^(?<time>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z) (?<level>DEBUG|INFO|WARN|ERROR) \[(?<service>[a-z-]+)\] (?<rest>.*)$/;
const PAIR = /(?<key>[a-z]+)=(?<value>"[^"]*"|\S+)/g;

function parseLogLine(line) {
  const match = LINE.exec(line);
  if (!match) return { ok: false, reason: "bad format" };
  const { time, level, service, rest } = match.groups;
  const at = new Date(time);
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 19) !== time.slice(0, 19)) return { ok: false, reason: `bad time ${time}` };
  const fields = {};
  for (const { groups } of rest.matchAll(PAIR)) fields[groups.key] = groups.value.replace(/^"|"$/g, "");
  if ("ms" in fields && !/^\d+$/.test(fields.ms)) return { ok: false, reason: `bad ms ${fields.ms}` };
  return { ok: true, at, level, service, fields };
}

const lines = [
  '2026-03-04T09:15:02.113Z INFO [checkout] order=ORD-1001 amount=1250000 user=USR-7 ms=132',
  '2026-03-04T09:15:03Z ERROR [payments] order=ORD-1002 reason="card declined" ms=2210',
  '2026-02-30T09:15:03Z WARN [checkout] order=ORD-1003',
  '2026-03-04 09:15 INFO checkout started',
  '2026-03-04T09:15:04Z INFO [checkout] ms=fast',
];
for (const line of lines) {
  const result = parseLogLine(line);
  console.log(result.ok ? `${result.level} ${result.service} ${JSON.stringify(result.fields)}` : `rejected: ${result.reason}`);
}
```

Output of `node parse-log.js` and of the browser terminal

```ts
INFO checkout {"order":"ORD-1001","amount":"1250000","user":"USR-7","ms":"132"}
ERROR payments {"order":"ORD-1002","reason":"card declined","ms":"2210"}
rejected: bad time 2026-02-30T09:15:03Z
rejected: bad format
rejected: bad ms fast
```

The format regex happily accepts `2026-02-30`: it has the right shape. Only the round trip through `Date` ([Dates and time zones](https://zudojs.oyinlola.site/learn/js-dates#parsing)) catches the impossible day. Likewise `ms=fast` passes the pair pattern and fails the meaning check. Quoted values such as `reason="card declined"` need their own alternative in the pattern, and the order of alternatives matters: `"[^"]*"` is tried before `\S+`.

### When not to use a regex

- **Email addresses:** the full grammar is enormous. Check for one `@` with something on both sides and a dot in the domain, then send a confirmation email: that is the only real validation.
- **URLs:** use `new URL(text)` and inspect `protocol` and `hostname`.
- **JSON, HTML, CSV with quotes:** use a real parser. These formats nest or escape in ways regular expressions cannot follow.
- **Numbers and dates:** a regex can check the shape; conversion and range checks belong in code.

## Catastrophic backtracking (ReDoS)

JavaScript's regex engine is a **backtracking** engine. When one way of matching fails, it goes back and tries another way to split the input among the quantifiers. Usually there are few alternatives. But a pattern with a quantifier inside a quantifier, such as `(\d+)+`, can split a string of n digits in 2n-1 ways, and when the match finally fails, the engine tries *all* of them:

redos.js

```ts
const EVIL = /^(\d+)+$/;
const SAFE = /^\d+$/;

EVIL.test("1".repeat(10) + "x");
for (const n of [14, 16, 18, 20, 22]) {
  const input = "1".repeat(n) + "x";
  const start = performance.now();
  EVIL.test(input);
  const evilMs = performance.now() - start;
  const t2 = performance.now();
  SAFE.test(input);
  const safeMs = performance.now() - t2;
  console.log(`${n} digits: nested ${evilMs.toFixed(1)} ms, simple ${safeMs.toFixed(1)} ms, ways to split: ${2 ** (n - 1)}`);
}
```

Output of `node redos.js` and of the browser terminal

```ts
14 digits: nested 0.2 ms, simple 0.0 ms, ways to split: 8192
16 digits: nested 0.7 ms, simple 0.0 ms, ways to split: 32768
18 digits: nested 2.6 ms, simple 0.0 ms, ways to split: 131072
20 digits: nested 10.7 ms, simple 0.0 ms, ways to split: 524288
22 digits: nested 51.4 ms, simple 0.0 ms, ways to split: 2097152
```

Every two extra digits make the nested pattern about four times slower; the simple pattern, which accepts exactly the same strings, stays instant. At 30 digits the nested version takes minutes. JavaScript runs on one thread ([The event loop](https://zudojs.oyinlola.site/learn/js-event-loop)), so while `test` is stuck, the server answers *no other request*. An attacker who finds such a pattern behind a form field can take a service down with one short string. This is a **regular expression denial of service** (ReDoS), and it has caused real outages at large companies.

The dangerous shapes all give the engine many ways to match the same text:

- Nested quantifiers: `(a+)+`, `(\w+\s?)*`, `(\d+,?)+`.
- Alternatives that overlap: `(\w|\d)+`, `(a|aa)*`.
- Adjacent quantifiers that can take the same characters, followed by something that fails: `\s*\s*$`, `.*.*=`.

Defences, in order of importance:

1. **Limit input length before matching.** A phone number is never 5,000 characters long. A length check makes even a bad pattern's worst case small.
2. **Write patterns with one way to match.** `^\d+$` instead of `^(\d+)+$`; `^\w+(?:\s\w+)*$` instead of `^(\w+\s?)*$`, where each repetition must start with the separator.
3. **Never build patterns from user input** without `RegExp.escape`.
4. **For untrusted patterns or huge inputs**, use an engine with guaranteed linear time, such as the `re2` package, or run the match in a worker with a timeout.

redos-fixed.js

```ts
const BAD_NAME = /^([a-zA-Z]+\s?)*$/;
const GOOD_NAME = /^[a-zA-Z]+(?: [a-zA-Z]+)*$/;
const attack = "a".repeat(24) + "!";

for (const [label, pattern] of [["good", GOOD_NAME], ["bad ", BAD_NAME]]) {
  const start = performance.now();
  const result = pattern.test(attack);
  console.log(label, result, performance.now() - start < 200 ? "fast" : "slow");
}
console.log(GOOD_NAME.test("Ada Obi"), GOOD_NAME.test("Ada  Obi"), GOOD_NAME.test("Ada Obi "));
```

Output of `node redos-fixed.js` and of the browser terminal

```ts
good false fast
bad  false slow
true false false
```

Both patterns accept names made of words separated by single spaces. In the good one, every repetition must begin with the space, so there is exactly one way to split any input and a failure is detected in linear time. The last line shows its stricter behaviour: double and trailing spaces are rejected, which is why you normalise whitespace ([Strings in depth](https://zudojs.oyinlola.site/learn/js-strings#build)) before validating.

## Before you build: phone numbers and order codes

REASON IT OUT

### What will people type, and what must the system store?

You will build `normalizePhone` (form input to E.164), `parseOrderCode`, and `maskForLogs`, with a length guard against ReDoS. Before reading the code, think through:

- List the ways a customer might type the same number: with `+234`, `234`, or `0`; with spaces, dashes, dots or brackets; with a leading or trailing space. Which of these should be accepted?
- What must be rejected? Think of letters, a landline, a number with one digit too many, and `+2340803…` (both prefixes).
- What is stored, and why only one form?
- An order code arrives in a URL. Should `parseOrderCode` accept lower case? Leading zeros? What should it return on failure: `null`, `false`, or throw?
- What is the longest input any of these functions needs to look at?

**Show the reasoning**

- Accept `+234`, `234` and `0` prefixes, and remove spaces, dashes, dots and brackets *between* digits first. Trim the input. Everything else stays strict: after cleaning, the string must be exactly a prefix plus ten digits starting with 7, 8 or 9, then 0 or 1.
- Letters are rejected by the strict pattern. A landline such as `01 234 5678` fails the `[789][01]` rule. One digit too many fails the `$`. `+2340803…` fails because after `+234` the next digit must be 7, 8 or 9.
- Store E.164, `+2348031234567`: one canonical form means one string per customer, so uniqueness checks, look-ups and SMS gateways all work. Keep what the user typed only if you need it for display.
- Codes are case-sensitive identifiers, so accept only the canonical upper-case form; a URL handler may upper-case first if the product wants to be forgiving, but that decision belongs to the caller. The sequence keeps its leading zeros as text and is also returned as a number. Return `null` for "not an order code": it is an expected outcome for URLs, not an exceptional one.
- A phone number in any accepted form is at most about 20 characters; an order code exactly 19. Refuse anything longer than 32 characters before running a regex. The length check costs nothing and caps the worst case of every pattern.

## Build: the validation toolkit

patterns.js

```ts
const MAX_INPUT = 32;

const SEPARATORS = /[\s.\-()]/g;
const NG_MOBILE = /^(?:\+234|234|0)(?<number>[789][01]\d{8})$/;
const ORDER_CODE = /^ORD-(?<year>20\d{2})-(?<seq>\d{6})-(?<branch>LAG|ABJ|PHC)$/;

function guardLength(text) {
  return typeof text === "string" && text.length <= MAX_INPUT;
}

export function normalizePhone(input) {
  if (!guardLength(input)) return null;
  const compact = input.trim().replace(SEPARATORS, "");
  const match = NG_MOBILE.exec(compact);
  return match ? `+234${match.groups.number}` : null;
}

export function parseOrderCode(input) {
  if (!guardLength(input)) return null;
  const match = ORDER_CODE.exec(input);
  if (!match) return null;
  const { year, seq, branch } = match.groups;
  return { code: input, year: Number(year), seq: Number(seq), branch };
}

const PHONE_ANYWHERE = /(?:\+234|\b234|\b0)[789][01]\d{8}\b/g;
const CARD_ANYWHERE = /\b\d(?:[ -]?\d){12,18}\b/g;
const EMAIL_ANYWHERE = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g;

export function maskForLogs(text) {
  return text
    .replace(CARD_ANYWHERE, (card) => `[card ****${card.replace(/\D/g, "").slice(-4)}]`)
    .replace(PHONE_ANYWHERE, (phone) => `[phone ****${phone.slice(-4)}]`)
    .replace(EMAIL_ANYWHERE, (email) => `[email ${email[0]}***@${email.split("@")[1]}]`);
}
```

All patterns live at module level, compiled once. None of the patterns used with `exec` has the `g` flag, so none carries state between calls; the `g` patterns are only used with `replace`, which resets them. The card pattern runs before the phone pattern because a card number contains digit runs that could look like a phone number.

main.js

```ts
import { maskForLogs, normalizePhone, parseOrderCode } from "./patterns.js";

for (const input of ["0803 123 4567", "+234 (803) 123-4567", "234.906.111.2222", " 07031234567 ", "01 234 5678", "+2340803123456", "0803123456a", "0".repeat(5000)]) {
  console.log(JSON.stringify(input.length > 20 ? input.slice(0, 12) + "…" : input).padEnd(24), normalizePhone(input));
}

console.log(parseOrderCode("ORD-2026-000123-LAG"));
console.log(parseOrderCode("ORD-2026-000123-lag"), parseOrderCode("ORD-1999-000123-LAG"));

console.log(maskForLogs("Refund for ada@example.com, phone 08031234567, card 5399-8312-3456-7788 (ORD-2026-000123-LAG)"));
```

Output of `node main.js` and of the browser terminal

```ts
"0803 123 4567"          +2348031234567
"+234 (803) 123-4567"    +2348031234567
"234.906.111.2222"       +2349061112222
" 07031234567 "          +2347031234567
"01 234 5678"            null
"+2340803123456"         null
"0803123456a"            null
"000000000000…"          null
{ code: 'ORD-2026-000123-LAG', year: 2026, seq: 123, branch: 'LAG' }
null null
Refund for [email a***@example.com], phone [phone ****4567], card [card ****7788] (ORD-2026-000123-LAG)
```

The 5,000-character input is refused by the length guard before any regex runs. The order code keeps its business rules in the pattern (years 2000 to 2099, known branches); anything else is `null`. The masked log line still tells support staff which card and phone were involved, without exposing them.

## Testing regular expressions

A regex is code, and it is dense code. Test it with a table of inputs that should match and inputs that should not, including the near misses one character away from valid. Add a performance test for the worst inputs you can think of, so a later "improvement" that introduces backtracking fails the build:

patterns.test.js

```ts
import { maskForLogs, normalizePhone, parseOrderCode } from "./patterns.js";

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label} -> ${JSON.stringify(actual)}`);
}

const valid = ["08031234567", "+2348031234567", "2348031234567", "0803 123 4567", "0703-123-4567", "(0906) 111 2222", "08101234567"];
const invalid = ["0803123456", "080312345678", "06031234567", "08231234567", "+2340803123456", "0803123456a", "", "+44 7700 900123"];
check("all valid numbers accepted", valid.map(normalizePhone).every((p) => /^\+234[789][01]\d{8}$/.test(p)), true);
check("all invalid numbers rejected", invalid.map(normalizePhone), invalid.map(() => null));
check("same person, one form", new Set(valid.slice(0, 4).map(normalizePhone)).size, 1);
check("non-string refused", normalizePhone(8031234567), null);

check("order code parsed", parseOrderCode("ORD-2026-000123-ABJ"), { code: "ORD-2026-000123-ABJ", year: 2026, seq: 123, branch: "ABJ" });
check("unknown branch", parseOrderCode("ORD-2026-000123-KAN"), null);
check("code inside text", parseOrderCode("see ORD-2026-000123-LAG"), null);

check("mask phone", maskForLogs("call 08031234567"), "call [phone ****4567]");
check("mask card", maskForLogs("card 5399 8312 3456 7788"), "card [card ****7788]");
check("order code untouched", maskForLogs("ORD-2026-000123-LAG"), "ORD-2026-000123-LAG");

const attacks = ["0".repeat(31) + "x", "+234".repeat(8), "9".repeat(10000), "(".repeat(31)];
const start = performance.now();
for (const attack of attacks) {
  normalizePhone(attack);
  parseOrderCode(attack);
  maskForLogs(attack);
}
check("worst inputs finish quickly", performance.now() - start < 200, true);
console.log(`${failures} failures`);
```

Output of `node patterns.test.js` and of the browser terminal

```ts
PASS all valid numbers accepted -> true
PASS all invalid numbers rejected -> [null,null,null,null,null,null,null,null]
PASS same person, one form -> 1
PASS non-string refused -> null
PASS order code parsed -> {"code":"ORD-2026-000123-ABJ","year":2026,"seq":123,"branch":"ABJ"}
PASS unknown branch -> null
PASS code inside text -> null
PASS mask phone -> "call [phone ****4567]"
PASS mask card -> "card [card ****7788]"
PASS order code untouched -> "ORD-2026-000123-LAG"
PASS worst inputs finish quickly -> true
0 failures
```

The "same person, one form" test states the reason the function exists. The attack inputs include a long run of digits for `maskForLogs`, which has no length guard because log lines can be long; its patterns must be linear on their own. The time limit is generous so that the test does not fail on a slow CI machine, yet any exponential pattern would blow straight through it.

## In production

- **Anchor validation patterns** with `^…$`, and put `u` or `v` on patterns that see human text.
- **Guard lengths first** on every input that reaches a regex, and review every pattern with nested or overlapping quantifiers. Linters such as `eslint-plugin-regexp` flag many ReDoS shapes automatically.
- **Keep `g` out of patterns used for yes/no checks**; keep regexes at module level so they are compiled once.
- **Validate the shape with a regex, the meaning with code**: dates exist, amounts are in range, ids refer to real rows.
- **Normalise before validating and store one canonical form** (E.164 phones, upper-case codes, NFC text).
- **Mask personal data before it reaches logs**, and treat the masking patterns as security code with their own tests.
- **Dependencies have ReDoS bugs too.** `npm audit` reports known ones; keep packages that parse untrusted input up to date.

## Practice

TRY IT YOURSELF

### Parse a bank transfer narration

Bank alerts contain narrations like `"TRF FROM ADA OBI/REF:PSK-99812/AMT:NGN12,500.00"`. Write `parseNarration(text)` that returns `{ sender, ref, kobo }` using one anchored regex with named groups, and `null` when the format does not match. Convert the amount to kobo without floating point.

**Show a solution**

narration.js

```ts
const NARRATION = /^TRF FROM (?<sender>[A-Z][A-Z ]*[A-Z])\/REF:(?<ref>[A-Z]{3}-\d+)\/AMT:NGN(?<naira>\d{1,3}(?:,\d{3})*)\.(?<kobo>\d{2})$/;

function parseNarration(text) {
  const match = NARRATION.exec(text);
  if (!match) return null;
  const { sender, ref, naira, kobo } = match.groups;
  return { sender, ref, kobo: Number(naira.replaceAll(",", "")) * 100 + Number(kobo) };
}

console.log(parseNarration("TRF FROM ADA OBI/REF:PSK-99812/AMT:NGN12,500.00"));
console.log(parseNarration("TRF FROM CHIDI/REF:FLW-1/AMT:NGN1,250,000.50"));
console.log(parseNarration("TRF FROM ADA OBI/REF:PSK-99812/AMT:NGN12500"));
```

Output of `node narration.js` and of the browser terminal

```json
{ sender: 'ADA OBI', ref: 'PSK-99812', kobo: 1250000 }
{ sender: 'CHIDI', ref: 'FLW-1', kobo: 125000050 }
null
```

The amount is split into naira and kobo groups, so the conversion only multiplies integers, as in [Numbers in depth](https://zudojs.oyinlola.site/learn/js-numbers#parsing). The sender pattern starts and ends with a letter, which also means a single space can never be the whole name.

TRY IT YOURSELF

### Highlight a search term safely

Write `highlight(text, term)` that wraps every case-insensitive occurrence of `term` in `[` and `]`. It must work for terms with special characters such as `"c++"` and `"(bulk)"`, and keep the original capitalisation of the text.

**Show a solution**

highlight.js

```ts
function highlight(text, term) {
  if (term.length === 0 || term.length > 50) return text;
  const pattern = new RegExp(RegExp.escape(term), "giu");
  return text.replace(pattern, (match) => `[${match}]`);
}

console.log(highlight("C++ and c++ books", "c++"));
console.log(highlight("Rice 5kg (Bulk), rice 1kg", "(bulk)"));
console.log(highlight("Rice 5kg (Bulk), rice 1kg", "rice"));
```

Output of `node highlight.js` and of the browser terminal

```json
[C++] and [c++] books
Rice 5kg [(Bulk)], rice 1kg
[Rice] 5kg (Bulk), [rice] 1kg
```

The replacer returns the matched text itself, so "C++" keeps its capitals. The length limits stop empty terms (which would match between every character) and very long ones.

TRY IT YOURSELF

### Fix the slow pattern

This pattern validates comma-separated tags such as `"sale,new,bulk-buy"`, and freezes on a long input with a bad ending. Explain why, and rewrite it so it accepts exactly the same valid strings in linear time.

slow-tags.js

```ts
const TAGS = /^([a-z-]+,?)+$/;
console.log(TAGS.test("sale,new,bulk-buy"), TAGS.test("sale,,new"));
```

Output of `node slow-tags.js` and of the browser terminal

```ts
true false
```

**Show a solution**

`([a-z-]+,?)+` is a quantifier inside a quantifier, and the comma is optional, so a run of letters can be split into repetitions in exponentially many ways. On a failing input, the engine tries them all. Requiring the comma *between* repetitions leaves one way to split any string:

fast-tags.js

```ts
const TAGS = /^[a-z-]+(?:,[a-z-]+)*$/;
console.log(TAGS.test("sale,new,bulk-buy"), TAGS.test("sale,,new"), TAGS.test("sale,"));

const attack = "a".repeat(30) + "!";
const start = performance.now();
console.log(TAGS.test(attack), performance.now() - start < 200 ? "fast" : "slow");
```

Output of `node fast-tags.js` and of the browser terminal

```ts
true false false
false fast
```

One difference is worth noticing: the old pattern also accepted a trailing comma (`"sale,"`), because `,?` allowed it at the end. The new one rejects it. If trailing commas must be allowed, add `,?` once, after the group, where it cannot multiply the ways to match.

## Recap

- A regex describes a set of strings with character classes, quantifiers, anchors, groups and alternation. Quantifiers are greedy unless followed by `?`.
- Anchor validation patterns with `^…$`, or they match pieces of longer text.
- Flags change the whole pattern: `g` for all matches, `i`, `m`, `s`, `u`/`v` for Unicode, `y`, `d`. A `g` regex keeps `lastIndex` between `test` calls; do not use it for yes/no checks.
- Named groups and `matchAll` turn text into data; captured values are strings. Lookarounds test context without consuming it.
- Pass a function to `replace` for computed replacements; escape user input with `RegExp.escape` before building patterns.
- `\p{L}`, `\p{M}` and `\p{RGI_Emoji}` make patterns work for real names and emoji; use `\d` when digits will become numbers.
- Validate the format with a regex and the meaning with code; use real parsers for URLs, JSON and HTML.
- Nested or overlapping quantifiers cause exponential backtracking (ReDoS). Limit input length, write patterns with one way to match, and test the worst inputs.

Next: [Iterables and iterators](https://zudojs.oyinlola.site/learn/js-iterators), where `matchAll`, `map.keys()` and `for...of` turn out to share one small protocol.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
