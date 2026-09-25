---
title: "Strings in depth — ZudoJS Academy"
description: "Measure, cut, normalise, search, sort and format product names with accents and emoji, using code points, graphemes, Intl.Segmenter and Intl.Collator."
source: https://zudojs.oyinlola.site/learn/js-strings
---

LEVEL 4 · LESSON 4 OF 20

Built-in objects Core

# Strings in depth

Measure, cut, normalise, search, sort and format product names with accents and emoji, using code points, graphemes, Intl.Segmenter and Intl.Collator.

- **55 min** to read and try
- **You need:** Values, variables and types, Arrays and strings under the hood (Algorithms course), and Inheritance and composition
- **You build:** A product-name toolkit for a shop: cleaning, display length, safe truncation, slugs, accent-insensitive search and correct sorting, with tests on tricky names

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain the difference between UTF-16 code units, code points and grapheme clusters, and count each
- Cut and truncate text without breaking characters, using Intl.Segmenter
- Normalise text so that visually identical strings compare equal, and strip accents for search
- Sort and compare names correctly for a locale with localeCompare and Intl.Collator
- Build slugs, safe replacements and tagged templates
- Format lists and plurals with Intl

## The receipt that printed half a flag

A food shop in Lagos prints receipts on a small thermal printer that fits 16 characters per line. Product names come from the shop's admin page, where staff type whatever they like, including accents and emoji. The receipt code shortens long names with `slice`:

receipt.js

```ts
const products = ["Rice 5kg", "Ìyá Àkàrà 🇳🇬", "Mama Put Jollof 🍲🇳🇬", "Egusi soup XL 🍲 bowl"];

for (const name of products) {
  const label = name.length > 16 ? name.slice(0, 15) + "…" : name;
  console.log(JSON.stringify(label), "length", name.length);
}
```

Output of `node receipt.js` and of the browser terminal

```ts
"Rice 5kg" length 8
"Ìyá Àkàrà 🇳🇬" length 14
"Mama Put Jollof…" length 22
"Egusi soup XL \ud83c…" length 21
```

Three problems hide in four lines:

- `"Ìyá Àkàrà 🇳🇬"` looks like 11 characters to a person, but `length` says 14.
- The jollof line happens to be cut in a safe place, but its emoji alone count as 6 towards `length`.
- The last label ends in `\ud83c`: half of an emoji. `JSON.stringify` shows it as an escape because it is not a valid character on its own. The printer prints a box or a question mark, and, as you will see, some functions refuse such a string completely.

