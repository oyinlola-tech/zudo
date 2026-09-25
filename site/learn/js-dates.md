---
title: "Dates and time zones — ZudoJS Academy"
description: "Understand what a Date really stores, parse and format instants safely across Africa/Lagos and UTC, do calendar arithmetic, and store dates correctly in APIs."
source: https://zudojs.oyinlola.site/learn/js-dates
---

LEVEL 4 · LESSON 7 OF 20

Built-in objects Core

# Dates and time zones

Understand what a Date really stores, parse and format instants safely across Africa/Lagos and UTC, do calendar arithmetic, and store dates correctly in APIs.

- **55 min** to read and try
- **You need:** Numbers in depth, Strings in depth, and Collections in depth
- **You build:** A delivery-date estimator for a Lagos shop that handles the order cut-off, weekends and public holidays the same way on any server, with tests that pin the time zone

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain that a Date is one instant counted in milliseconds from the Unix epoch, with no time zone inside
- Tell apart UTC, offsets and IANA time zones, and show any instant as wall time in a chosen zone
- Recognise the parsing rules that make the same string mean different instants on different machines
- Do calendar arithmetic (days, months, business days) without time-zone and month-end bugs
- Store and exchange instants and calendar dates correctly in JSON and databases
- Describe what the Temporal API adds and when it can be used

## The order placed "yesterday"

A Lagos shop promises delivery two days after the order date. Its server runs in a cloud data centre, and the confirmation email is built like this:

naive-email.js

```ts
const placedAt = new Date("2026-03-03T23:30:00Z");

const orderDate = placedAt.toISOString().slice(0, 10);
const delivery = new Date(placedAt.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

console.log(`Order placed on ${orderDate}, delivery by ${delivery}`);

const lagos = new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", dateStyle: "full", timeStyle: "short" });
console.log("The customer's clock said:", lagos.format(placedAt));
```

Output of `node naive-email.js` and of the browser terminal

```ts
Order placed on 2026-03-03, delivery by 2026-03-05
The customer's clock said: Wednesday, 4 March 2026 at 00:30
```

The customer ordered just after midnight on Wednesday, Lagos time. The email says Tuesday, and promises delivery on Thursday, one day earlier than the shop's real promise. Every order placed between midnight and 01:00 in Lagos gets the wrong date, because `toISOString` always shows **UTC** (Coordinated Universal Time, the world's reference clock), and Lagos is one hour ahead of it.

Dates look simple because everybody uses them every day. In software they combine three different ideas that people normally blend together: an *instant* (a moment that is the same everywhere), a *wall time* (what a clock on the wall shows in one place) and a *calendar date* (a day, such as a birthday or a delivery day, which has no time at all). This lesson separates them, and then builds a delivery estimator that gets all three right.

## What a Date really stores

A `Date` object holds exactly one number: the count of milliseconds since the **Unix epoch**, 1 January 1970 at 00:00:00 UTC. That number is called a **timestamp**. It identifies an instant and contains *no time zone*: 1,772,580,600,000 ms after the epoch is the same moment in Lagos, London and Tokyo.

timestamp.js

```ts
const placedAt = new Date("2026-03-03T23:30:00Z");

console.log(placedAt.getTime(), placedAt.valueOf(), +placedAt);
console.log(Date.UTC(2026, 2, 3, 23, 30));
console.log(new Date(0).toISOString());
console.log(new Date(1772580600000).toISOString());

const later = new Date("2026-03-04T01:00:00Z");
console.log(later - placedAt, "ms =", (later - placedAt) / 60000, "minutes");
```

Output of `node timestamp.js` and of the browser terminal

```ts
1772580600000 1772580600000 1772580600000
1772580600000
1970-01-01T00:00:00.000Z
2026-03-03T23:30:00.000Z
5400000 ms = 90 minutes
```

- `getTime()`, `valueOf()` and unary `+` all return the timestamp. Subtracting two dates subtracts their timestamps.
- `Date.UTC(year, monthIndex, day, hours, minutes)` builds a timestamp from UTC parts. **Months count from 0**: 2 is March. This is the single most common date bug in JavaScript.
- A Date can represent about 273,790 years either side of 1970 (±8.64 × 1015 ms). Anything outside, or anything unparseable, becomes an **Invalid Date** whose timestamp is `NaN`.

invalid.js

```ts
const bad = new Date("31/12/2026");
console.log(bad.getTime(), String(bad), Number.isNaN(bad.getTime()));

try {
  bad.toISOString();
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
console.log(JSON.stringify({ deliveredAt: bad }));
```

Output of `node invalid.js` and of the browser terminal

```ts
NaN Invalid Date true
RangeError: Invalid time value
{"deliveredAt":null}
```

An invalid date does not throw when created. It surfaces later: `toISOString` throws, and `JSON.stringify` silently writes `null`. Check `Number.isNaN(date.getTime())` right after parsing.

