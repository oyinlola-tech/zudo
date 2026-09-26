---
title: "Objects and JSON — ZudoJS Academy"
description: "Group related values into objects, read and change their properties, copy and take them apart safely, and turn them into JSON, the text format every API speaks."
source: https://zudojs.oyinlola.site/learn/js-data
---

LEVEL 2 · LESSON 10 OF 19

Arrays and objects Foundation

# Objects and JSON

Group related values into objects, read and change their properties, copy and take them apart safely, and turn them into JSON, the text format every API speaks.

- **40 min** to read and try
- **You need:** Arrays, Functions and Types in depth
- **You build:** A small user profile system that creates, updates and publishes profiles safely

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Group related values into objects and read, add, change and delete their properties
- Choose between an array and an object for a piece of data
- Loop over and transform objects with Object.keys, values, entries and fromEntries
- Copy and merge objects with spread and structuredClone, and take them apart with destructuring
- Turn data into JSON and back, and know what JSON cannot carry
- Accept outside changes safely with an allow-list instead of spreading them

## What an object is

A user of your app has several pieces of information: a name, an e-mail address, an age. You could keep them in three separate variables, but they belong together. An **object** keeps related values together under one name.

Each piece of an object is a **property**: a name (also called a **key**), a colon, and a value. The value can be anything: a string, a number, a boolean, an array, even another object.

object.js

```ts
const user = {
  name: "Ada",
  email: "ada@example.com",
  age: 36,
  active: true,
  skills: ["math", "writing"],
};

console.log(user);
console.log(typeof user);
```

Output of `node object.js` and of the browser terminal

```json
{
  name: 'Ada',
  email: 'ada@example.com',
  age: 36,
  active: true,
  skills: [ 'math', 'writing' ]
}
object
```

The object is too long for one line, so Node.js prints one property per line. It shows strings with single quotes. That is only how Node.js displays them: the value is still the text `Ada`.