The earlier lessons treated a string as a list of characters. [Values, variables and types](https://zudojs.oyinlola.site/learn/js-values#strings) introduced the methods, and [Arrays and strings under the hood](https://zudojs.oyinlola.site/learn/dsa-arrays-strings#strings) showed that strings are immutable and that some emoji take two positions. This lesson explains what a JavaScript string really stores, and then uses that to measure, cut, compare, search, sort and format text the way people read it.

## Three kinds of "character"

Text on a computer is built on **Unicode**, a standard that gives every character in every writing system a number, called its **code point**. Code points are written `U+` followed by hexadecimal digits: `A` is U+0041, `₦` is U+20A6, the pot of food `🍲` is U+1F372. There are over a million possible code points.

A JavaScript string does not store code points directly. It stores a sequence of **UTF-16 code units**: 16-bit numbers from 0 to 65,535. A code point up to U+FFFF fits in one code unit. A larger one, such as most emoji, is split into two code units called a **surrogate pair**: a high surrogate (D800 to DBFF) followed by a low surrogate (DC00 to DFFF). `length`, indexing with `[i]`, `slice` and `charCodeAt` all count code units.

code-units.js

```ts
const pot = "🍲";

console.log(pot.length);
console.log(pot.charCodeAt(0).toString(16), pot.charCodeAt(1).toString(16));
console.log(pot.codePointAt(0).toString(16));
console.log(String.fromCodePoint(0x1f372), "\u{1F372}" === pot, "\uD83C\uDF72" === pot);
console.log([...pot].length, Array.from("₦🍲").length);
```

Output of `node code-units.js` and of the browser terminal

```ts
2
d83c df72
1f372
🍲 true true
1 2
```

`codePointAt` reads a whole code point when it starts at a high surrogate. Iterating a string, with `for...of`, spread `[...text]` or `Array.from`, also walks by code point, so each emoji arrives in one piece.

### Grapheme clusters: what a person calls a character

Code points are still not what a reader sees. Some visible characters are several code points joined together:

- `é` can be one code point (U+00E9) *or* a plain `e` followed by a **combining mark**, U+0301, which draws an accent on the letter before it.
- `👍🏽` is a thumbs-up plus a skin-tone **modifier**.
- `🇳🇬`, the Nigerian flag, is two "regional indicator" letters, N and G.
- `👩🏾‍🍳`, a cook, is woman + skin tone + an invisible **zero width joiner** (U+200D) + cooking pan.

What a reader perceives as one character is called a **grapheme cluster** (or just grapheme). The rules for grouping code points into graphemes are part of Unicode, and JavaScript exposes them through `Intl.Segmenter`. `Intl` is the built-in internationalisation API: objects that know the rules of languages and regions. A segmenter splits text into graphemes, words or sentences:

three-lengths.js

```ts
const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });
const countGraphemes = (text) => [...graphemes.segment(text)].length;
const utf8Bytes = (text) => new TextEncoder().encode(text).length;

const samples = ["Rice", "₦", "é", "e\u0301", "🍲", "👍🏽", "🇳🇬", "👩🏾‍🍳", "Ìyá Àkàrà 🇳🇬"];

console.log("text            units  points  graphemes  utf8");
for (const text of samples) {
  console.log(
    JSON.stringify(text).padEnd(16),
    String(text.length).padStart(5),
    String([...text].length).padStart(7),
    String(countGraphemes(text)).padStart(10),
    String(utf8Bytes(text)).padStart(5),
  );
}
```

Output of `node three-lengths.js` and of the browser terminal

```ts
text            units  points  graphemes  utf8
"Rice"               4       4          4     4
"₦"                  1       1          1     3
"é"                  1       1          1     2
"é"                 2       2          1     3
"🍲"                 2       1          1     4
"👍🏽"               4       2          1     8
"🇳🇬"               4       2          1     8
"👩🏾‍🍳"            7       4          1    15
"Ìyá Àkàrà 🇳🇬"    14      12         11    23
```

The first column wobbles because `padEnd` also counts code units; you will meet that again below. Four different numbers for the same text, and each one is the right answer to a different question:

| Unit | How to count | Use it for |
| --- | --- | --- |
| UTF-16 code units | `text.length` | Indexes for `slice`, `indexOf` and friends; limits of APIs defined in code units |
| Code points | `[...text].length` | Database column limits (PostgreSQL's `varchar(n)` counts code points), iterating safely |
| Grapheme clusters | `Intl.Segmenter` | Anything a person sees: display limits, cursor movement, "max 20 characters" in a form |
| UTF-8 bytes | `new TextEncoder().encode(text).length` | Storage and network sizes, byte limits in headers and files |

The two `é` rows look identical on screen and even in the printed JSON. That is the next problem.

> NOTE
>
> Only the first column is cheap: `length` is stored with the string. The others walk the whole string, so compute them once, not inside a tight loop.

### Broken halves: lone surrogates

Cutting a string at a code-unit index can split a surrogate pair and leave a **lone surrogate**: half a character. Such a string is not **well-formed** Unicode. JavaScript lets it exist, but anything that must turn it into bytes has a problem:

lone-surrogate.js

```ts
const name = "Mama Put Jollof 🍲🇳🇬";
const cut = name.slice(0, 17);

console.log(JSON.stringify(cut), cut.isWellFormed());
console.log(JSON.stringify(cut.toWellFormed()));

try {
  encodeURIComponent(cut);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}

console.log(new TextEncoder().encode(cut).slice(-3));
```

Output of `node lone-surrogate.js` and of the browser terminal

```ts
"Mama Put Jollof \ud83c" false
"Mama Put Jollof �"
URIError: URI malformed
Uint8Array(3) [ 239, 191, 189 ]
```

`encodeURIComponent`, which you need to put a name into a URL, throws. `TextEncoder` silently replaces the half with U+FFFD, the replacement character `�` (bytes 239, 191, 189), so the database stores a question-mark box. `isWellFormed()` checks for lone surrogates and `toWellFormed()` replaces them explicitly. The real fix is to never create them: cut at grapheme boundaries, which the build section does.

## Normalization: when equal-looking strings are not equal

A customer searches for `Café Bread`. The product was typed on a Mac, the search on an Android phone, and the search finds nothing:

normalize.js

```ts
const stored = "Cafe\u0301 Bread";
const typed = "Caf\u00e9 Bread";

console.log(stored, typed, stored === typed);
console.log(stored.length, typed.length);
console.log(stored.normalize("NFC") === typed.normalize("NFC"));
console.log(stored.normalize("NFD") === typed.normalize("NFD"));
console.log(typed.normalize("NFD").length, stored.normalize("NFC").length);
```

Output of `node normalize.js` and of the browser terminal

```ts
Café Bread Café Bread false
11 10
true
true
11 10
```

Unicode allows several code point sequences for the same text. **Normalization** rewrites a string into one standard form, so that equal-looking text becomes equal code points. `text.normalize(form)` supports four forms:

- **NFC** (the default): *composed*. Letters and accents are combined into single code points where one exists. It is the most compact form and the one to store.
- **NFD**: *decomposed*. Every accented letter is split into the base letter plus combining marks. Useful when you want to work on the marks separately.
- **NFKC** and **NFKD**: the same, plus *compatibility* mappings that turn look-alike variants into plain characters. They lose information, so use them for search keys and identifiers, not for storing what the user wrote.

nfkc.js

```ts
const variants = ["ﬁsh pie", "ＲＩＣＥ", "Size ②", "₦5\u00a0000"];

for (const text of variants) {
  console.log(JSON.stringify(text), "->", JSON.stringify(text.normalize("NFKC")));
}
```

Output of `node nfkc.js` and of the browser terminal

```ts
"ﬁsh pie" -> "fish pie"
"ＲＩＣＥ" -> "RICE"
"Size ②" -> "Size 2"
"₦5 000" -> "₦5 000"
```

The ligature `ﬁ` becomes `f` + `i`, full-width letters (common from East Asian keyboards) become ordinary ones, and the circled digit becomes `2`. The last row looks unchanged, but the no-break space (U+00A0) became a normal space: `JSON.stringify` does not escape either, which is why these bugs are so hard to see in logs.

### Removing accents for search

Customers often type `akara` for `Àkàrà`. A common search key is: decompose with NFD, remove every combining mark, then lower-case. The regular expression `/\p{M}/gu` matches any mark in any script ([Regular expressions](https://zudojs.oyinlola.site/learn/js-regexp) explains the syntax):

search-key.js

```ts
const searchKey = (text) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

const catalogue = ["Ìyá Àkàrà", "Crème brûlée", "Ẹ̀fọ́ riro", "Rice 5kg"];
const query = "efo";

console.log(catalogue.map(searchKey));
console.log(catalogue.filter((name) => searchKey(name).includes(searchKey(query))));
```

Output of `node search-key.js` and of the browser terminal

```json
[ 'iya akara', 'creme brulee', 'efo riro', 'rice 5kg' ]
[ 'Ẹ̀fọ́ riro' ]
```

Yorùbá letters such as `ẹ` and `ọ` carry a dot below *and* a tone mark, all of which are combining marks after decomposition. The key is for matching only; you still show the name as it was written.

> Removing marks changes meaning
>
> In many languages accents are not decoration: in Yorùbá, tone marks distinguish different words. Stripping them is fine for a forgiving search box, where more matches are better than none. It is wrong for anything that must be exact, such as usernames, passwords or legal names.

## Upper and lower case are not simple

Changing case looks like a one-to-one mapping, but it is not, and some rules depend on the language:

case.js

```ts
console.log("straße".toUpperCase(), "straße".length, "straße".toUpperCase().length);
console.log("İstanbul".toLowerCase().length, "İstanbul".toLocaleLowerCase("tr").length);
console.log("DIŞ KAPI".toLowerCase(), "|", "DIŞ KAPI".toLocaleLowerCase("tr"));
console.log("ǅ".toLowerCase(), "ǅ".toUpperCase());
```

Output of `node case.js` and of the browser terminal

```ts
STRASSE 6 7
9 8
diş kapi | dış kapı
ǆ Ǆ
```

- German `ß` has no single upper-case letter, so upper-casing makes the string longer.
- Turkish has a dotted and a dotless i. `toLowerCase()` uses language-neutral rules; `toLocaleLowerCase("tr")` uses Turkish ones and gives a different result. Without a locale argument, `toLocaleLowerCase()` uses the locale of whatever machine runs the code, so the same program behaves differently on different servers.

Two consequences for a backend. First, for identifiers (email addresses, SKUs, coupon codes) use the language-neutral `toLowerCase()`, never the machine's locale. Second, to compare two strings "ignoring case", do not lower-case both and compare: use a collator with a sensitivity setting, shown next.

## Comparing and sorting for people

`sort()` without a comparator, and the operators `<` and `>`, compare strings by UTF-16 code unit values. That order puts all capital letters before all small ones, and accented letters after `z`:

default-sort.js

```ts
const customers = ["Émeka", "zainab", "Ade", "Obi", "Zainab", "adaeze", "Ọlá"];

console.log([...customers].sort());
console.log("Zainab" < "adaeze", "Émeka" > "zainab");
```

Output of `node default-sort.js` and of the browser terminal

```json
[
  'Ade',    'Obi',
  'Zainab', 'adaeze',
  'zainab', 'Émeka',
  'Ọlá'
]
true true
```

`a.localeCompare(b, locale, options)` compares like a person who reads that language. It returns a negative number, zero or a positive number, which is exactly what a sort comparator needs ([Sorting algorithms](https://zudojs.oyinlola.site/learn/dsa-sorting)). When you compare many strings, create an `Intl.Collator` once and use its `compare` method: it is the same comparison without rebuilding the rules on every call.

collator.js

```ts
const customers = ["Émeka", "zainab", "Ade", "Obi", "Zainab", "adaeze", "Ọlá"];
const byName = new Intl.Collator("en");

console.log(customers.toSorted(byName.compare).join(", "));
console.log(customers.toSorted((a, b) => a.localeCompare(b, "en")).join(", "));

const sizes = ["Size 10", "Size 9", "Size 2", "size 1"];
console.log(sizes.toSorted(new Intl.Collator("en").compare).join(", "));
console.log(sizes.toSorted(new Intl.Collator("en", { numeric: true }).compare).join(", "));
```

Output of `node collator.js` and of the browser terminal

```ts
adaeze, Ade, Émeka, Obi, Ọlá, zainab, Zainab
adaeze, Ade, Émeka, Obi, Ọlá, zainab, Zainab
size 1, Size 10, Size 2, Size 9
size 1, Size 2, Size 9, Size 10
```

`numeric: true` compares runs of digits by their numeric value, so "Size 9" comes before "Size 10". Passing `byName.compare` directly works because a collator's `compare` is already bound to the collator ([this in depth](https://zudojs.oyinlola.site/learn/js-this#explicit) explains why that matters).

### Sensitivity: what counts as a difference

The `sensitivity` option decides which differences matter when comparing for equality:

sensitivity.js

```ts
const pairs = [["akara", "Àkàrà"], ["akara", "Akara"], ["akara", "àkara"], ["akara", "akara"]];

for (const sensitivity of ["base", "accent", "case", "variant"]) {
  const collator = new Intl.Collator("en", { sensitivity });
  const equal = pairs.map(([a, b]) => (collator.compare(a, b) === 0 ? "=" : "≠"));
  console.log(sensitivity.padEnd(8), equal.join("  "));
}
```

Output of `node sensitivity.js` and of the browser terminal

```ts
base     =  =  =  =
accent   ≠  =  ≠  =
case     ≠  ≠  =  =
variant  ≠  ≠  ≠  =
```

Read the table column by column. The first pair differs in accents *and* case, the second only in case, the third only in an accent, and the last not at all:

- `base`: only base letters matter. `a = á = A`. Good for forgiving search and "does this name already exist?".
- `accent`: accents matter, case does not. `a ≠ á`, `a = A`.
- `case`: case matters, accents do not.
- `variant` (the default for sorting): everything matters.

### The order depends on the language

Sorting is a cultural rule. In German, `ö` sorts with `o`; in Swedish it is a separate letter after `z`. Pass the locale of the *reader*, and pass it explicitly so the server's settings do not decide:

locales.js

```ts
const words = ["zebra", "öl", "ost", "apple"];

console.log(words.toSorted(new Intl.Collator("de").compare).join(" "));
console.log(words.toSorted(new Intl.Collator("sv").compare).join(" "));
```

Output of `node locales.js` and of the browser terminal

```ts
apple öl ost zebra
apple ost zebra öl
```

## Methods that bite

You know the everyday methods from [Values, variables and types](https://zudojs.oyinlola.site/learn/js-values#strings). A few of them have edges worth knowing before they reach production.

### slice versus substring

slice-substring.js

```ts
const sku = "RICE-5KG-042";

console.log(sku.slice(-3), "|", sku.substring(-3));
console.log(sku.slice(5, 3), "|", sku.substring(5, 3));
console.log(sku.at(-1), sku[sku.length - 1], sku[-1]);
```

Output of `node slice-substring.js` and of the browser terminal

```ts
042 | RICE-5KG-042
 | E-
2 2 undefined
```

`slice` counts negative indexes from the end and returns an empty string when the start is after the end. `substring` turns negatives into 0 and silently swaps its arguments. Prefer `slice`, and `at(-1)` for "the last one"; `sku[-1]` is just a missing property.

### replace and the special $ patterns

When the replacement is a string, `replace` and `replaceAll` treat some `$` sequences specially: `$&` means "the matched text", `$$` means a single `$`, and there are others. This matters when the replacement comes from data, such as a customer's name or a price in dollars:

replace-dollar.js

```ts
const template = "Dear NAME, your refund is ready.";

console.log(template.replace("NAME", "Ada"));
console.log(template.replace("NAME", "Big$$ Stores"));
console.log(template.replace("NAME", "Shop $& Co"));
console.log(template.replace("NAME", () => "Shop $& Co"));
```

Output of `node replace-dollar.js` and of the browser terminal

```ts
Dear Ada, your refund is ready.
Dear Big$ Stores, your refund is ready.
Dear Shop NAME Co, your refund is ready.
Dear Shop $& Co, your refund is ready.
```

When the replacement comes from outside your code, pass a **function**. Its return value is used exactly as written.

### split and padding use code units

split-pad.js

```ts
console.log("🍲🇳🇬".split("").length, [..."🍲🇳🇬"].length);
console.log("a,b,,c".split(","), "a,b,,c".split(",", 2));
console.log(`[${"🍲".padEnd(4, ".")}] [${"Rice".padEnd(4, ".")}]`);
```

Output of `node split-pad.js` and of the browser terminal

```ts
6 3
[ 'a', 'b', '', 'c' ] [ 'a', 'b' ]
[🍲..] [Rice]
```

`split("")` splits into code units, breaking every emoji. `padEnd(4)` pads to four *code units*, so the pot of food gets only two dots and the receipt columns stop lining up. Column layouts for text with emoji need grapheme counts (and even then, terminals draw some emoji two columns wide).

## Template literals, tagged

A template literal can be preceded by a function name. Then JavaScript does not build the string itself: it calls the function, called a **tag**, with the literal text pieces and the values separately. The tag decides what to return. That makes tags the right place for rules that must apply to *every* inserted value, such as escaping:

tagged.js

```ts
function show(strings, ...values) {
  console.log(strings, values);
  return "ignored";
}

const name = "Rice";
const kobo = 850000;
console.log(show`Item ${name} costs ${kobo / 100}!`);
```

Output of `node tagged.js` and of the browser terminal

```json
[ 'Item ', ' costs ', '!' ] [ 'Rice', 8500 ]
ignored
```

There is always one more text piece than there are values; pieces can be empty. A product page that builds HTML from product names must escape every name, or a name like `<img src=x onerror=…>` runs code in customers' browsers (cross-site scripting, covered in the browser lessons). A tag makes the safe way the easy way:

html-tag.js

```ts
const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function html(strings, ...values) {
  return strings.reduce((out, text, i) => out + escapeHtml(values[i - 1]) + text);
}

const product = { name: 'Suya <img src=x onerror="alert(1)">', priceNaira: 2500 };
console.log(html`<li>${product.name}: ₦${product.priceNaira}</li>`);
```

Output of `node html-tag.js` and of the browser terminal

```ts
<li>Suya &lt;img src=x onerror=&quot;alert(1)&quot;&gt;: ₦2500</li>
```

The literal pieces are trusted (you wrote them); the values are escaped. The `&` replacement comes first, otherwise it would escape the `&` of every entity written before it.

`String.raw` is a built-in tag that keeps backslashes as written, which helps with Windows paths and regular expression sources. Inside a tag, `strings.raw` gives the same raw pieces:

string-raw.js

```ts
console.log(`C:\exports\new-orders.csv`);
console.log(String.raw`C:\exports\new-orders.csv`);
```

Output of `node string-raw.js` and of the browser terminal

```ts
C:exports
ew-orders.csv
C:\exports\new-orders.csv
```

In the normal literal, `\e` is just `e` and `\n` is a line break. `String.raw` keeps both backslashes.

## Formatting text with Intl

Numbers and dates have their own formatters, covered in [Numbers in depth](https://zudojs.oyinlola.site/learn/js-numbers) and [Dates and time zones](https://zudojs.oyinlola.site/learn/js-dates). Three `Intl` objects handle plain text that people read: lists, plurals and word boundaries.

intl-text.js

```ts
const and = new Intl.ListFormat("en-GB", { type: "conjunction" });
const or = new Intl.ListFormat("en-GB", { type: "disjunction" });
console.log(`Your order: ${and.format(["rice", "beans", "plantain"])}.`);
console.log(`Pay by ${or.format(["card", "transfer", "USSD"])}.`);

const plural = new Intl.PluralRules("en-NG");
const itemWord = { one: "item", other: "items" };
for (const n of [0, 1, 2]) console.log(`${n} ${itemWord[plural.select(n)]} in your cart`);

const ordinal = new Intl.PluralRules("en", { type: "ordinal" });
const suffix = { one: "st", two: "nd", few: "rd", other: "th" };
console.log([1, 2, 3, 4, 11, 12, 21, 22, 23].map((n) => n + suffix[ordinal.select(n)]).join(" "));

const words = new Intl.Segmenter("en", { granularity: "word" });
const review = "Great jollof! Delivery took 2 hours, though.";
console.log([...words.segment(review)].filter((s) => s.isWordLike).length, "words");
```

Output of `node intl-text.js` and of the browser terminal

```ts
Your order: rice, beans and plantain.
Pay by card, transfer or USSD.
0 items in your cart
1 item in your cart
2 items in your cart
1st 2nd 3rd 4th 11th 12th 21st 22nd 23rd
7 words
```

`PluralRules.select` returns a category name (`"zero"`, `"one"`, `"two"`, `"few"`, `"many"` or `"other"`), not a word. Languages use different categories, so you keep one word per category per language, and the rules pick the right one. Writing `n === 1 ? "item" : "items"` works for English and fails for many other languages. Note the ordinals: 11th, 12th and 13th are the exceptions that hand-written code usually gets wrong.

## Before you build: a product-name toolkit

REASON IT OUT

### What can a product name contain, and what must each function guarantee?

You will write `cleanName` (what gets stored), `displayLength`, `truncate(name, max)` for the receipt printer, `slugify` for URLs like `/p/iya-akara`, and a sorted, searchable catalogue. Before reading the code, think through:

- What arrives from the admin form? Think of spaces at both ends, several spaces in a row, tabs, a pasted no-break space, decomposed accents, emoji, and half an emoji from a broken client.
- What should `truncate` count: code units, code points or graphemes? If it adds `…`, does the ellipsis count towards the limit? What if `max` is 0 or 1?
- A slug may only contain `a-z`, `0-9` and hyphens. What happens to accents, to emoji, to `&`? What if nothing is left, as for a product called `🍲🍲`?
- Two different products can produce the same slug (`Àkàrà` and `Akara`). Whose problem is that?
- Which of these functions should run once when data arrives, and which on every display?

**Show the reasoning**

- `cleanName` runs once at the boundary: `toWellFormed()` (replace broken halves rather than store them), NFC normalization (one form for everything stored), collapse any run of whitespace, including tabs and U+00A0, into one space with `/\s+/g`, and trim. Store the result; everything else can assume clean input.
- `truncate` counts graphemes, because the limit is about what the printer shows. The ellipsis is one grapheme and counts, so a name longer than `max` keeps `max - 1` graphemes plus `…`. For `max` 0 return an empty string; for 1, only the ellipsis fits. Cutting between graphemes can never split a surrogate pair, so the result is always well-formed.
- `slugify` uses NFKD and drops marks, so accents become plain letters; it lower-cases with the language-neutral `toLowerCase`; everything that is not `a-z0-9` becomes a hyphen, runs of hyphens collapse, and hyphens at the ends go. Emoji and `&` disappear. An empty result must not become an empty URL segment: return a fallback such as `"product"` and let the caller add the id.
- Uniqueness is the caller's problem, because only the caller knows which slugs exist (usually the database, with a unique index). The toolkit's job is only to be deterministic: the same name always gives the same slug.
- Cleaning and slugs run once when a product is saved. Truncation, display length and sorting run when displaying, so their expensive parts (the segmenter and collator objects) are created once at module level and reused.

## Build: the product-name toolkit

names.js

```ts
const graphemeSegmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
const collator = new Intl.Collator("en", { numeric: true });
const searchCollator = new Intl.Collator("en", { sensitivity: "base" });

export function cleanName(raw) {
  return String(raw).toWellFormed().normalize("NFC").replace(/\s+/g, " ").trim();
}

export function graphemes(text) {
  return Array.from(graphemeSegmenter.segment(text), (s) => s.segment);
}

export function displayLength(text) {
  return graphemes(text).length;
}

export function truncate(text, max, ellipsis = "…") {
  if (!Number.isInteger(max) || max < 0) throw new RangeError(`max must be a whole number >= 0, got ${max}`);
  const parts = graphemes(text);
  if (parts.length <= max) return text;
  if (max === 0) return "";
  return parts.slice(0, max - 1).join("").trimEnd() + ellipsis;
}

export function slugify(text) {
  const slug = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "product";
}

export function searchKey(text) {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

export function sortByName(products) {
  return products.toSorted((a, b) => collator.compare(a.name, b.name));
}

export function sameName(a, b) {
  return searchCollator.compare(a, b) === 0;
}
```

`truncate` trims the end before adding the ellipsis, so "Mama Put …" becomes "Mama Put…". `Array.from(iterable, mapFn)` collects the segments and maps each one to its text in a single step. Now use the toolkit on the shop's catalogue:

main.js

```ts
import { cleanName, displayLength, sameName, searchKey, slugify, sortByName, truncate } from "./names.js";

const fromAdminForm = [
  "  Mama Put   Jollof 🍲🇳🇬 ",
  "I\u0300ya\u0301 A\u0300ka\u0300ra\u0300",
  "Chef's special 👩🏾‍🍳",
  "Rice\u00a05kg",
  "Rice 10kg",
  "🍲🍲",
];

const products = fromAdminForm.map((raw, i) => {
  const name = cleanName(raw);
  return { id: i + 1, name, slug: `${slugify(name)}-${i + 1}` };
});

for (const p of sortByName(products)) {
  console.log(`${truncate(p.name, 16).padEnd(20)} ${String(displayLength(p.name)).padStart(2)}  /p/${p.slug}`);
}

console.log(products.filter((p) => searchKey(p.name).includes(searchKey("AKARA"))).map((p) => p.id));
console.log(sameName("Ìyá Àkàrà", "iya akara"), sameName("Rice 5kg", "Rice 10kg"));
```

Output of `node main.js` and of the browser terminal

```ts
🍲🍲                  2  /p/product-6
Chef's special 👩🏾‍🍳 16  /p/chef-s-special-3
Ìyá Àkàrà             9  /p/iya-akara-2
Mama Put Jollof…     18  /p/mama-put-jollof-1
Rice 5kg              8  /p/rice-5kg-4
Rice 10kg             9  /p/rice-10kg-5
[ 2 ]
true false
```

Every stored name is clean: runs of spaces and the no-break space are gone, and the decomposed Yorùbá name is now NFC. The catalogue sorts "Rice 5kg" before "Rice 10kg" thanks to `numeric: true`. The emoji-only product gets the fallback slug with its id attached, and every truncated label is at most 16 graphemes with no broken characters. (The `padEnd` columns still wobble for lines with emoji, for the code-unit reason you saw earlier.)

## Testing text code

Text bugs hide in the inputs you did not think of, so string tests are mostly a good list of nasty inputs. Two kinds of test work well together: examples with exact expected answers, and **properties** that must hold for every input, such as "truncate never returns more than `max` graphemes and never returns a broken string":

names.test.js

```ts
import { cleanName, displayLength, graphemes, slugify, truncate } from "./names.js";

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${label} -> ${JSON.stringify(actual)}`);
}

check("clean: spaces and no-break space", cleanName(" Rice\u00a0 5kg\t"), "Rice 5kg");
check("clean: NFC", cleanName("Cafe\u0301").length, 4);
check("clean: lone surrogate replaced", cleanName("Pot \ud83c"), "Pot \ufffd");
check("slug: accents", slugify("Ìyá Àkàrà"), "iya-akara");
check("slug: symbols", slugify("Fish & Chips (Large)"), "fish-chips-large");
check("slug: emoji only", slugify("🍲🍲"), "product");
check("slug: ligature", slugify("ﬁsh pie"), "fish-pie");
check("truncate: short stays", truncate("Rice", 16), "Rice");
check("truncate: flag not split", truncate("Jollof 🇳🇬🇳🇬", 8), "Jollof…");
check("truncate: max 1", truncate("Rice", 1), "…");
check("truncate: max 0", truncate("Rice", 0), "");

let error = null;
try {
  truncate("Rice", -1);
} catch (e) {
  error = e.name;
}
check("truncate: negative max", error, "RangeError");

const nasty = ["👩🏾‍🍳👩🏾‍🍳👩🏾‍🍳", "e\u0301e\u0301e\u0301e\u0301", "🇳🇬🇬🇭🇰🇪🇿🇦", "Ìyá Àkàrà 🇳🇬 special", "a", ""];
let violations = 0;
for (const text of nasty) {
  for (let max = 0; max <= 6; max++) {
    const out = truncate(text, max);
    if (displayLength(out) > max || !out.isWellFormed()) violations++;
    if (displayLength(text) <= max && out !== text) violations++;
  }
}
check("property: 42 cases, no violations", violations, 0);
check("graphemes of a family of flags", graphemes("🇳🇬🇬🇭").length, 2);
```

Output of `node names.test.js` and of the browser terminal

```ts
PASS clean: spaces and no-break space -> "Rice 5kg"
PASS clean: NFC -> 4
PASS clean: lone surrogate replaced -> "Pot �"
PASS slug: accents -> "iya-akara"
PASS slug: symbols -> "fish-chips-large"
PASS slug: emoji only -> "product"
PASS slug: ligature -> "fish-pie"
PASS truncate: short stays -> "Rice"
PASS truncate: flag not split -> "Jollof…"
PASS truncate: max 1 -> "…"
PASS truncate: max 0 -> ""
PASS truncate: negative max -> "RangeError"
PASS property: 42 cases, no violations -> 0
PASS graphemes of a family of flags -> 2
```

The property test runs every nasty input with every limit from 0 to 6: 42 cases from six lines of data. When a property fails, add the failing input to the example list, so the bug has a readable test forever. The [testing lesson](https://zudojs.oyinlola.site/learn/testing-basics) introduces libraries that generate such inputs automatically.

## In production

- **Normalise once, at the boundary.** Clean and NFC-normalise text when it enters the system (form, API, file import), store that, and compare stored values with plain `===`.
- **Know which "length" each limit means.** A form's "max 20 characters" is graphemes. PostgreSQL's `varchar(20)` is code points. An HTTP header or file limit is bytes. SMS is its own world: a message fits 160 characters of the basic GSM alphabet, but a single emoji or `₦` switches the whole message to UCS-2 with a 70-unit limit, and the customer pays for more messages.
- **Build big strings with an array and `join`.** V8 makes `+=` in a loop cheap as long as the loop only appends; a loop that also reads the string it is building (`endsWith`, `includes`, an index; `length` is fine) copies it again on every pass and turns quadratic. [Arrays and strings under the hood](https://zudojs.oyinlola.site/learn/dsa-arrays-strings#building-strings) measures this.
- **Reuse `Intl` objects.** Creating a collator or segmenter loads locale rules. Make them once at module level, as the toolkit does, not inside a sort comparator.
- **Always pass a locale.** `localeCompare(b)` and `toLocaleLowerCase()` without a locale use the server's default, which may differ between your laptop, CI and production.
- **Look-alike characters are a security issue.** The Cyrillic `а` (U+0430) looks exactly like the Latin `a`, and normalization does not change it. A username or shop name can impersonate another one. Restrict identifiers to an allowed set of characters, or check them against Unicode's list of confusable characters, before accepting them.
- **Never build HTML, SQL or shell commands by concatenating strings.** Use escaping tags like `html`, parameterised queries ([SQL with PostgreSQL](https://zudojs.oyinlola.site/learn/sql-basics)) and argument arrays.

## Practice

TRY IT YOURSELF

### Initials that respect names

Write `initials(fullName)` that returns the first grapheme of each word, upper-cased, for an avatar badge. `"ìyábọ̀ ọlá"` should give `"ÌỌ"` (the dot below and the tone mark stay on the letter) and `"👩🏾‍🍳 Ada"` should keep the whole cook emoji. Split words on whitespace.

**Show a solution**

initials.js

```ts
const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

function initials(fullName) {
  return fullName
    .normalize("NFC")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => segmenter.segment(word)[Symbol.iterator]().next().value.segment.toUpperCase())
    .join("");
}

console.log(initials("ìyábọ̀ ọlá"));
console.log(initials("👩🏾‍🍳 Ada"));
console.log(initials("  chidi   okafor "));
console.log(JSON.stringify(initials("   ")));
```

Output of `node initials.js` and of the browser terminal

```ts
ÌỌ
👩🏾‍🍳A
CO
""
```

Taking `word[0]` would keep only the first code unit: half the emoji, or a letter without its marks when they are separate code points. The segmenter's first segment is the whole first grapheme. `filter(Boolean)` drops the empty word that `split` produces for a blank name.

TRY IT YOURSELF

### Find duplicate products

Staff keep creating the same product twice with different spelling: `"Àkàrà"` and `"akara"`, `"Rice 5kg"` and `"rice  5KG"`. Write `findDuplicates(names)` that groups names whose cleaned search keys are equal, and returns only the groups with more than one name.

**Show a solution**

duplicates.js

```ts
const key = (name) =>
  name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

function findDuplicates(names) {
  const groups = new Map();
  for (const name of names) {
    const k = key(name);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(name);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

console.log(findDuplicates(["Àkàrà", "Rice 5kg", "akara", "Beans", "rice  5KG", "ＲＩＣＥ 5kg"]));
```

Output of `node duplicates.js` and of the browser terminal

```json
[ [ 'Àkàrà', 'akara' ], [ 'Rice 5kg', 'rice  5KG', 'ＲＩＣＥ 5kg' ] ]
```

The key does all the forgiving work: NFKD turns the full-width letters into plain ones, removing marks makes accents disappear, and whitespace is collapsed. A `Map` from key to names groups them in one pass, which [Collections in depth](https://zudojs.oyinlola.site/learn/js-collections) explores further.

TRY IT YOURSELF

### A receipt column that lines up

Write `padGraphemes(text, width)` that pads with spaces to `width` *graphemes* (not code units), and use it to print a two-column receipt where the prices line up for `"Rice 5kg"`, `"Àkàrà"` (decomposed, with separate combining marks) and `"Jollof 🍲"`. Assume each grapheme is one column wide.

**Show a solution**

receipt-columns.js

```ts
const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
const width = (text) => [...segmenter.segment(text)].length;

function padGraphemes(text, size) {
  return text + " ".repeat(Math.max(0, size - width(text)));
}

const lines = [
  ["Rice 5kg", 850000],
  ["A\u0300ka\u0300ra\u0300", 150000],
  ["Jollof 🍲", 350000],
];

for (const [name, kobo] of lines) {
  console.log(`${padGraphemes(name, 12)}₦${kobo / 100}`);
}

console.log(lines.map(([name]) => width(padGraphemes(name, 12))));
console.log(lines.map(([name]) => width(name.padEnd(12))));
```

Output of `node receipt-columns.js` and of the browser terminal

```ts
Rice 5kg    ₦8500
Àkàrà       ₦1500
Jollof 🍲    ₦3500
[ 12, 12, 12 ]
[ 12, 9, 11 ]
```

The last two lines measure the padded names in graphemes. `padGraphemes` gives exactly 12 every time. `padEnd(12)` gives 12 only for plain text: the decomposed `Àkàrà` is 8 code units but 5 graphemes, and the emoji is 2 code units, so both come out short. On a real terminal the emoji is also drawn two columns wide, which no string function can know; receipt printers usually avoid emoji for that reason.

## Recap

- A JavaScript string is a sequence of UTF-16 code units. `length`, indexes, `slice`, `split("")` and `padEnd` all count code units.
- Code points above U+FFFF (most emoji) are two code units, a surrogate pair. Iteration (`for...of`, `[...text]`) walks code points; `codePointAt` reads them.
- What a person sees as one character is a grapheme cluster, possibly many code points. Count and cut with `Intl.Segmenter`. Cutting code units can leave lone surrogates, which break `encodeURIComponent` and turn into `�`.
- Equal-looking text can differ in code points. Normalise to NFC at the boundary; use NFKD plus removing `\p{M}` for forgiving search keys.
- Case mapping can change length and depends on language. Use `toLowerCase()` for identifiers, and collators with a `sensitivity` for "ignore case or accents" comparisons.
- Sort text for people with `Intl.Collator` (reuse one; add `numeric: true` for numbers inside names) and always pass the reader's locale.
- Pass a function to `replace` when the replacement comes from data; use a tag to escape every value inserted into HTML; format lists and plurals with `Intl.ListFormat` and `Intl.PluralRules`.

Next: [Numbers in depth](https://zudojs.oyinlola.site/learn/js-numbers), where naira prices, kobo, BigInt order ids and `Intl.NumberFormat` meet the limits of floating point.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