### Local getters depend on the machine

Because a Date holds no zone, methods like `getHours()` and `toString()` have to pick one. They use the **local time zone of the machine running the code**. The same program gives different answers on a laptop in Lagos, a CI server in UTC and a colleague's laptop in New York. Node.js reads the zone from the `TZ` environment variable, so this example sets it to show the effect (it is Node-only, because a browser always uses the computer's own zone):

local-getters.jsNode.js only

```ts
const placedAt = new Date("2026-03-03T23:30:00Z");

for (const zone of ["UTC", "Africa/Lagos", "America/New_York", "Asia/Tokyo"]) {
  process.env.TZ = zone;
  console.log(zone.padEnd(17), placedAt.getDate(), placedAt.getHours(), "|", placedAt.getUTCDate(), placedAt.getUTCHours());
}
```

Output of `node local-getters.js`

```ts
UTC               3 23 | 3 23
Africa/Lagos      4 0 | 3 23
America/New_York  3 18 | 3 23
Asia/Tokyo        4 8 | 3 23
```

The `getUTC…` methods give the same answer everywhere; the local ones do not. On a server, treat `getHours`, `getDate`, `setHours`, `toString` and the `new Date(year, month, day)` constructor as bugs waiting for a deployment in another region. When you need the wall time of a *particular* place, ask `Intl.DateTimeFormat` for it by name, as the next section shows.

## UTC, offsets and time zones

Three terms are often mixed up:

- **UTC** is the reference clock. It never changes for summer.
- An **offset** is a fixed difference from UTC at one moment, written `+01:00` or `-05:00`.
- A **time zone** is a region's rules for which offset applies *when*, including **daylight saving time** (DST), when clocks move forward in summer. Time zones have names from the IANA time zone database, such as `Africa/Lagos`, `Europe/London` and `America/New_York`.

Lagos uses +01:00 all year (West Africa Time, no DST). London uses +00:00 in winter and +01:00 in summer. So "the offset of London" has no answer without a date, which is why you store zone names, not offsets. `Intl.DateTimeFormat` with a `timeZone` option shows an instant as wall time in any zone, independent of the machine:

zones.js

```ts
const zones = ["UTC", "Africa/Lagos", "Europe/London", "America/New_York"];
const winter = Date.UTC(2026, 0, 15, 12, 0);
const summer = Date.UTC(2026, 6, 15, 12, 0);

for (const timeZone of zones) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset" });
  console.log(timeZone.padEnd(17), f.format(winter).padEnd(12), f.format(summer));
}
```

Output of `node zones.js` and of the browser terminal

```ts
UTC               12:00 GMT+0  12:00 GMT+0
Africa/Lagos      13:00 GMT+1  13:00 GMT+1
Europe/London     12:00 GMT+0  13:00 GMT+1
America/New_York  07:00 GMT-5  08:00 GMT-4
```

In January, London and Lagos show different times; in July they show the same time. Code that stored "London is +0" in January would be an hour wrong all summer.

### Days that are not 24 hours long

On the day DST starts, a local day has 23 hours; when it ends, 25. Adding 24 hours of milliseconds is then not the same as "the same time tomorrow":

dst.js

```ts
const london = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" });
const dayMs = 24 * 60 * 60 * 1000;

const saturdayNoon = Date.UTC(2026, 2, 28, 12, 0);
console.log(london.format(saturdayNoon));
console.log(london.format(saturdayNoon + dayMs));
```

Output of `node dst.js` and of the browser terminal

```ts
28 Mar 2026, 12:00
29 Mar 2026, 13:00
```

A London customer who books a "same time tomorrow" delivery at noon gets 13:00. For Lagos customers this never happens, but a shop that ships to London, or a server scheduling in `Europe/London`, has to care. The rule: **durations** (a 30-minute payment window, a 24-hour token) are milliseconds on the timeline; **calendar steps** ("tomorrow at noon", "next month") must be done in the calendar of a specific zone.

## Parsing: the same string, different instants

The `Date` constructor and `Date.parse` accept strings. Only one format is fully specified: the ISO 8601 subset `YYYY-MM-DDTHH:mm:ss.sssZ`, with `Z` or an offset such as `+01:00` at the end. The rules around it are the traps:

| String | Interpreted as |
| --- | --- |
| `2026-03-04T09:00:00Z` | UTC. Same everywhere. |
| `2026-03-04T09:00:00+01:00` | That offset. Same everywhere. |
| `2026-03-04` (date only) | Midnight **UTC**. |
| `2026-03-04T09:00` (date-time, no zone) | **Local time of the machine**. |
| `03/04/2026`, `4 March 2026`, … | Implementation-defined; in practice local time, and `03/04` is read as March 4 (US order). |

A date-only string and a date-time string without a zone use *different* zones. Here is the same program on two servers:

parse-local.jsNode.js only