You already know arrays from [the arrays lesson](https://zudojs.oyinlola.site/learn/js-arrays). Use an array when you have a *list* of similar things in order. Use an object when you have one *thing* with named parts.

## Methods and nested objects

A property whose value is a function is called a **method**. A property whose value is another object makes a **nested object**. Real data is full of both:

nested.js

```ts
const user = {
  name: "Ada",
  address: {
    city: "London",
    country: "UK",
  },
  greet() {
    return "Hello, I am " + this.name;
  },
};

console.log(user.address);
console.log(user.address.city);
console.log(user.greet());
```

Output of `node nested.js` and of the browser terminal

```json
{ city: 'London', country: 'UK' }
London
Hello, I am Ada
```

- `user.address.city` reads from left to right: take `user`, then its `address`, then that object's `city`.
- `greet() { ... }` is the short way to write a method. You call it with parentheses: `user.greet()`.
- Inside a method, `this` means "the object the method was called on", here `user`. [this, prototypes and classes](https://zudojs.oyinlola.site/learn/js-classes#this), later in this course, shows how it can get lost, and [this in depth](https://zudojs.oyinlola.site/learn/js-this), in the Advanced JavaScript course, covers every rule.

## Reading properties

There are two ways to read a property:

- The **dot**: `user.name`. Use it when you know the name while writing the code.
- **Square brackets** with a string: `user["name"]`. Use it when the name is stored in a variable, or is not a valid variable name (for example it contains a dash).

read.js

```ts
const user = { name: "Ada", "last-login": "2026-09-01", age: 36 };

console.log(user.name);
console.log(user["last-login"]);

const field = "age";
console.log(user[field]);

console.log(user.phone);
console.log("phone" in user, "age" in user);
```

Output of `node read.js` and of the browser terminal

```ts
Ada
2026-09-01
36
undefined
false true
```

Reading a property that does not exist gives `undefined`. It does not crash. That is convenient, and it is also how typos slip through: `user.nmae` is just `undefined`. The `in` operator answers the question "does this object have a property with this name?".

Reading a property of `undefined` *does* crash. If a user has no `address`, then `user.address.city` fails with `TypeError: Cannot read properties of undefined (reading 'city')`. The safe way to write it is `user.address?.city`, the optional chaining you met in [Operators](https://zudojs.oyinlola.site/learn/js-operators#optional-chaining).

## Updating, adding and deleting

Assign to a property to change it. Assign to a name that does not exist yet to add it. Use `delete` to remove a property completely:

change.js

```ts
const user = { name: "Ada", email: "ada@example.com", age: 36 };

user.age = 37;
user.city = "London";
delete user.email;

console.log(user);
console.log(user.email);
```

Output of `node change.js` and of the browser terminal

```json
{ name: 'Ada', age: 37, city: 'London' }
undefined
```

This works even though `user` is a `const`. `const` only stops the *name* `user` from pointing at a different object. It does not freeze the object itself. If you want an object that nobody can change, call `Object.freeze(user)` (see [Types in depth](https://zudojs.oyinlola.site/learn/js-types-deep#mutability)).

## Objects are shared, not copied

You met this in [Types in depth](https://zudojs.oyinlola.site/learn/js-types-deep#copy-or-share), and it matters more with every object you build: a variable holds a **reference** to an object, not the object itself. Assigning an object to a second variable, or passing it to a function, copies the reference, so both names point at the same object:

shared.js

```ts
const user = { name: "Ada", age: 36 };
const sameUser = user;

sameUser.age = 99;

console.log(user.age);
console.log(user === sameUser);
console.log({ name: "Ada" } === { name: "Ada" });
```

Output of `node shared.js` and of the browser terminal

```ts
99
true
false
```

Changing `sameUser` changed `user`, and `===` on objects asks "is this the *same* object?", not "do they look the same?". Many bugs in real backends come from a function quietly changing an object that someone else is still using. The next sections show how to make real copies.

## Shorthand and computed properties

Two short ways to build objects appear in almost every JavaScript file:

- **Shorthand**: when the property name and the variable name are the same, write the name once. `{ name }` means `{ name: name }`.
- **Computed property**: put an expression in square brackets to decide the property's name when the code runs. `{ [field]: value }` uses the value of `field` as the name.

shorthand.js

```ts
const name = "Ada";
const email = "ada@example.com";

const user = { name, email };
console.log(user);

function setting(key, value) {
  return { [key]: value, updatedBy: name };
}

console.log(setting("theme", "dark"));
console.log(setting("language", "en"));
```

Output of `node shorthand.js` and of the browser terminal

```json
{ name: 'Ada', email: 'ada@example.com' }
{ theme: 'dark', updatedBy: 'Ada' }
{ language: 'en', updatedBy: 'Ada' }
```

The same function made an object with a `theme` property and one with a `language` property, because the name came from the `key` argument.

## Looping over an object

An object is not a list, so it has no `map` or `forEach`. Instead, the built-in `Object` helpers turn it into arrays you already know how to use:

- `Object.keys(obj)`: an array of the property names.
- `Object.values(obj)`: an array of the values.
- `Object.entries(obj)`: an array of `[name, value]` pairs.
- `Object.fromEntries(pairs)`: the reverse, pairs back into an object.

entries.js

```ts
const settings = { theme: "dark", language: "en", pageSize: 20 };

console.log(Object.keys(settings));
console.log(Object.values(settings));

for (const [key, value] of Object.entries(settings)) {
  console.log(`${key} = ${value}`);
}

const onlyText = Object.fromEntries(
  Object.entries(settings).filter(([, value]) => typeof value === "string"),
);
console.log(onlyText);
```

Output of `node entries.js` and of the browser terminal

```json
[ 'theme', 'language', 'pageSize' ]
[ 'dark', 'en', 20 ]
theme = dark
language = en
pageSize = 20
{ theme: 'dark', language: 'en' }
```

`const [key, value]` takes each pair apart into two variables. That is array destructuring, which you will see more of in a moment. The last part is a pattern worth remembering: `entries`, then an array method such as `filter` or `map`, then `fromEntries`. It lets you transform an object with the array tools from [the arrays lesson](https://zudojs.oyinlola.site/learn/js-arrays).

## Copying and merging: spread and Object.assign

The **spread** syntax `...` inside `{ }` copies every property of an object into a new object. Properties written after it replace the copied ones. That makes it the standard way to "change one field" without touching the original:

spread.js

```ts
const defaults = { theme: "light", language: "en", pageSize: 20 };
const chosen = { theme: "dark" };

const settings = { ...defaults, ...chosen };
console.log(settings);
console.log(defaults);

const merged = Object.assign({}, defaults, { pageSize: 50 });
console.log(merged);
```

Output of `node spread.js` and of the browser terminal

```json
{ theme: 'dark', language: 'en', pageSize: 20 }
{ theme: 'light', language: 'en', pageSize: 20 }
{ theme: 'light', language: 'en', pageSize: 50 }
```

When two objects have the same property, the one that comes *later* wins. `Object.assign(target, ...sources)` does the same thing, but it writes into its first argument. Passing a fresh `{}` first keeps `defaults` untouched. In new code, spread is more common.

### Spread copies only one level

Spread makes a **shallow copy**: the top-level properties are new, but a nested object is still shared. For a full, **deep copy**, use `structuredClone`:

deep.js

```ts
const user = { name: "Ada", address: { city: "London" } };

const shallow = { ...user };
shallow.address.city = "Paris";
console.log(user.address.city);

const deep = structuredClone(user);
deep.address.city = "Rome";
console.log(user.address.city, deep.address.city);
```

Output of `node deep.js` and of the browser terminal

```ts
Paris
Paris Rome
```

Changing the shallow copy's address changed the original's too, because both share one `address` object. The deep copy has its own.

## Taking objects apart: destructuring

**Destructuring** pulls properties out into variables in one line. Write the property names inside `{ }` on the left of `=`. Add `...rest` at the end to collect every property you did not name into a new object:

destructure.js

```ts
const user = {
  id: 7,
  name: "Ada",
  email: "ada@example.com",
  passwordHash: "<hash>",
};

const { name, email } = user;
console.log(name, email);

const { passwordHash, ...publicUser } = user;
console.log(publicUser);
```

Output of `node destructure.js` and of the browser terminal

```ts
Ada ada@example.com
{ id: 7, name: 'Ada', email: 'ada@example.com' }
```

The second pattern is one a backend uses every day: it takes the fields you must never send to a client out of the object, and keeps everything else. A real app stores a password *hash* made by a library, never the password itself. You will do that in [the authentication lesson](https://zudojs.oyinlola.site/learn/zudo-auth).

Destructuring can do more: defaults, renaming, nested objects and arrays. [Modern JavaScript](https://zudojs.oyinlola.site/learn/js-modern) covers all of it.

## JSON: how data travels

A backend cannot send a JavaScript object over the network. It sends text. The text format almost every API uses is **JSON**, short for JavaScript Object Notation. It looks almost exactly like the objects you just wrote.

`JSON.stringify` turns a value into JSON text. `JSON.parse` turns JSON text back into a value:

json.js

```ts
const task = { id: 1, title: "Buy milk", done: false, tags: ["home"] };

const text = JSON.stringify(task);
console.log(text);
console.log(typeof text);

const back = JSON.parse(text);
console.log(back.title, back.tags[0]);

console.log(JSON.stringify(task, null, 2));
```

Output of `node json.js` and of the browser terminal

```json
{"id":1,"title":"Buy milk","done":false,"tags":["home"]}
string
Buy milk home
{
  "id": 1,
  "title": "Buy milk",
  "done": false,
  "tags": [
    "home"
  ]
}
```

JSON has a few rules that JavaScript objects do not: property names must be in double quotes, and there are no comments and no trailing commas. The extra `null, 2` tells `JSON.stringify` to indent with two spaces, which is easier to read.

### What JSON cannot carry

JSON only knows strings, numbers, booleans, `null`, arrays and plain objects. Everything else changes or disappears on the way:

json-limits.js

```ts
const task = {
  title: "Buy milk",
  note: undefined,
  due: new Date("2026-10-01T09:00:00Z"),
  describe() {
    return this.title;
  },
};

const text = JSON.stringify(task);
console.log(text);

const back = JSON.parse(text);
console.log(typeof back.due);
```

Output of `node json-limits.js` and of the browser terminal

```json
{"title":"Buy milk","due":"2026-10-01T09:00:00.000Z"}
string
```

The `undefined` property and the method vanished. The date became a string, and `JSON.parse` does not turn it back into a date: it stays a string. When your API receives JSON, you get plain data and must check and convert it yourself.

When a client sends data to your API, it arrives as JSON text and your code calls `JSON.parse` on it. Text that is not valid JSON makes `JSON.parse` throw an error. You will learn to handle that in [Handling errors](https://zudojs.oyinlola.site/learn/js-errors).

## Build: a user profile system

Time to put it together. A profile system needs three things:

1. `createProfile(input)`: fill in defaults for anything the user left out.
2. `updateProfile(profile, changes)`: apply the changes a user sends, and return a new profile.
3. `toPublic(profile)`: the version that is safe to send back as JSON.

REASON IT OUT

### Before you code: what may a user change?

The mobile app sends profile changes as JSON, for example `{"theme":"dark"}`. Anyone can send any JSON to your API, not only your app. Before writing `updateProfile`, think it through:

- A profile has `id`, `name`, `role`, `theme`, `language` and `bio`. Which of them may the user change about themselves?
- What happens if the code simply merges everything that was sent into the stored profile?
- What should happen to a field the server does not recognise, such as `"isVerified": true`?
- Should `updateProfile` change the profile it receives, or return a new one?

**Show the reasoning**

**Editable:** `name`, `theme`, `language` and `bio`. **Never editable by the user:** `id` (it identifies the record) and `role` (it decides what they are allowed to do).

**Merging everything** lets the caller set `role` to `"admin"` or change their `id` to someone else's. That is a real attack, shown next.

**Unknown fields** must be ignored (or rejected with an error). The safe design is an **allow-list**: name the fields that may change, and drop everything else. A block-list ("everything except `role`") breaks the day someone adds a new sensitive field.

**New object:** returning a new profile means the old one is still intact if a later step fails, and no other code holding the old object sees a half-applied change.

Here is a first try at `updateProfile`. It has a serious bug:

profile-bug.js

```ts
function updateProfile(profile, changes) {
  return { ...profile, ...changes };
}

const ada = { id: 1, name: "Ada", role: "user", theme: "light" };

const changes = JSON.parse('{"theme":"dark","role":"admin"}');
const updated = updateProfile(ada, changes);

console.log(updated);
```

Output of `node profile-bug.js` and of the browser terminal

```json
{ id: 1, name: 'Ada', role: 'admin', theme: 'dark' }
```

> Insecure on purpose
>
> The user asked to change their theme, and also sent `"role":"admin"`. Spreading everything the client sent made them an administrator. This is a real class of security bug, called **mass assignment**. Never copy outside input into a stored object as it is.

The fix is an **allow-list**: a fixed list of fields a user may change. Anything else is ignored. Here is the whole system, with the fix:

profiles.js

```ts
const DEFAULTS = { theme: "light", language: "en", bio: "" };
const EDITABLE = ["name", "theme", "language", "bio"];

let nextId = 1;

function createProfile(input) {
  const profile = { ...DEFAULTS, id: nextId, role: "user", name: input.name };
  nextId += 1;
  return updateProfile(profile, input);
}

function updateProfile(profile, changes) {
  const allowed = Object.entries(changes).filter(([key]) => EDITABLE.includes(key));
  return { ...profile, ...Object.fromEntries(allowed) };
}

function toPublic(profile) {
  const { role, ...rest } = profile;
  return { ...rest, isAdmin: role === "admin" };
}

const ada = createProfile({ name: "Ada", theme: "dark", role: "admin" });
console.log(ada);

const changed = updateProfile(ada, JSON.parse('{"bio":"Math fan","id":99}'));
console.log(changed);
console.log(ada.bio === "");

console.log(JSON.stringify(toPublic(changed)));
```

Output of `node profiles.js` and of the browser terminal

```json
{
  theme: 'dark',
  language: 'en',
  bio: '',
  id: 1,
  role: 'user',
  name: 'Ada'
}
{
  theme: 'dark',
  language: 'en',
  bio: 'Math fan',
  id: 1,
  role: 'user',
  name: 'Ada'
}
true
{"theme":"dark","language":"en","bio":"Math fan","id":1,"name":"Ada","isAdmin":false}
```

Read the output line by line:

- `createProfile` kept `theme: 'dark'` but ignored `role: 'admin'`. The role is always set by the server, never by the user.
- `updateProfile` accepted the new `bio` but ignored the attempt to change `id`.
- `ada.bio` is still empty: every function returned a *new* object and never changed its input.
- `toPublic` used destructuring with `...rest` to drop `role`, and added a computed `isAdmin` field instead.

Later in the course, `@zudojs/schema` and `@zudojs/validation` check incoming data for you. The idea stays the same: decide which fields you accept, and ignore or reject the rest.

## Practice

TRY IT YOURSELF

### Count the filled-in fields

Write `filledFields(profile)` that returns how many properties have a value that is not an empty string. Use `Object.values`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`Object.values(profile)` gives an array of the values. Filter out the empty strings, then count what is left.

HINT 2

`return Object.values(profile).filter((value) => value !== "").length;`

SOLUTION

filled.js

```ts
function filledFields(profile) {
  return Object.values(profile).filter((value) => value !== "").length;
}

console.log(filledFields({ name: "Ada", bio: "", city: "London" }));
console.log(filledFields({ name: "", bio: "" }));
```

Output of `node filled.js` and of the browser terminal

```ts
2
0
```

TRY IT YOURSELF

### Rename keys for an old client

An old mobile app expects `user_name` instead of `name`, and `user_email` instead of `email`. Write `withPrefix(obj, prefix)` that returns a new object where every key starts with the prefix. Use `Object.entries`, `map` and `Object.fromEntries`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`Object.entries(obj)` gives `[key, value]` pairs. `map` can change the key of each pair; `Object.fromEntries` turns the pairs back into an object.

HINT 2

`Object.fromEntries(Object.entries(obj).map(([key, value]) => [prefix + key, value]))`

SOLUTION

prefix.js

```ts
function withPrefix(obj, prefix) {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [prefix + key, value]),
  );
}

const user = { name: "Ada", email: "ada@example.com" };
console.log(withPrefix(user, "user_"));
console.log(user);
```

Output of `node prefix.js` and of the browser terminal

```json
{ user_name: 'Ada', user_email: 'ada@example.com' }
{ name: 'Ada', email: 'ada@example.com' }
```

TRY IT YOURSELF

### Find the shared object

This code tries to give each new user their own copy of the default settings, but changing Grace's settings also changes Ada's. Explain why, and fix it.

shared-bug.js

```ts
const defaultSettings = { theme: "light", alerts: { email: true } };

const ada = { name: "Ada", settings: { ...defaultSettings } };
const grace = { name: "Grace", settings: { ...defaultSettings } };

grace.settings.alerts.email = false;
console.log(ada.settings.alerts.email);
```

Output of `node shared-bug.js` and of the browser terminal

```ts
false
```

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`{ ...defaultSettings }` only copies the top level. Both users' `settings` objects still point at the very same nested `alerts` object.

HINT 2

Replace `{ ...defaultSettings }` with `structuredClone(defaultSettings)` for each user.

SOLUTION

Spread copies only one level. Both users got their own `settings` object, but both of those point at the *same* `alerts` object. Use `structuredClone` to copy every level:

shared-fix.js

```ts
const defaultSettings = { theme: "light", alerts: { email: true } };

const ada = { name: "Ada", settings: structuredClone(defaultSettings) };
const grace = { name: "Grace", settings: structuredClone(defaultSettings) };

grace.settings.alerts.email = false;
console.log(ada.settings.alerts.email, grace.settings.alerts.email);
```

Output of `node shared-fix.js` and of the browser terminal

```ts
true false
```

## Recap

- An object groups named values. A property can hold any value, including a function (a method) or another object.
- Read with `obj.name` or `obj[expression]`. Assign to change or add a property, and `delete` to remove one.
- Variables hold references. Two names can point at one object, and `===` compares identity, not contents.
- `{ name }` is shorthand, `{ [key]: value }` is a computed property.
- `Object.keys`, `values`, `entries` and `fromEntries` let you use array tools on objects.
- `{ ...a, ...b }` copies and merges one level deep. `structuredClone` copies every level.
- Never spread outside input into stored data: keep an allow-list of the fields a user may change.
- JSON is the text format APIs use. `JSON.stringify` writes it and `JSON.parse` reads it. Dates become strings, and functions and `undefined` disappear.

Next, [Objects in depth](https://zudojs.oyinlola.site/learn/js-objects-deep): lock an object's shape, check every write, and copy and compare objects on purpose.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
