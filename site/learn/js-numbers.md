---
title: "Numbers in depth — ZudoJS Academy"
description: "Learn how IEEE-754 doubles store numbers, where precision ends, how to round, parse and format naira amounts exactly, and when to reach for BigInt."
source: https://zudojs.oyinlola.site/learn/js-numbers
---

LEVEL 4 · LESSON 5 OF 20

Built-in objects Core

# Numbers in depth

Learn how IEEE-754 doubles store numbers, where precision ends, how to round, parse and format naira amounts exactly, and when to reach for BigInt.

- **55 min** to read and try
- **You need:** Mathematical reasoning (money in kobo), Values, variables and types, and Strings in depth
- **You build:** A money module that parses typed naira amounts into kobo without floating point, rounds with an explicit rule, formats with Intl.NumberFormat and keeps 19-digit order ids exact

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Describe how a double stores a number and predict where integers and decimals stop being exact
- Compare floating-point results with a tolerance, and recognise NaN, Infinity and negative zero
- Round with a chosen rule, and explain why toFixed and Math.round disagree
- Parse typed amounts into integer kobo without floating-point multiplication
- Use BigInt for large ids and totals, including JSON round trips
- Format money, percentages and compact numbers with Intl.NumberFormat

## The refund that went to the wrong order

A shop's backend stores orders in a database whose ids are 64-bit integers, generated from a timestamp and a machine number so that every server can create ids without asking the others. The payment provider sends a refund notification as JSON, and a small Node.js service looks the order up:

refund.js

```ts
const body = '{"orderId": 1844674407370955169, "amountKobo": 1250000}';
const notice = JSON.parse(body);

console.log(notice.orderId);
console.log(notice.orderId === 1844674407370955169);
console.log(String(notice.orderId) === "1844674407370955169");
```

Output of `node refund.js` and of the browser terminal

```ts
1844674407370955300
true
false
```

The id came out as `…955300`. The service looks up an order that does not exist, or worse, one that belongs to someone else. The second line is even more confusing: the literal in the code is rounded in exactly the same way, so comparing two wrong numbers says `true`. Only the string comparison reveals that the digits changed.