```ts
for (const zone of ["UTC", "Africa/Lagos"]) {
  process.env.TZ = zone;
  console.log(zone.padEnd(13),
    new Date("2026-03-04").toISOString(),
    new Date("2026-03-04T09:00").toISOString(),
    new Date("03/04/2026").toISOString());
}
```

Output of `node parse-local.js`

```ts
UTC           2026-03-04T00:00:00.000Z 2026-03-04T09:00:00.000Z 2026-03-04T00:00:00.000Z
Africa/Lagos  2026-03-04T00:00:00.000Z 2026-03-04T08:00:00.000Z 2026-03-03T23:00:00.000Z
```

A delivery slot sent by a form as `2026-03-04T09:00` means 09:00 UTC on one server and 08:00 UTC on another. A test suite written on a laptop in Lagos can pass there and fail in CI.

### Parsers that accept nonsense

V8, the engine in Node.js and Chrome, is also generous with impossible values. February has no 30th, yet:

parse-lenient.js

```ts
console.log(new Date("2026-02-30T00:00:00Z").toISOString());
console.log(new Date("2026-03-04T24:00:00Z").toISOString());
console.log(Date.parse("2026-13-01T00:00:00Z"), Date.parse("31/12/2026"));
```

Output of `node parse-lenient.js` and of the browser terminal

```ts
2026-03-02T00:00:00.000Z
2026-03-05T00:00:00.000Z
NaN NaN
```

February 30th silently becomes March 2nd. (Firefox rejects it, so this is not even consistent between browsers.) `24:00` is valid ISO and means midnight at the end of the day. Month 13 is rejected. For data from outside your program, use a strict parser: a regular expression that demands the full format with a zone, plus a round-trip check that the parsed instant prints back as the same fields:

strict-parse.js

```ts
const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

function parseInstant(text) {
  const match = ISO_INSTANT.exec(text);
  if (!match) throw new Error(`not an ISO instant with a zone: ${JSON.stringify(text)}`);
  const [, y, mo, d] = match;
  const ms = Date.parse(text);
  const check = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  const sameDay = check.getUTCFullYear() === Number(y) && check.getUTCMonth() === Number(mo) - 1 && check.getUTCDate() === Number(d);
  if (Number.isNaN(ms) || !sameDay) throw new Error(`impossible date: ${text}`);
  return new Date(ms);
}

for (const text of ["2026-03-04T09:00:00+01:00", "2026-03-04T09:00Z", "2026-02-30T00:00:00Z", "2026-03-04T09:00", "04/03/2026"]) {
  try {
    console.log(parseInstant(text).toISOString());
  } catch (error) {
    console.log(error.message);
  }
}
```

Output of `node strict-parse.js` and of the browser terminal

```ts
2026-03-04T08:00:00.000Z
2026-03-04T09:00:00.000Z
impossible date: 2026-02-30T00:00:00Z
not an ISO instant with a zone: "2026-03-04T09:00"
not an ISO instant with a zone: "04/03/2026"
```

The round-trip check builds the calendar day with `Date.UTC` and confirms it did not roll over into another month. A string without a zone is refused rather than guessed: the caller must say which zone it meant. [Regular expressions](https://zudojs.oyinlola.site/learn/js-regexp) explains the pattern.

## Formatting for people and for machines

Two audiences, two tools. For machines (JSON, logs, databases), `toISOString()` gives an unambiguous UTC string, and `JSON.stringify` uses it automatically through `Date.prototype.toJSON`. For people, `Intl.DateTimeFormat` formats in their language *and* their zone. Always pass `timeZone`; without it you get the machine's zone.

format.js

```ts
const deliveryAt = new Date("2026-03-06T13:05:00Z");

console.log(JSON.stringify({ deliveryAt }));

const styles = [
  { dateStyle: "full", timeStyle: "short" },
  { dateStyle: "medium" },
  { weekday: "long", day: "numeric", month: "long" },
  { hour: "numeric", minute: "2-digit", hour12: true },
  { dateStyle: "short", timeStyle: "long" },
];
for (const style of styles) {
  const f = new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", ...style });
  console.log(f.format(deliveryAt));
}
console.log(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" }).format(deliveryAt));
console.log(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "full", timeStyle: "short" }).format(deliveryAt));
```

Output of `node format.js` and of the browser terminal

```json
{"deliveryAt":"2026-03-06T13:05:00.000Z"}
Friday, 6 March 2026 at 14:05
6 Mar 2026
Friday, 6 March
2:05 pm
06/03/2026, 14:05:00 WAT
Friday, March 6, 2026 at 8:05 AM
vendredi 6 mars 2026 à 14:05
```

### Reading parts: the wall clock of a zone

Formatting gives text for display. Logic needs numbers: "what is the date and hour in Lagos right now?". `formatToParts` returns the pieces of a formatted date as an array of `{ type, value }` objects, which you can turn into numbers. Use a fixed locale such as `"en-US"` with numeric fields and `hourCycle: "h23"`, so the parts are predictable:

wall-clock.js

```ts
const partsFormats = new Map();

export function wallClock(instant, timeZone) {
  if (!partsFormats.has(timeZone)) {
    partsFormats.set(timeZone, new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23",
      year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
    }));
  }
  const fields = {};
  for (const { type, value } of partsFormats.get(timeZone).formatToParts(instant)) {
    if (type !== "literal") fields[type] = Number(value);
  }
  return fields;
}

export function toDateString({ year, month, day }) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
```

wall-demo.js

```ts
import { toDateString, wallClock } from "./wall-clock.js";

const placedAt = new Date("2026-03-03T23:30:00Z");
console.log(wallClock(placedAt, "Africa/Lagos"));
console.log(toDateString(wallClock(placedAt, "Africa/Lagos")), toDateString(wallClock(placedAt, "UTC")));
```

Output of `node wall-demo.js` and of the browser terminal

```json
{ month: 3, day: 4, year: 2026, hour: 0, minute: 30, second: 0 }
2026-03-04 2026-03-03
```

This is the fix for the email in the first section: the order date is the calendar date *in the shop's zone*, `2026-03-04`. The formatters are cached per zone in a `Map` ([Collections in depth](https://zudojs.oyinlola.site/learn/js-collections)), because building one is much slower than using it.

### Relative times and ranges

relative.js

```ts
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
console.log(rtf.format(2, "day"), "|", rtf.format(-1, "day"), "|", rtf.format(0, "day"), "|", rtf.format(-3, "hour"));

const dates = new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium" });
console.log(dates.formatRange(Date.UTC(2026, 2, 4), Date.UTC(2026, 2, 6)));
console.log(dates.formatRange(Date.UTC(2026, 2, 30), Date.UTC(2026, 3, 2)).replace(/\s/g, " "));
```

Output of `node relative.js` and of the browser terminal

```ts
in 2 days | yesterday | today | 3 hours ago
4–6 Mar 2026
30 Mar – 2 Apr 2026
```

The `replace(/\s/g, " ")` on the last line is there for a real reason: `Intl` output may contain special spaces (no-break, thin, narrow no-break), and which ones depends on the version of the locale data. Node.js 24 puts thin spaces around that dash and Chromium puts normal ones, so the raw strings are not equal. Never compare formatted dates or amounts byte-for-byte in tests across runtimes; normalise the spaces or compare the parts. `RelativeTimeFormat` formats a number you give it; it does not compute the difference. You decide what "now" is, which keeps tests deterministic: pass the reference time in, never read the clock inside the formatting code.

## Date arithmetic

Separate two kinds of value before you calculate:

- **Instants** (a payment at 23:30 UTC): add and subtract milliseconds.
- **Calendar dates** (a delivery day, a due date, a birthday): a year, month and day with no time and no zone. Store them as `"YYYY-MM-DD"` strings and do arithmetic on them in UTC, where every day has exactly 24 hours.

calendar-math.js

```ts
const DAY_MS = 86_400_000;

export function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
}

export function weekday(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function addMonthsClamped(date, months) {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}
```

calendar-demo.js

```ts
import { addDays, addMonthsClamped, daysBetween, weekday } from "./calendar-math.js";

console.log(addDays("2026-02-27", 2), addDays("2026-12-31", 1), addDays("2026-03-04", -4));
console.log(daysBetween("2026-03-04", "2026-04-01"), weekday("2026-03-04"));

const naive = new Date(Date.UTC(2026, 0, 31));
naive.setUTCMonth(naive.getUTCMonth() + 1);
console.log("naive +1 month:", naive.toISOString().slice(0, 10));
console.log("clamped +1 month:", addMonthsClamped("2026-01-31", 1), addMonthsClamped("2028-01-31", 1), addMonthsClamped("2026-11-30", 3));
```

Output of `node calendar-demo.js` and of the browser terminal

```ts
2026-03-01 2027-01-01 2026-02-28
28 3
naive +1 month: 2026-03-03
clamped +1 month: 2026-02-28 2028-02-29 2027-02-28
```

- `Date.UTC` and the `setUTC…` methods accept out-of-range values and **roll over**: day 0 of a month is the last day of the previous month, which is how `addMonthsClamped` finds the month's length.
- That same rollover makes the naive "add one month" turn 31 January into 3 March. A subscription billed "monthly from 31 January" needs a rule; clamping to the last day of the month is the usual one.
- `getUTCDay()` returns 0 for Sunday up to 6 for Saturday.

> Date objects are mutable
>
> The `set…` methods change the Date in place. A Date stored in a shared object (a config, a cached order) and later "adjusted" with `setUTCDate` changes for everybody holding it. Copy first with `new Date(date)`, or keep timestamps and date strings, which are immutable, and create Date objects only at the edges.

### From a wall time in a zone to an instant

The opposite direction, "09:00 on 6 March in Lagos, as an instant", has no built-in function. For zones with a fixed offset it is simple arithmetic, but for zones with DST the offset depends on the answer you are computing. The standard trick guesses, measures the zone's offset at the guess, and corrects twice:

zoned.js

```ts
import { wallClock } from "./wall-clock.js";

function offsetMs(instant, timeZone) {
  const w = wallClock(instant, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

export function zonedToInstant({ year, month, day, hour = 0, minute = 0 }, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMs(guess, timeZone);
  return new Date(guess - offsetMs(first, timeZone));
}
```

zoned-demo.js

```ts
import { zonedToInstant } from "./zoned.js";

const slot = { year: 2026, month: 3, day: 6, hour: 9 };
for (const zone of ["Africa/Lagos", "UTC", "Europe/London", "America/New_York"]) {
  console.log(zone.padEnd(17), zonedToInstant(slot, zone).toISOString());
}
console.log(zonedToInstant({ year: 2026, month: 3, day: 29, hour: 12 }, "Europe/London").toISOString());
```

Output of `node zoned-demo.js` and of the browser terminal

```ts
Africa/Lagos      2026-03-06T08:00:00.000Z
UTC               2026-03-06T09:00:00.000Z
Europe/London     2026-03-06T09:00:00.000Z
America/New_York  2026-03-06T14:00:00.000Z
2026-03-29T11:00:00.000Z
```

09:00 in New York on 6 March is 14:00 UTC (winter, −5), while noon in London on 29 March is 11:00 UTC (summer time started that morning). Times that do not exist (the hour skipped when clocks go forward) or exist twice (when they go back) need a business rule; this function quietly picks one. That ambiguity is one of the reasons the Temporal API exists.

## Storing and exchanging dates

- **Instants** go into JSON as ISO strings in UTC with a `Z` (`"2026-03-03T23:30:00.000Z"`), or as epoch milliseconds, and into PostgreSQL as `timestamptz`. Never send local times without an offset.
- **Calendar dates** go in as `"YYYY-MM-DD"` strings and into PostgreSQL as `date`. Do not store a birthday as "midnight UTC": shown in New York, it becomes the day before.
- **Zones** are stored as IANA names next to whatever needs them: a shop's `timeZone: "Africa/Lagos"`, a user's preference. A recurring "every day at 09:00" is a wall time plus a zone, not a list of instants.
- **JSON has no date type.** `JSON.parse` gives you strings back, and nothing tells you which strings were dates. Convert fields explicitly after parsing (or validate with a schema, as in [Runtime validation](https://zudojs.oyinlola.site/learn/ts-validation)).

json-dates.js

```ts
const order = { id: "ORD-1001", placedAt: new Date("2026-03-03T23:30:00Z"), deliveryDate: "2026-03-06" };

const body = JSON.stringify(order);
console.log(body);

const parsed = JSON.parse(body);
console.log(typeof parsed.placedAt, parsed.placedAt instanceof Date);

const restored = { ...parsed, placedAt: new Date(parsed.placedAt) };
console.log(restored.placedAt.getTime() === order.placedAt.getTime(), restored.deliveryDate);
```

Output of `node json-dates.js` and of the browser terminal

```json
{"id":"ORD-1001","placedAt":"2026-03-03T23:30:00.000Z","deliveryDate":"2026-03-06"}
string false
true 2026-03-06
```

## The Temporal API

`Date` dates from 1995 and copied its design from an early version of Java, including the zero-based months and the mutability. **Temporal** is its replacement, standardised by TC39 (the committee that designs JavaScript). It has a separate type for each idea in this lesson:

| Type | Represents | Example |
| --- | --- | --- |
| `Temporal.Instant` | An exact moment, like a timestamp | a payment |
| `Temporal.ZonedDateTime` | An instant plus a time zone and calendar | a delivery slot in Lagos |
| `Temporal.PlainDate` | A calendar date with no time and no zone | a delivery day, a birthday |
| `Temporal.PlainTime`, `PlainDateTime` | Wall times without a zone | "opens at 09:00" |
| `Temporal.Duration` | An amount of time | "2 days", "PT30M" |

All Temporal objects are immutable, months start at 1, and arithmetic across DST and month ends follows explicit, documented rules. At the time of writing, Temporal ships in Chromium-based browsers but **not in Node.js 24**, so the code below is shown as a file rather than a runnable example. You can use it today in Node through a polyfill package such as `temporal-polyfill`.

delivery-temporal.js

```ts
const placed = Temporal.Instant.from("2026-03-03T23:30:00Z").toZonedDateTimeISO("Africa/Lagos");
placed.toPlainDate().toString();                          // "2026-03-04"

const delivery = placed.toPlainDate().add({ days: 2 });   // PlainDate 2026-03-06
Temporal.PlainDate.from("2026-01-31").add({ months: 1 }); // 2026-02-28 (clamped by default)

const slot = Temporal.ZonedDateTime.from({ year: 2026, month: 3, day: 29, hour: 12, timeZone: "Europe/London" });
slot.toInstant().toString();                              // "2026-03-29T11:00:00Z"
slot.add({ days: 1 }).hour;                               // 12: a calendar day, not 24 hours
```

Each line matches something you did by hand in this lesson: the wall date in a zone, calendar arithmetic, month-end clamping, and wall time to instant. Until Temporal is available everywhere you deploy, the helpers above, or a well-tested library, are the practical choice.

## Before you build: a delivery estimator

REASON IT OUT

### What does "delivered in 2 business days" mean, exactly?

The shop's rule: orders placed before 14:00 Lagos time on a business day are processed that day; later orders are processed on the next business day. Delivery is 2 business days after processing. Business days are Monday to Friday, except public holidays. Before reading the code, think through:

- What is the input: a Date, a timestamp or a string? Which zone decides "before 14:00" and "Monday"?
- Is an order at exactly 14:00:00 before or after the cut-off? At 13:59:59.999?
- An order is placed on a Saturday morning. What is the processing day?
- Friday 2 October is a working day but Thursday 1 October 2026 is Nigeria's Independence Day. What happens to an order placed on Wednesday afternoon?
- The server runs in UTC, the CI runs in Lagos time, a developer's laptop is in London. How do you make sure all three give the same answer?
- What should the function return: an instant, a Date, or a calendar date?

**Show the reasoning**

- Take an instant (a Date or timestamp). The shop's zone, `Africa/Lagos`, is a parameter, and every decision uses the wall clock in that zone, obtained with `Intl`, never local getters.
- "Before 14:00" means `hour < 14`: 14:00:00 is after the cut-off, 13:59:59.999 is before. Write this boundary into a test so nobody "fixes" it later.
- Saturday is not a business day, so the order is processed on the next business day, Monday, whatever the hour.
- Wednesday afternoon is after the cut-off, so processing moves to the next business day, which skips the Thursday holiday: Friday 2 October. Two business days later, skipping the weekend, is Tuesday 6 October. Holidays are a list of calendar-date strings passed in, so the function never needs updating when the calendar changes.
- Never read the machine's zone: no local getters, no zone-less parsing. Then the result cannot depend on where the code runs, and a test can prove it by running the same cases under several `TZ` values.
- A calendar date, `"2026-10-06"`: the promise is a day, not a moment. Formatting it for the customer is a separate step.

## Build: the delivery estimator

estimate.js

```ts
import { addDays, weekday } from "./calendar-math.js";
import { toDateString, wallClock } from "./wall-clock.js";

export function isBusinessDay(date, holidays) {
  const day = weekday(date);
  return day !== 0 && day !== 6 && !holidays.has(date);
}

export function nextBusinessDay(date, holidays) {
  let next = addDays(date, 1);
  while (!isBusinessDay(next, holidays)) next = addDays(next, 1);
  return next;
}

export function estimateDelivery(placedAt, { timeZone = "Africa/Lagos", cutoffHour = 14, businessDays = 2, holidays = new Set() } = {}) {
  const instant = placedAt instanceof Date ? placedAt.getTime() : placedAt;
  if (!Number.isFinite(instant)) throw new TypeError("placedAt must be a valid Date or timestamp");
  const local = wallClock(instant, timeZone);
  const orderDate = toDateString(local);
  const processing = isBusinessDay(orderDate, holidays) && local.hour < cutoffHour
    ? orderDate
    : nextBusinessDay(orderDate, holidays);
  let delivery = processing;
  for (let i = 0; i < businessDays; i++) delivery = nextBusinessDay(delivery, holidays);
  return { orderDate, processing, delivery };
}

const display = new Intl.DateTimeFormat("en-NG", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });

export function describeDelivery(date) {
  return display.format(new Date(`${date}T00:00:00Z`));
}
```

`describeDelivery` formats a calendar date. It turns the date into midnight UTC and formats *in UTC*, so the day can never shift. Formatting a calendar date in the customer's zone would be the birthday bug again. Now the emails for a few real orders:

orders.js

```ts
import { describeDelivery, estimateDelivery } from "./estimate.js";

const holidays = new Set(["2026-10-01", "2026-12-25", "2026-12-26"]);
const orders = [
  ["ORD-1", "2026-03-03T23:30:00Z"],
  ["ORD-2", "2026-03-04T12:59:59Z"],
  ["ORD-3", "2026-03-04T13:00:00Z"],
  ["ORD-4", "2026-03-06T16:00:00Z"],
  ["ORD-5", "2026-09-30T15:00:00Z"],
  ["ORD-6", "2026-12-24T09:00:00Z"],
];

for (const [id, placedAt] of orders) {
  const { orderDate, processing, delivery } = estimateDelivery(new Date(placedAt), { holidays });
  console.log(`${id} placed ${orderDate}, processed ${processing}, arrives ${describeDelivery(delivery)}`);
}
```

Output of `node orders.js` and of the browser terminal

```ts
ORD-1 placed 2026-03-04, processed 2026-03-04, arrives Friday, 6 March
ORD-2 placed 2026-03-04, processed 2026-03-04, arrives Friday, 6 March
ORD-3 placed 2026-03-04, processed 2026-03-05, arrives Monday, 9 March
ORD-4 placed 2026-03-06, processed 2026-03-09, arrives Wednesday, 11 March
ORD-5 placed 2026-09-30, processed 2026-10-02, arrives Tuesday, 6 October
ORD-6 placed 2026-12-24, processed 2026-12-24, arrives Tuesday, 29 December
```

ORD-2 and ORD-3 are one second apart around the cut-off (13:59:59 and 14:00:00 in Lagos) and get different processing days. ORD-4 is a Friday evening order, processed on Monday. ORD-5 skips Independence Day, and ORD-6 skips Christmas, Boxing Day and a weekend.

## Testing time-dependent code

Two rules make date code testable. First, **never read the clock inside the logic**: `estimateDelivery` takes `placedAt` as a parameter, so a test can use any instant, and no test ever depends on the day it runs. Second, **run the tests in more than one zone**, because a hidden local getter only fails when the machine's zone changes. In Node you can switch `process.env.TZ` between runs:

estimate.test.jsNode.js only

```ts
import { estimateDelivery } from "./estimate.js";

const holidays = new Set(["2026-10-01"]);
const cases = [
  ["after midnight in Lagos", "2026-03-03T23:30:00Z", "2026-03-06"],
  ["just before cut-off", "2026-03-04T12:59:59.999Z", "2026-03-06"],
  ["exactly at cut-off", "2026-03-04T13:00:00Z", "2026-03-09"],
  ["Saturday morning", "2026-03-07T08:00:00Z", "2026-03-11"],
  ["before a holiday", "2026-09-30T15:00:00Z", "2026-10-06"],
];

let failures = 0;
for (const zone of ["UTC", "Africa/Lagos", "Europe/London", "America/Los_Angeles", "Pacific/Kiritimati"]) {
  process.env.TZ = zone;
  for (const [label, placedAt, expected] of cases) {
    const { delivery } = estimateDelivery(new Date(placedAt), { holidays });
    if (delivery !== expected) {
      failures++;
      console.log(`FAIL [${zone}] ${label}: ${delivery} !== ${expected}`);
    }
  }
}
console.log(`${cases.length} cases x 5 machine zones, ${failures} failures`);

try {
  estimateDelivery(new Date("not a date"));
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node estimate.test.js`

```ts
5 cases x 5 machine zones, 0 failures
TypeError: placedAt must be a valid Date or timestamp
```

`Pacific/Kiritimati` is UTC+14, the zone furthest ahead; `America/Los_Angeles` is behind UTC and has DST. If any code path used the machine's zone, some combination would fail. This test only runs in Node, because a browser cannot change its zone; the estimator itself runs anywhere.

For code that genuinely needs "now", pass a clock function (`now = () => Date.now()`) and give tests a fake one, as the cache in [Collections in depth](https://zudojs.oyinlola.site/learn/js-collections#build) did. Test frameworks such as Vitest can also fake the global clock (`vi.useFakeTimers()` and `vi.setSystemTime()`), covered in [the testing lesson](https://zudojs.oyinlola.site/learn/testing-basics).

## In production

- **Run servers in UTC** (`TZ=UTC`), and write code that would be correct even if they were not.
- **Store instants in UTC, calendar dates as dates, and zones as IANA names.** Convert to local wall time only for display or for business rules that are defined in local time, and name the zone explicitly.
- **Refuse zone-less date-times from clients.** Ask for an offset or a zone, or for a calendar date plus a separate zone.
- **Clocks drift.** Two servers can disagree by seconds. Do not compare timestamps from different machines to decide ordering at the millisecond level; use database sequence numbers or the database's clock.
- **Scheduled jobs:** "every day at 09:00 Lagos time" belongs in a scheduler that understands zones, as in [the ZudoJS scheduler lesson](https://zudojs.oyinlola.site/learn/zudo-scheduler). Jobs scheduled in a zone with DST can run twice or not at all on the change days.
- **Time zone rules change** when governments change them. Browsers and Node.js ship the IANA database; keep runtimes updated.

## Practice

TRY IT YOURSELF

### Opening hours

A shop in Lagos is open Monday to Saturday, 08:00 to 20:00 local time. Write `isOpen(instant)` using `Intl.DateTimeFormat` with `timeZone: "Africa/Lagos"` (no local getters) and check it for 07:30Z on a Monday (08:30 in Lagos), 19:30Z on a Saturday, and 10:00Z on a Sunday.

**Show a solution**

opening-hours.js

```ts
const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: "Africa/Lagos", hourCycle: "h23", weekday: "short", hour: "numeric",
});

function isOpen(instant) {
  const fields = Object.fromEntries(parts.formatToParts(instant).map((p) => [p.type, p.value]));
  const hour = Number(fields.hour);
  return fields.weekday !== "Sun" && hour >= 8 && hour < 20;
}

console.log(isOpen(new Date("2026-03-02T07:30:00Z")));
console.log(isOpen(new Date("2026-03-07T19:30:00Z")));
console.log(isOpen(new Date("2026-03-08T10:00:00Z")));
```

Output of `node opening-hours.js` and of the browser terminal

```ts
true
false
false
```

19:30Z on Saturday is 20:30 in Lagos, after closing. `Object.fromEntries` turns the parts into an object like `{ weekday: "Mon", hour: "8" }`; the literal separators overwrite each other under the key `literal`, which the function ignores.

TRY IT YOURSELF

### Due dates for monthly invoices

Invoices are due on the same day of the following month, clamped to the month's last day. Using `addMonthsClamped`'s idea, print the due dates for invoices dated 2026-01-15, 2026-01-31, 2026-03-31 and 2026-12-31.

**Show a solution**

due-dates.js

```ts
function addMonthsClamped(date, months) {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

for (const invoiceDate of ["2026-01-15", "2026-01-31", "2026-03-31", "2026-12-31"]) {
  console.log(invoiceDate, "->", addMonthsClamped(invoiceDate, 1));
}
```

Output of `node due-dates.js` and of the browser terminal

```ts
2026-01-15 -> 2026-02-15
2026-01-31 -> 2026-02-28
2026-03-31 -> 2026-04-30
2026-12-31 -> 2027-01-31
```

Going to the first of the target month first avoids the rollover; the day is then clamped to that month's length, found as "day 0 of the month after".

TRY IT YOURSELF

### How long ago, in words

Write `ago(then, now)` that returns text such as `"3 hours ago"`, `"yesterday"` or `"2 weeks ago"` with `Intl.RelativeTimeFormat`, choosing the largest unit that fits (seconds, minutes, hours, days, weeks). Both arguments are timestamps; test it with fixed values only.

**Show a solution**

ago.js

```ts
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const units = [
  ["week", 7 * 24 * 3600 * 1000],
  ["day", 24 * 3600 * 1000],
  ["hour", 3600 * 1000],
  ["minute", 60 * 1000],
  ["second", 1000],
];

function ago(then, now) {
  const diff = then - now;
  for (const [unit, ms] of units) {
    if (Math.abs(diff) >= ms || unit === "second") return rtf.format(Math.trunc(diff / ms), unit);
  }
}

const now = Date.parse("2026-03-06T12:00:00Z");
for (const then of ["2026-03-06T11:59:30Z", "2026-03-06T09:00:00Z", "2026-03-05T10:00:00Z", "2026-02-20T12:00:00Z", "2026-03-06T12:05:00Z"]) {
  console.log(then, "->", ago(Date.parse(then), now));
}
```

Output of `node ago.js` and of the browser terminal

```ts
2026-03-06T11:59:30Z -> 30 seconds ago
2026-03-06T09:00:00Z -> 3 hours ago
2026-03-05T10:00:00Z -> yesterday
2026-02-20T12:00:00Z -> 2 weeks ago
2026-03-06T12:05:00Z -> in 5 minutes
```

The difference is negative for the past, which `RelativeTimeFormat` turns into "ago"; the last case is in the future. `Math.trunc` rounds towards zero, so 26 hours is "yesterday", not "2 days ago". Because `now` is a parameter, the output is the same on every run.

## Recap

- A `Date` is one number: milliseconds since 1970-01-01T00:00:00Z. It has no time zone. Months in `Date.UTC` and the constructor start at 0.
- Local getters, `toString` and `new Date(y, m, d)` use the machine's zone. Use the UTC methods, or `Intl.DateTimeFormat` with an explicit `timeZone`.
- An offset is fixed; a time zone (`Africa/Lagos`, `Europe/London`) is rules that change the offset over the year. Store zone names.
- Date-only ISO strings parse as UTC; date-times without a zone parse as local time; other formats are implementation-defined; V8 accepts impossible days. Parse outside input strictly and check the round trip.
- Instants move by milliseconds; calendar dates move by days in UTC, stored as `"YYYY-MM-DD"`. Month arithmetic needs a clamping rule; DST makes some days 23 or 25 hours long.
- Exchange instants as ISO UTC strings, calendar dates as date strings, and convert after `JSON.parse`.
- Temporal separates instants, zoned times, plain dates and durations; use it where it is available, or a polyfill.

Next: [Regular expressions](https://zudojs.oyinlola.site/learn/js-regexp), where you validate phone numbers and order codes, parse log lines, and learn why one bad pattern can freeze a server.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