[Values, variables and types](https://zudojs.oyinlola.site/learn/js-values#numbers) showed that `0.1 + 0.2` is not `0.3`, and [Mathematical reasoning](https://zudojs.oyinlola.site/learn/logic-math#kobo) fixed money by counting whole kobo. This lesson explains the number format underneath both problems, so you can predict exactly where numbers stay exact and where they do not, and then covers rounding, parsing, `BigInt` and formatting well enough to build a correct money module.

## How a number is stored

Every JavaScript `number` is a 64-bit **double-precision floating-point** value, defined by the standard **IEEE 754**. "Floating point" means the number is stored like scientific notation in base 2: a **sign**, an **exponent** that says where the binary point goes, and a **significand** (also called the mantissa) that holds the digits:

```ts
  sign  exponent (11 bits)   significand / fraction (52 bits)
  [0]   [01111111011]         [1001100110011001100110011001100110011001100110011010]

  value = (-1)^sign  x  1.fraction (binary)  x  2^(exponent - 1023)
```

The 64 bits of the number 0.1: one sign bit, 11 exponent bits and 52 fraction bits. The leading 1 before the point is implied, so the significand holds 53 significant binary digits.

You can look at those bits yourself. A `DataView` writes a number into 8 raw bytes, and reading the bytes back as a 64-bit unsigned integer (a `bigint`) shows the pattern:

bits.js

```ts
function bits(x) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const b = view.getBigUint64(0).toString(2).padStart(64, "0");
  return `${b[0]} ${b.slice(1, 12)} ${b.slice(12)}`;
}

console.log(bits(1));
console.log(bits(0.1));
console.log((0.1).toPrecision(20));
console.log((1.005).toPrecision(20));
```

Output of `node bits.js` and of the browser terminal

```ts
0 01111111111 0000000000000000000000000000000000000000000000000000
0 01111111011 1001100110011001100110011001100110011001100110011010
0.10000000000000000555
1.0049999999999998934
```

The fraction of 0.1 is the repeating pattern `1001 1001 …`, cut off after 52 bits and rounded up at the end, like 2/3 written as 0.6667. So the number stored for `0.1` is slightly more than 0.1, and the number stored for `1.005` is slightly *less* than 1.005. `toPrecision(20)` prints 20 significant digits and shows the difference. When you just print `0.1`, JavaScript shows the *shortest* decimal that maps back to the same double, which is why you normally see `0.1`.

### Exact integers, and the gaps between numbers

53 significant bits means every whole number up to 253 = 9,007,199,254,740,992 fits exactly. Above that, the exponent has to grow, and the gap between neighbouring doubles becomes 2, then 4, then 8. Near 1, the gap is tiny: `Number.EPSILON`, about 2.2 × 10-16.

gaps.js

```ts
console.log(Number.MAX_SAFE_INTEGER, 2 ** 53 - 1 === Number.MAX_SAFE_INTEGER);
console.log(2 ** 53 + 1 === 2 ** 53, 2 ** 53 + 2);
console.log(Number.isSafeInteger(2 ** 53 - 1), Number.isSafeInteger(2 ** 53), Number.isInteger(2 ** 60));
console.log(Number.EPSILON, 1 + Number.EPSILON === 1, 1 + Number.EPSILON / 2 === 1);
console.log(1e16 + 1 === 1e16);
```

Output of `node gaps.js` and of the browser terminal

```ts
9007199254740991 true
true 9007199254740994
true false true
2.220446049250313e-16 false true
true
```

A **safe integer** is one that is exactly representable *and* not the rounded result of a different integer. 253 itself fails the second condition: 253 + 1 rounds to it. `Number.isInteger(2 ** 60)` is true because the value has no fraction, but it is not safe: many different integers round to it. That is exactly what happened to the order id, which is about 1.8 × 1018, two hundred times beyond the safe range.

> NOTE
>
> For money in kobo, the safe range reaches about ₦90 trillion. A single shop never gets near it; a national payment switch adding up a year of transfers can. The [BigInt](#bigint) section handles that case.

### The special values

A double can also hold three kinds of special value. They never throw; they spread quietly through calculations:

special.js

```ts
console.log(1 / 0, -1 / 0, Number.MAX_VALUE * 2);
console.log(0 / 0, Math.sqrt(-1), Number("12 bags"), NaN === NaN, Number.isNaN(NaN));
console.log(-0 === 0, Object.is(-0, 0), 1 / -0, String(-0), JSON.stringify(-0));
console.log(Math.round(-0.4), Object.is(Math.round(-0.4), -0), (-0.001).toFixed(2));

const prices = [];
console.log(Math.max(...prices), Math.min(...prices));
```

Output of `node special.js` and of the browser terminal

```ts
Infinity -Infinity Infinity
NaN NaN NaN false true
true false -Infinity 0 0
-0 true -0.00
-Infinity Infinity
```

- **Infinity** comes from overflow and from dividing by zero. A total that becomes `Infinity` passes every "is it a number?" check that only uses `typeof`.
- **NaN** ("not a number") comes from invalid operations. It is not equal to anything, including itself; test it with `Number.isNaN`.
- **Negative zero** exists because the sign bit is separate. It equals `0` with `===` and prints as `0` with `String`, but it shows up in `console.log`, in `toFixed` (a refund of `-0.001` naira printed as `-0.00`) and in `Object.is`. `Math.round(-0.4)` produces it.
- `Math.max()` of an empty list is `-Infinity`. A "highest price" on an empty category page prints nonsense unless you check the list first.

Use `Number.isFinite(x)` to accept only real numbers: it is false for `NaN`, `Infinity`, `-Infinity` and for anything that is not a number at all.

## Comparing decimals

Every arithmetic operation on doubles rounds its result to the nearest double. The rounding errors are tiny but they add up, and they depend on the order of operations. Even addition is not associative:

order.js

```ts
console.log(0.1 + 0.2 + 0.3, 0.3 + 0.2 + 0.1);
console.log((0.1 + 0.2) + 0.3 === 0.1 + (0.2 + 0.3));
console.log(1.15 * 100, Math.round(1.15 * 100));
console.log(1.005 * 100, Math.round(1.005 * 100));
```

Output of `node order.js` and of the browser terminal

```ts
0.6000000000000001 0.6
false
114.99999999999999 115
100.49999999999999 100
```

The last line is the dangerous one. ₦1.005 times 100 should be 100.5 kobo, which rounds to 101 with the usual half-up rule, but the stored 1.005 is a little less than 1.005, so the product is a little less than 100.5, and `Math.round` gives 100. No amount of "rounding afterwards" fixes a number that is already on the wrong side of the half.

When you must compare results of decimal calculations, such as measurements, exchange rates or statistics, compare with a **tolerance** instead of `===`. A tolerance relative to the size of the numbers works across magnitudes:

close-to.js

```ts
function nearlyEqual(a, b, relative = 1e-12) {
  if (a === b) return true;
  return Math.abs(a - b) <= relative * Math.max(Math.abs(a), Math.abs(b));
}

console.log(nearlyEqual(0.1 + 0.2, 0.3));
console.log(nearlyEqual(1e20 + 30000, 1e20));
console.log(nearlyEqual(0.3, 0.31));
console.log(Math.abs(1e20 + 30000 - 1e20) < Number.EPSILON);
```

Output of `node close-to.js` and of the browser terminal

```ts
true
true
false
false
```

The last line shows why `Number.EPSILON` alone is the wrong tolerance: it is the gap between doubles near *1*. Near 1020 the gap is 16,384, so an absolute tolerance of 2 × 10-16 would never match. For money, none of this should be necessary: keep amounts as whole kobo, where the arithmetic is exact, and do each unavoidable division once, with an explicit rounding rule.

## Rounding on purpose

A **rounding mode** is the rule for what happens to a value exactly halfway, or for which direction to go. JavaScript's built-in functions each follow a different one:

rounding.js

```ts
const values = [2.5, 3.5, -2.5, 2.4, -2.6];

console.log("value  round  floor  ceil  trunc  toFixed(0)");
for (const v of values) {
  console.log(
    String(v).padStart(5),
    String(Math.round(v)).padStart(6),
    String(Math.floor(v)).padStart(6),
    String(Math.ceil(v)).padStart(5),
    String(Math.trunc(v)).padStart(6),
    v.toFixed(0).padStart(11),
  );
}
```

Output of `node rounding.js` and of the browser terminal

```ts
value  round  floor  ceil  trunc  toFixed(0)
  2.5      3      2     3      2           3
  3.5      4      3     4      3           4
 -2.5     -2     -3    -2     -2          -3
  2.4      2      2     3      2           2
 -2.6     -3     -3    -2     -2          -3
```

- `Math.round` rounds halves *up*, towards +∞: -2.5 becomes -2. So a refund of -2.5 and a charge of 2.5 do not round symmetrically.
- `toFixed` rounds halves *away from zero*: -2.5 becomes -3. It also returns a **string**, and it rounds the stored double, not the decimal you typed (`(1.005).toFixed(2)` is `"1.00"`).
- `Math.trunc` drops the fraction; `Math.floor` goes down. They differ for negative numbers, which matters for integer division of refunds: `Math.trunc(-7 / 2)` is -3, `Math.floor(-7 / 2)` is -4.

Accounting systems often use **round half to even** (also called banker's rounding): a value exactly halfway goes to the nearest *even* number, so 2.5 becomes 2 and 3.5 becomes 4. Over many transactions, half the halves go up and half go down, so the total has no upward drift. When your data is already in kobo, you can implement any mode exactly with integer arithmetic. Here is a division of whole numbers with a chosen mode:

divide-round.js

```ts
function divideRound(numerator, denominator, mode = "halfUp") {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError("need safe integers and a positive denominator");
  }
  const quotient = Math.trunc(numerator / denominator);
  const remainder = numerator - quotient * denominator;
  if (remainder === 0) return quotient;
  const sign = numerator < 0 ? -1 : 1;
  const twice = 2 * Math.abs(remainder);
  if (twice < denominator) return quotient;
  if (twice > denominator) return quotient + sign;
  if (mode === "halfEven") return quotient % 2 === 0 ? quotient : quotient + sign;
  return quotient + sign;
}

// VAT of 7.5% (750 basis points) on 2,450 kobo = 183.75 kobo
console.log(divideRound(2450 * 750, 10000));
for (const kobo of [250, 350, -250, 251]) {
  console.log(kobo / 100, divideRound(kobo, 100, "halfUp"), divideRound(kobo, 100, "halfEven"));
}
```

Output of `node divide-round.js` and of the browser terminal

```ts
184
2.5 3 2
3.5 4 4
-2.5 -3 -2
2.51 3 3
```

The function never divides into a fraction it relies on: it compares twice the remainder with the denominator, both whole numbers, to decide "less than half", "exactly half" or "more than half". Its `halfUp` rounds halves away from zero (symmetric for charges and refunds), which is usually what people mean by "half up" for money. The `Math.trunc(numerator / denominator)` step is exact for safe integers, because the true quotient is never close enough to a whole number for the rounding of the double to cross it.

> TIP
>
> `Intl.NumberFormat` accepts a `roundingMode` option (`"halfEven"`, `"halfExpand"`, `"trunc"`, …) for *display*. Rounding for display and rounding for accounting are separate decisions: round the stored amount with your rule, then format it without further rounding.

## Turning text into numbers

Amounts arrive as text: from forms, CSV files, query strings. JavaScript has several converters, and they disagree about what counts as a number:

parse.js

```ts
const inputs = ["", "  12 ", "1,250.50", "1_000", "0x1F", "1e3", "Infinity", "12abc", ".5", null];

console.log("input".padEnd(12), "Number".padStart(7), "parseFloat".padStart(11));
for (const input of inputs) {
  console.log(JSON.stringify(input).padEnd(12), String(Number(input)).padStart(7), String(parseFloat(input)).padStart(11));
}
```

Output of `node parse.js` and of the browser terminal

```ts
input         Number  parseFloat
""                 0         NaN
"  12 "           12          12
"1,250.50"       NaN           1
"1_000"          NaN           1
"0x1F"            31           0
"1e3"           1000        1000
"Infinity"   Infinity    Infinity
"12abc"          NaN          12
".5"             0.5         0.5
null               0         NaN
```

Neither is safe for money. `Number("")` and `Number(null)` are 0, so an empty price field becomes free. `parseFloat("1,250.50")` stops at the comma and reads ₦1. Both accept `Infinity` and exponents, and `Number` accepts hexadecimal. And even for well-formed input, converting a decimal string to a double and multiplying by 100 can land on the wrong side of a half, as `1.005 * 100` showed.

The reliable approach treats the amount as *text* all the way to kobo: check the shape with a regular expression ([Regular expressions](https://zudojs.oyinlola.site/learn/js-regexp) covers the syntax), split at the decimal point, and build the integer from the digit strings. No fraction is ever stored in a double:

parse-kobo.js

```ts
function parseNairaToKobo(input) {
  const text = String(input).trim().replace(/^₦\s*/, "").replaceAll(",", "");
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error(`not an amount: ${JSON.stringify(input)}`);
  const [, sign, naira, kobo = ""] = match;
  const value = Number(naira) * 100 + Number(kobo.padEnd(2, "0"));
  if (!Number.isSafeInteger(value)) throw new RangeError(`amount too large: ${input}`);
  return sign === "-" ? -value : value;
}

for (const input of ["₦1,250.50", "1.005", "1.05", "0.5", "-20", " ₦ 3,000 ", "", "1e3", "12abc"]) {
  try {
    console.log(JSON.stringify(input), "->", parseNairaToKobo(input));
  } catch (error) {
    console.log(JSON.stringify(input), "->", error.message);
  }
}
```

Output of `node parse-kobo.js` and of the browser terminal

```ts
"₦1,250.50" -> 125050
"1.005" -> not an amount: "1.005"
"1.05" -> 105
"0.5" -> 50
"-20" -> -2000
" ₦ 3,000 " -> 300000
"" -> not an amount: ""
"1e3" -> not an amount: "1e3"
"12abc" -> not an amount: "12abc"
```

`1.005` is rejected instead of silently rounded: it has three decimal places, and kobo have two. Whether to reject or round sub-kobo input is a business decision, but it must be a *decision*, visible in the code. `Number(naira) * 100` is exact because both are integers and the result is checked to be safe. A thousands separator is removed before matching; this parser deliberately accepts only the Nigerian style (`1,250.50`), because `1.250,50` means the same amount in German and something very different here.

## BigInt: exact integers of any size

[Types in depth](https://zudojs.oyinlola.site/learn/js-types-deep#two-families) introduced `bigint`, the primitive for integers of any size, written with an `n` suffix. Its rules come from one principle: **JavaScript never converts between bigint and number silently**, because either direction can lose information.

bigint-rules.js

```ts
const id = BigInt("1844674407370955169");
console.log(id, id + 1n, typeof id);

console.log(10n / 3n, -7n / 2n, -7n % 2n);
console.log(1n < 2, 2n == 2, 2n === 2);

for (const attempt of [() => id + 1, () => Math.max(1n, 2n), () => BigInt(1.5), () => JSON.stringify({ id })]) {
  try {
    attempt();
  } catch (error) {
    console.log(`${error.name}: ${error.message}`);
  }
}

console.log(BigInt(2 ** 53 + 1), BigInt("9007199254740993"));
```

Output of `node bigint-rules.js` and of the browser terminal

```ts
1844674407370955169n 1844674407370955170n bigint
3n -3n -1n
true true false
TypeError: Cannot mix BigInt and other types, use explicit conversions
TypeError: Cannot convert a BigInt value to a number
RangeError: The number 1.5 cannot be converted to a BigInt because it is not an integer
TypeError: Do not know how to serialize a BigInt
9007199254740992n 9007199254740993n
```

- Create large bigints **from strings**. `BigInt(2 ** 53 + 1)` converts a number that was already rounded, so the bigint is exact but wrong.
- Division truncates towards zero, like `Math.trunc`: `-7n / 2n` is `-3n`. Rounding must be written by hand, as in `divideRound`.
- Comparisons across types work (`1n < 2`, `2n == 2`), but `===` is false because the types differ.
- `Math` functions accept only numbers, and `JSON.stringify` refuses bigints, because JSON readers in other languages might silently round them.

### Large ids through JSON

The refund bug needs the id as text or as a bigint *before* `JSON.parse` turns it into a double. The best fix is on the sending side: APIs should send 64-bit ids as JSON strings, `"orderId": "1844674407370955169"`. Twitter (now X) and Discord both send their 64-bit ids this way, for exactly this reason. When you do not control the sender, the `JSON.parse` **reviver** helps. The reviver is a function called for every value; its third argument gives the original source text of numbers, before rounding. For the way out, `JSON.rawJSON` inserts raw text into the output:

json-ids.js

```ts
const body = '{"orderId": 1844674407370955169, "amountKobo": 1250000, "fee": 1.5}';

const notice = JSON.parse(body, (key, value, context) =>
  key === "orderId" ? BigInt(context.source) : value,
);
console.log(notice);

const reply = JSON.stringify({ orderId: notice.orderId, status: "refunded" }, (key, value) =>
  typeof value === "bigint" ? JSON.rawJSON(value.toString()) : value,
);
console.log(reply);
console.log(JSON.stringify({ orderId: String(notice.orderId) }));
```

Output of `node json-ids.js` and of the browser terminal

```json
{ orderId: 1844674407370955169n, amountKobo: 1250000, fee: 1.5 }
{"orderId":1844674407370955169,"status":"refunded"}
{"orderId":"1844674407370955169"}
```

Reading the source text works in Node.js 24 and current browsers; older runtimes ignore the third argument. Inside your own program, keep ids as **strings** unless you do arithmetic on them. Ids are labels, and strings compare, store and serialise without any of these problems. Use `BigInt` when the numbers are real quantities.

### Totals beyond the safe range

A payment switch sums a year of transfers. In kobo, the total can pass 253. With numbers, the sum silently loses kobo; with bigints it stays exact, and formatting needs care so the result is not converted back to a number:

big-total.js

```ts
const transfersKobo = [9007199254740000, 991, 1, 1];

const asNumber = transfersKobo.reduce((sum, k) => sum + k, 0);
const asBigInt = transfersKobo.reduce((sum, k) => sum + BigInt(k), 0n);

console.log(asNumber, Number.isSafeInteger(asNumber));
console.log(asBigInt);

function koboToDecimalString(kobo) {
  const sign = kobo < 0n ? "-" : "";
  const abs = kobo < 0n ? -kobo : kobo;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}
console.log(koboToDecimalString(asBigInt), koboToDecimalString(-5n));
```

Output of `node big-total.js` and of the browser terminal

```ts
9007199254740992 false
9007199254740993n
90071992547409.93 -0.05
```

The number total is off by one kobo, and `isSafeInteger` is the only thing that notices. The decimal string is exact because it is built from integer division and remainder. Bigint arithmetic is slower than number arithmetic, so the usual pattern is: numbers for individual amounts (checked with `Number.isSafeInteger`), bigints for large aggregates and 64-bit ids that need arithmetic.

## Formatting with Intl.NumberFormat

`Intl.NumberFormat` turns a number into text for a given **locale**, a code like `en-NG` (English as used in Nigeria) that selects separators, symbols and conventions. Create a formatter once and call `format` many times:

formatting.js

```ts
const naira = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });
console.log(naira.format(1250000 / 100), naira.format(-2500), naira.format(0.5));

const options = [
  { currencyDisplay: "code" },
  { currencyDisplay: "name" },
  { currencySign: "accounting" },
  { signDisplay: "exceptZero" },
  { notation: "compact" },
  { maximumFractionDigits: 0 },
];
for (const extra of options) {
  const f = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", ...extra });
  console.log(JSON.stringify(extra).padEnd(30), f.format(-1250000.5), "|", f.format(1250000.5));
}
```

Output of `node formatting.js` and of the browser terminal

```ts
₦12,500.00 -₦2,500.00 ₦0.50
{"currencyDisplay":"code"}     -NGN 1,250,000.50 | NGN 1,250,000.50
{"currencyDisplay":"name"}     -1,250,000.50 Nigerian nairas | 1,250,000.50 Nigerian nairas
{"currencySign":"accounting"}  (₦1,250,000.50) | ₦1,250,000.50
{"signDisplay":"exceptZero"}   -₦1,250,000.50 | +₦1,250,000.50
{"notation":"compact"}         -₦1.3M | ₦1.3M
{"maximumFractionDigits":0}    -₦1,250,001 | ₦1,250,001
```

The same amount has many correct presentations: `accounting` puts negatives in parentheses as financial statements do, `compact` suits dashboards, and `code` is unambiguous in emails that cross borders. The formatter rounds for display only; it never changes your stored kobo.

### Locales, other currencies and exact input

locales.js

```ts
const amount = 1234567.5;
for (const [locale, currency] of [["en-NG", "NGN"], ["en-US", "NGN"], ["de-DE", "EUR"], ["en-IN", "INR"], ["ja-JP", "JPY"]]) {
  const f = new Intl.NumberFormat(locale, { style: "currency", currency });
  console.log(locale.padEnd(6), currency, f.format(amount), f.resolvedOptions().maximumFractionDigits);
}

const naira = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });
console.log(naira.format(9007199254740993 / 100));
console.log(naira.format("90071992547409.93"));
console.log(naira.format(123456789012345678n));

const percent = new Intl.NumberFormat("en-NG", { style: "percent", maximumFractionDigits: 1 });
const kg = new Intl.NumberFormat("en-NG", { style: "unit", unit: "kilogram" });
console.log(percent.format(0.075), kg.format(2.5));
const range = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).formatRange(5000, 10000);
console.log(range.replace(/\s/g, ""));
```

Output of `node locales.js` and of the browser terminal

```ts
en-NG  NGN ₦1,234,567.50 2
en-US  NGN NGN 1,234,567.50 2
de-DE  EUR 1.234.567,50 € 2
en-IN  INR ₹12,34,567.50 2
ja-JP  JPY ￥1,234,568 0
₦90,071,992,547,409.92
₦90,071,992,547,409.93
₦123,456,789,012,345,678.00
7.5% 2.5 kg
₦5,000–₦10,000
```

- The **locale** decides the separators and symbol position; the **currency** decides the symbol and how many decimals. `en-US` writes the naira as `NGN`, because the `₦` symbol would be unfamiliar there. The yen has no minor unit, so it has 0 decimals.
- `format` also accepts a **decimal string** and a **bigint**, and formats them exactly. Passing the number `9007199254740993 / 100` already lost a kobo before the formatter saw it. Pass exact values with `koboToDecimalString` from the previous section.
- Percent style multiplies by 100: pass `0.075` for 7.5%.
- `formatRange` formats a price range. The spaces around the dash differ between engines (Node.js and Chrome ship different versions of the locale data, and some use thin or no-break spaces), so the example removes them before printing. Never compare formatted text in tests across runtimes; compare the numbers.

> toFixed and Intl disagree
>
> (1.005).toFixed(2) is `"1.00"`, because `toFixed` rounds the stored double, which is just below 1.005. `Intl.NumberFormat` with two decimals gives `"1.01"`, because it starts from the shortest decimal that represents the double, `1.005`, and rounds that. Two parts of the same app using different formatters can show different amounts. Round the kobo yourself, once, and then format a value that needs no rounding.

## Before you build: a money module

REASON IT OUT

### Where can a naira amount go wrong between the form and the receipt?

You will write a small money module: parse what a cashier types, apply a percentage (VAT or a discount) with an explicit rounding rule, add up a cart, and format for display. Before reading the code, decide:

- Which inputs must the parser reject? Think of `""`, `"1e3"`, `"0x10"`, `"1.005"`, `"1.250,50"`, `"Infinity"`, a number instead of a string, and 30 digits.
- A 7.5% VAT is stored how? As `0.075`, as `7.5`, or as something else? Which rounding rule, and applied where?
- What should `sumKobo` do if the total leaves the safe range? Silently switch to bigint, or refuse?
- What should the formatter accept: numbers, bigints, strings? What should it refuse?

**Show the reasoning**

- Accept only an optional `₦`, optional minus, digits with optional commas and at most two decimals. Reject everything else with an error that quotes the input, so bad CSV rows are easy to find. Accept a string only: a number has already been through floating point, so `parseNairaToKobo(1.005)` could not know what the user typed. Reject more than two decimals rather than rounding, unless the business says otherwise.
- Store rates as integer **basis points** (7.5% = 750) so the only division is the final one, done by `divideRound` with a named mode. Round once per line or once per total, as the business decides, and never round the same amount twice.
- Refuse. A function that returns a number sometimes and a bigint other times forces every caller to handle both. Throwing a `RangeError` makes the rare case loud; code that handles national-scale totals uses a separate bigint path on purpose.
- The formatter takes safe-integer kobo, or bigint kobo, and builds an exact decimal string for `Intl.NumberFormat`. It refuses fractional kobo, `NaN` and unsafe numbers, which are always bugs upstream.

## Build: the money module

money.js

```ts
const nairaFormat = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });

export function parseNairaToKobo(input) {
  if (typeof input !== "string") throw new TypeError(`amount must be text, got ${typeof input}`);
  const text = input.trim().replace(/^₦\s*/, "");
  const match = /^(-?)(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error(`not an amount: ${JSON.stringify(input)}`);
  const [, sign, naira, kobo = ""] = match;
  const value = Number(naira.replaceAll(",", "")) * 100 + Number(kobo.padEnd(2, "0"));
  if (!Number.isSafeInteger(value)) throw new RangeError(`amount too large: ${input}`);
  return sign === "-" ? -value : value;
}

export function divideRound(numerator, denominator, mode = "halfUp") {
  if (mode !== "halfUp" && mode !== "halfEven") throw new RangeError(`unknown rounding mode: ${mode}`);
  const quotient = Math.trunc(numerator / denominator);
  const remainder = numerator - quotient * denominator;
  const sign = numerator < 0 ? -1 : 1;
  const twice = 2 * Math.abs(remainder);
  if (remainder === 0 || twice < denominator) return quotient;
  if (twice > denominator || mode === "halfUp") return quotient + sign;
  return quotient % 2 === 0 ? quotient : quotient + sign;
}

export function percentOfKobo(kobo, basisPoints, mode = "halfUp") {
  const product = kobo * basisPoints;
  if (!Number.isSafeInteger(product)) throw new RangeError("amount x rate is too large");
  return divideRound(product, 10000, mode);
}

export function sumKobo(amounts) {
  let total = 0;
  for (const kobo of amounts) {
    if (!Number.isSafeInteger(kobo)) throw new TypeError(`not whole kobo: ${kobo}`);
    total += kobo;
    if (!Number.isSafeInteger(total)) throw new RangeError("total is outside the safe range; use bigint");
  }
  return total;
}

export function formatKobo(kobo) {
  if (typeof kobo === "number" && !Number.isSafeInteger(kobo)) throw new TypeError(`not whole kobo: ${kobo}`);
  const big = BigInt(kobo);
  const abs = big < 0n ? -big : big;
  const text = `${big < 0n ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
  return nairaFormat.format(text);
}
```

The thousands pattern `\d{1,3}(?:,\d{3})*` accepts `1,250` and `1250` but rejects `12,50`, which is probably a European decimal comma typed by mistake. `formatKobo` converts to bigint internally so that numbers and bigints share one exact path. Now a cart with VAT, the way a till would use it:

till.js

```ts
import { formatKobo, parseNairaToKobo, percentOfKobo, sumKobo } from "./money.js";

const VAT_BP = 750;
const typed = [
  { name: "Sachet water x3", price: "73.50" },
  { name: "Bread", price: "₦1,200" },
  { name: "Palm oil 1L", price: "2,450.25" },
];

const lines = typed.map((line) => {
  const kobo = parseNairaToKobo(line.price);
  return { ...line, kobo, vat: percentOfKobo(kobo, VAT_BP) };
});

for (const line of lines) {
  console.log(line.name.padEnd(16), formatKobo(line.kobo).padStart(10), "VAT", formatKobo(line.vat));
}
const net = sumKobo(lines.map((l) => l.kobo));
const vat = sumKobo(lines.map((l) => l.vat));
console.log("Net".padEnd(16), formatKobo(net).padStart(10));
console.log("VAT".padEnd(16), formatKobo(vat).padStart(10));
console.log("Total".padEnd(16), formatKobo(net + vat).padStart(10));
console.log(formatKobo(123456789012345678n), formatKobo(-5));

for (const bad of ["1.005", "12,50", "", "1e3"]) {
  try {
    parseNairaToKobo(bad);
  } catch (error) {
    console.log(error.message);
  }
}
```

Output of `node till.js` and of the browser terminal

```ts
Sachet water x3      ₦73.50 VAT ₦5.51
Bread             ₦1,200.00 VAT ₦90.00
Palm oil 1L       ₦2,450.25 VAT ₦183.77
Net               ₦3,723.75
VAT                 ₦279.28
Total             ₦4,003.03
₦1,234,567,890,123,456.78 -₦0.05
not an amount: "1.005"
not an amount: "12,50"
not an amount: ""
not an amount: "1e3"
```

VAT is rounded per line and the total VAT is the sum of the rounded lines, so the printed receipt always adds up. Every value between the typed text and the printed text was an integer.

## Testing number code

Number bugs live at boundaries: halves, negative numbers, zero, the safe-integer edge and malformed text. Test those explicitly, and add a **round-trip property**: for many kobo values, formatting and parsing back must return the same value. A small deterministic generator (the same sequence on every run) gives thousands of inputs without making the test random:

money.test.js

```ts
import { divideRound, formatKobo, parseNairaToKobo, percentOfKobo, sumKobo } from "./money.js";

function check(label, actual, expected) {
  const ok = Object.is(actual, expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${label} -> ${String(actual)}`);
}

function errorOf(fn) {
  try {
    fn();
    return "no error";
  } catch (error) {
    return error.name;
  }
}

check("parse 1.05 exactly", parseNairaToKobo("1.05"), 105);
check("parse 0.5", parseNairaToKobo("0.5"), 50);
check("parse negative", parseNairaToKobo("-20"), -2000);
check("parse with commas", parseNairaToKobo("₦1,234,567.89"), 123456789);
check("European comma refused", errorOf(() => parseNairaToKobo("12,50")), "Error");
check("half up away from zero", divideRound(-250, 100), -3);
check("half even down", divideRound(250, 100, "halfEven"), 2);
check("half even up", divideRound(350, 100, "halfEven"), 4);
check("VAT on 2,450 kobo", percentOfKobo(2450, 750), 184);
check("VAT of zero is +0", Object.is(percentOfKobo(0, 750), 0), true);
check("unsafe total refused", errorOf(() => sumKobo([Number.MAX_SAFE_INTEGER, 1])), "RangeError");
check("fraction refused", errorOf(() => sumKobo([10.5])), "TypeError");
check("number input refused", errorOf(() => parseNairaToKobo(1.05)), "TypeError");
check("format -5 kobo", formatKobo(-5), "-₦0.05");

let seed = 42;
const next = () => (seed = (seed * 48271) % 2147483647);
let failures = 0;
for (let i = 0; i < 5000; i++) {
  const kobo = (next() - 1073741824) * 3;
  const text = formatKobo(kobo).replace("₦", "");
  if (parseNairaToKobo(text) !== kobo) failures++;
}
check("5000 round trips", failures, 0);
```

Output of `node money.test.js` and of the browser terminal

```ts
PASS parse 1.05 exactly -> 105
PASS parse 0.5 -> 50
PASS parse negative -> -2000
PASS parse with commas -> 123456789
PASS European comma refused -> Error
PASS half up away from zero -> -3
PASS half even down -> 2
PASS half even up -> 4
PASS VAT on 2,450 kobo -> 184
PASS VAT of zero is +0 -> true
PASS unsafe total refused -> RangeError
PASS fraction refused -> TypeError
PASS number input refused -> TypeError
PASS format -5 kobo -> -₦0.05
PASS 5000 round trips -> 0
```

The generator is a **linear congruential generator**, a very old formula for pseudo-random numbers. Its multiplier is small on purpose: `seed * 48271` stays below 253, so every step is exact integer arithmetic. It is useless for security, but perfect for tests: seed 42 always produces the same 5,000 amounts, including negative ones, so a failure can be reproduced. Notice that the round trip goes through `formatKobo`, which prints `-₦…`, and the test removes the symbol because the parser expects the minus before it.

## In production

- **Store money as integers in the smallest unit.** In PostgreSQL use `bigint` kobo (or `numeric` for rates and exchange calculations). The `pg` driver returns both `bigint` and `numeric` columns as *strings* by default, precisely to avoid the rounding in this lesson; convert deliberately.
- **Keep the currency with the amount.** `{ kobo: 125000, currency: "NGN" }`, never a bare number. Minor units differ: 2 decimals for NGN, 0 for JPY, 3 for KWD. `new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits` tells you.
- **Rates as basis points or as decimal strings**, never as floating-point multipliers stored in configuration.
- **Validate numbers from outside with `Number.isSafeInteger` or `Number.isFinite`**, not with `typeof x === "number"`, which lets `NaN` and `Infinity` in. A JSON body with `"quantity": 1e308` is valid JSON.
- **Send 64-bit ids as strings in JSON** and keep them as strings in your code.
- **Never use `Math.random()` for anything secret** (tokens, OTPs, coupon codes). It is predictable. Use `crypto.getRandomValues` or Node's `crypto.randomInt`, covered in [Cryptography with node:crypto](https://zudojs.oyinlola.site/learn/node-crypto).
- **Create `Intl.NumberFormat` objects once** and reuse them; building one loads locale data.

## Practice

TRY IT YOURSELF

### A discount that never goes negative

Write `applyDiscount(kobo, basisPoints)` that takes a percentage off an amount, rounding the discount half-even, and never returns less than 0 or more than the original. Test it on ₦25.50 at 10%, on ₦0.05 at 50%, and with an invalid rate of 12,000 basis points (120%), which should throw.

**Show a solution**

discount.js

```ts
function divideRoundHalfEven(numerator, denominator) {
  const quotient = Math.trunc(numerator / denominator);
  const twice = 2 * Math.abs(numerator - quotient * denominator);
  const sign = numerator < 0 ? -1 : 1;
  if (twice < denominator) return quotient;
  if (twice > denominator) return quotient + sign;
  return quotient % 2 === 0 ? quotient : quotient + sign;
}

function applyDiscount(kobo, basisPoints) {
  if (!Number.isSafeInteger(kobo) || kobo < 0) throw new RangeError(`bad amount: ${kobo}`);
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) {
    throw new RangeError(`bad rate: ${basisPoints}`);
  }
  const discount = divideRoundHalfEven(kobo * basisPoints, 10000);
  return kobo - discount;
}

console.log(applyDiscount(2550, 1000));
console.log(applyDiscount(5, 5000));
try {
  applyDiscount(2550, 12000);
} catch (error) {
  console.log(error.message);
}
```

Output of `node discount.js` and of the browser terminal

```ts
2295
3
bad rate: 12000
```

The discount on ₦25.50 is 255 kobo exactly. Half of 5 kobo is 2.5 kobo; half-even rounds it to 2, so the customer pays 3 kobo. Validating the rate is what stops a typo in configuration from producing negative prices.

TRY IT YOURSELF

### Parse ids safely

An API returns `{"items":[{"id":9007199254740993,"qty":2},{"id":9007199254740995,"qty":1}]}`. Parse it so that every `id` becomes a **string** with the exact digits, and print the ids and the total quantity.

**Show a solution**

parse-ids.js

```ts
const body = '{"items":[{"id":9007199254740993,"qty":2},{"id":9007199254740995,"qty":1}]}';

const data = JSON.parse(body, (key, value, context) =>
  key === "id" && typeof value === "number" ? context.source : value,
);

console.log(data.items.map((item) => item.id));
console.log(data.items.reduce((sum, item) => sum + item.qty, 0));
console.log(JSON.parse(body).items.map((item) => item.id));
```

Output of `node parse-ids.js` and of the browser terminal

```json
[ '9007199254740993', '9007199254740995' ]
3
[ 9007199254740992, 9007199254740996 ]
```

The last line shows what plain `JSON.parse` does: both ids are rounded to the nearest double, `…993` down to `…992` and `…995` up to `…996`. Neither is the product that was ordered. The reviver takes `context.source`, the original digits, only for numeric `id` values.

TRY IT YOURSELF

### Format a bank statement column

Write `statementLine(label, kobo)` that prints the label padded to 14 characters and the amount formatted with `currencySign: "accounting"` (negatives in parentheses), right-aligned to 14 characters. Use it for an opening balance of ₦150,000, a transfer out of ₦45,250.50 and a fee of ₦53.75.

**Show a solution**

statement.js

```ts
const accounting = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  currencySign: "accounting",
});

function statementLine(label, kobo) {
  const abs = Math.abs(kobo);
  const text = `${kobo < 0 ? "-" : ""}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return `${label.padEnd(14)}${accounting.format(text).padStart(14)}`;
}

const rows = [["Opening", 15000000], ["Transfer out", -4525050], ["SMS fee", -5375]];
for (const [label, kobo] of rows) console.log(statementLine(label, kobo));
console.log(statementLine("Closing", rows.reduce((sum, [, kobo]) => sum + kobo, 0)));
```

Output of `node statement.js` and of the browser terminal

```ts
Opening          ₦150,000.00
Transfer out    (₦45,250.50)
SMS fee             (₦53.75)
Closing          ₦104,695.75
```

Building the decimal string from integer division and remainder keeps the amounts exact, and the accounting style adds the parentheses. The closing balance is computed in kobo, never from the formatted text.

## Recap

- A number is an IEEE 754 double: sign, exponent and 53 significant bits. Integers are exact up to 253 − 1 (`Number.MAX_SAFE_INTEGER`); beyond that, neighbouring doubles are 2, 4, 8… apart.
- Most decimal fractions are stored approximately; each operation rounds again, and the order of operations changes results. Compare decimals with a relative tolerance, and keep money in integer kobo.
- `Infinity`, `NaN` and `-0` never throw. Accept outside numbers with `Number.isSafeInteger` or `Number.isFinite`.
- `Math.round` rounds halves towards +∞, `toFixed` away from zero and on the stored double. Choose a rounding mode on purpose and implement it on integers.
- Parse amounts as text into kobo; never multiply a parsed decimal by 100.
- `bigint` is exact at any size and never mixes silently with numbers. Create it from strings, round divisions yourself, and handle JSON with a reviver's source text or by sending ids as strings.
- `Intl.NumberFormat` formats currencies, percentages, units and compact numbers per locale, and formats strings and bigints exactly. Reuse formatters.

Next: [Collections in depth](https://zudojs.oyinlola.site/learn/js-collections), where `Map`, `Set` and the weak collections become caches, de-duplicators and private storage.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
