---
title: "Files, paths and your computer"
description: "Use Node.js's built-in modules to build safe file paths, read and write files and folders, learn about the computer, make random ids and hashes, and announce events. Then save tasks to a JSON file."
source: https://zudojs.oyinlola.site/learn/node-apis
---

LESSON 20 OF 84

Node.js and npm Foundation

# Files, paths and your computer

Use Node.js's built-in modules to build safe file paths, read and write files and folders, learn about the computer, make random ids and hashes, and announce events. Then save tasks to a JSON file.

- **40 min** to read and try
- **You need:** What Node.js is
- **You build:** A command-line task list that saves its tasks in a JSON file

  [Test yourself](#test)

## Paths: never glue them by hand

A **path** says where a file is: `data/tasks.json`. It is tempting to build paths by adding strings together. Don't. Separators get doubled or lost, and Windows uses `\` where macOS and Linux use `/`. The `node:path` module knows the rules for the system your program runs on:

paths.jsNode.js only

```ts
import path from "node:path";

console.log(path.join("data", "tasks.json"));
console.log(path.join("data/", "/tasks.json"));
console.log("data/" + "/tasks.json");
console.log(path.join("data", "..", "notes", "today.txt"));

console.log(path.extname("report.final.pdf"));
console.log(path.basename("/home/ada/tasks.json"));
console.log(path.dirname("/home/ada/tasks.json"));
console.log(path.isAbsolute(path.resolve("tasks.json")));
```

Output of `node paths.js`

```ts
data/tasks.json
data/tasks.json
data//tasks.json
notes/today.txt
.pdf
tasks.json
/home/ada
true
```

Line by line:

- `path.join` puts parts together with exactly one separator, and understands `..` ("the folder above"). String concatenation produced `data//tasks.json`.
- `path.extname` gives the extension (only the last one), `path.basename` the file name, and `path.dirname` the folder it is in.
- `path.resolve` turns a path into an **absolute** path, one that starts at the root of the disk, using the current working directory from [the previous lesson](https://zudojs.oyinlola.site/learn/node-runtime#process).

On Windows, the same program prints `data\tasks.json`. Your code does not change; that is the point.

To find a file next to your code, whatever folder the program was started from, join it to `import.meta.dirname`: `path.join(import.meta.dirname, "data", "tasks.json")`.

### Paths from users are dangerous

Imagine an API that serves uploaded files by name. If a user asks for `../package.json`, a naive `path.join("uploads", name)` walks right out of the uploads folder. This attack is called **path traversal**, and it has leaked passwords and keys from real servers. The fix is to resolve the full path and check that it is still inside the folder you allow:

safe-path.jsNode.js only

```ts
import path from "node:path";

console.log("naive:", path.join("uploads", "../package.json"));

const uploads = path.resolve("uploads");

function safePath(name) {
  const full = path.resolve(uploads, name);
  if (!full.startsWith(uploads + path.sep)) {
    throw new Error(`Refused: "${name}" is outside the uploads folder`);
  }
  return full;
}

for (const name of ["photo.png", "../package.json", "/etc/passwd"]) {
  try {
    console.log("OK:", path.relative(uploads, safePath(name)));
  } catch (error) {
    console.log(error.message);
  }
}
```

Output of `node safe-path.js`

```ts
naive: package.json
OK: photo.png
Refused: "../package.json" is outside the uploads folder
Refused: "/etc/passwd" is outside the uploads folder
```

`path.resolve` also handles an absolute name like `/etc/passwd`, which ignores the folder completely. Checking with `uploads + path.sep` (not just `uploads`) stops a sneaky neighbour folder such as `uploads-old` from passing.

## Reading and writing files

`node:fs/promises` has a function for every file operation, and each returns a promise, so you `await` it. These are the ones you will use most:

files.jsNode.js only

```ts
import { appendFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const folder = "notes";
const file = path.join(folder, "today.txt");

await mkdir(folder, { recursive: true });
await writeFile(file, "Buy milk\n");
await appendFile(file, "Call Ada\n");

const text = await readFile(file, "utf8");
console.log(text);

console.log("files in notes:", await readdir(folder));

const info = await stat(file);
console.log(`${info.size} bytes, file: ${info.isFile()}, folder: ${info.isDirectory()}`);
```

Output of `node files.js`

```ts
Buy milk
Call Ada

files in notes: [ 'today.txt' ]
18 bytes, file: true, folder: false
```

- `mkdir` makes a folder. `{ recursive: true }` also makes missing parent folders, and does not fail if the folder already exists.
- `writeFile` creates the file, or replaces everything in it. `appendFile` adds to the end.
- `readFile(file, "utf8")` returns the text. Without `"utf8"` you get raw bytes instead, a `Buffer`, which the [Streams and buffers](https://zudojs.oyinlola.site/learn/node-streams) lesson explains.
- `readdir` lists a folder. `stat` describes a file: its size in bytes, when it changed, and whether it is a file or a folder.

There is an empty line after `Call Ada` because the text ends with `\n` and `console.log` adds one more. Run it twice and `today.txt` still has two lines, because `writeFile` starts it over each time.

> NOTE
>
> Node.js also has `readFileSync` and friends in `node:fs`. They block the event loop until the disk answers. That is fine while a program starts up, but never inside a server's request handling, where it makes every other user wait.

### When the file is not there

Files go missing: the first time a program runs, or when someone deletes one. A failed file operation throws an error with a `code` that tells you why. `ENOENT` ("error: no entry") means the file does not exist:

missing.jsNode.js only

```ts
import { readFile } from "node:fs/promises";

async function readSettings(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(`${file} does not exist yet, using the defaults`);
      return { theme: "light" };
    }
    throw error;
  }
}

console.log(await readSettings("settings.json"));

try {
  await readFile("missing.txt", "utf8");
} catch (error) {
  console.log(error.code);
  console.log(error.message);
}
```

Output of `node missing.js`

```ts
settings.json does not exist yet, using the defaults
{ theme: 'light' }
ENOENT
ENOENT: no such file or directory, open 'missing.txt'
```

Only the error you expect is handled. Anything else, such as `EACCES` (no permission) or broken JSON in the file, is thrown again, as you learned in [Errors](https://zudojs.oyinlola.site/learn/js-errors). Other codes you will meet: `EEXIST` (already exists) and `EISDIR` (that is a folder, not a file).

## The computer: node:os

`node:os` tells you about the machine: the operating system, the processor and the memory. Servers use it to decide, for example, how many workers to start.

machine.jsNode.js only

```ts
import os from "node:os";

const gb = (bytes) => (bytes / 1024 ** 3).toFixed(1) + " GB";

console.log("system:", os.platform(), os.arch());
console.log("processor cores:", os.availableParallelism());
console.log("memory:", gb(os.totalmem()), "total,", gb(os.freemem()), "free");
console.log("line ending:", JSON.stringify(os.EOL));
```

Output of `node machine.js`

```ts
system: linux x64
processor cores: 8
memory: 15.5 GB total, 5.5 GB free
line ending: "\n"
```

Your values will differ. On a Mac, `os.platform()` says `darwin`; on Windows it says `win32` and the line ending is `"\r\n"`.

## Random ids and hashes: node:crypto

A backend constantly needs values nobody can guess: ids for new records, tokens for password-reset links. `Math.random()` is **not** safe for that; its numbers can be predicted. `node:crypto` uses the operating system's secure random source:

random.jsNode.js only

```ts
import { randomBytes, randomUUID } from "node:crypto";

console.log("id:", randomUUID());
console.log("token:", randomBytes(16).toString("hex"));
```

Output of `node random.js`

```ts
id: 33a94ea8-819f-4b9d-909b-bcd700ff3a9b
token: eb020d8ca1752a399ad4a9b7033c4add
```

- `randomUUID()` makes a **UUID**, a standard 36-character id that is different every time.
- `randomBytes(16)` makes 16 random bytes; `.toString("hex")` writes them as 32 hexadecimal characters (0 to 9 and a to f). Run the program again and both lines change.

A **hash** turns any data into a fixed-length fingerprint. The same input always gives the same hash, and a one-character change gives a completely different one. You cannot turn a hash back into the data. Hashes are used, for example, to check that a file has not changed:

hash.jsNode.js only

```ts
import { createHash } from "node:crypto";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

console.log(sha256("Buy milk"));
console.log(sha256("Buy milk"));
console.log(sha256("Buy milk!"));
```

Output of `node hash.js`

```ts
df3db8a9ea05f22ce0238a243ce14e9e7829f22b5fdec7e6536f656849e46db1
df3db8a9ea05f22ce0238a243ce14e9e7829f22b5fdec7e6536f656849e46db1
392572885fec86870d83f336795b4edc9d4f11348a9995cf795640eb76819174
```

SHA-256 is a standard hash, so you get exactly these values on your computer too.

> NOT FOR PASSWORDS
>
> Do not store passwords as `sha256` hashes. SHA-256 is designed to be fast, so an attacker who steals your database can try billions of guesses per second. Passwords need a slow, salted hash made for the job. You will use one in [the ZudoJS authentication lesson](https://zudojs.oyinlola.site/learn/zudo-auth).

## Announcing events: EventEmitter

Many Node.js objects announce things that happen to them: a server says "request", a stream says "data". They are **event emitters**. You can make your own with `EventEmitter` from `node:events`. `on` registers a **listener**, a function to call for a named event; `emit` fires the event and calls every listener with the values you pass:

emitter.jsNode.js only

```ts
import { EventEmitter } from "node:events";

const tasks = new EventEmitter();

tasks.on("added", (task) => console.log(`[log] added #${task.id}`));
tasks.on("added", (task) => console.log(`[mail] tell the team about "${task.title}"`));
tasks.once("completed", (task) => console.log(`first task completed: #${task.id}`));

tasks.emit("added", { id: 1, title: "Buy milk" });
tasks.emit("completed", { id: 1 });
tasks.emit("completed", { id: 2 });

try {
  tasks.emit("error", new Error("disk full"));
} catch (error) {
  console.log("nobody listened for error, so emit threw:", error.message);
}
```

Output of `node emitter.js`

```json
[log] added #1
[mail] tell the team about "Buy milk"
first task completed: #1
nobody listened for error, so emit threw: disk full
```

- Several listeners can wait for the same event. They run in the order they were added, synchronously, during `emit`.
- `once` listens for the first time only, which is why task 2 printed nothing.
- The `"error"` event is special. If nobody listens for it, `emit` throws, and an uncaught error ends the program. Always listen for `"error"` on emitters that can fail, such as servers and streams.

Events keep code apart: the code that adds a task does not need to know about logging or e-mail. Later in the course, [ZudoJS events](https://zudojs.oyinlola.site/learn/zudo-events) take this idea across a whole application.

## Build: a task list saved to a JSON file

Now put the pieces together. The task list keeps its tasks in `data/tasks.json`, so they survive when the program ends. The store is an `EventEmitter`, so the program can react when something changes.

store.jsNode.js only

```ts
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export class TaskStore extends EventEmitter {
  constructor(file) {
    super();
    this.file = file;
  }

  async list() {
    try {
      return JSON.parse(await readFile(this.file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async save(tasks) {
    await mkdir(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(tasks, null, 2) + "\n");
    await rename(temp, this.file);
  }

  async add(title) {
    if (typeof title !== "string" || title.trim() === "") {
      throw new Error("title must not be empty");
    }
    const tasks = await this.list();
    const id = Math.max(0, ...tasks.map((t) => t.id)) + 1;
    const task = { id, title: title.trim(), done: false };
    await this.save([...tasks, task]);
    this.emit("added", task);
    return task;
  }

  async complete(id) {
    const tasks = await this.list();
    const task = tasks.find((t) => t.id === id);
    if (!task) throw new Error(`task ${id} not found`);
    task.done = true;
    await this.save(tasks);
    this.emit("completed", task);
    return task;
  }
}
```

Two details are worth a closer look:

- `list` treats a missing file as "no tasks yet", the `ENOENT` pattern from above.
- `save` writes to a temporary file first, then **renames** it over the real file. A rename happens all at once. If the computer crashes halfway through writing, you lose the new change but the old file is still whole, instead of being left half-written. The random UUID in the temporary name keeps two saves from writing into the same temporary file.

The command-line program reads a command from `process.argv`:

tasks.jsNode.js only

```ts
import path from "node:path";
import { TaskStore } from "./store.js";

const store = new TaskStore(path.join(import.meta.dirname, "data", "tasks.json"));
store.on("added", (task) => console.log(`Added #${task.id}: ${task.title}`));
store.on("completed", (task) => console.log(`Completed #${task.id}: ${task.title}`));

const [command, value] = process.argv.slice(2);

try {
  if (command === "add") {
    await store.add(value ?? "");
  } else if (command === "done") {
    await store.complete(Number(value));
  } else if (command === "list") {
    for (const task of await store.list()) {
      console.log(`${task.done ? "[x]" : "[ ]"} #${task.id} ${task.title}`);
    }
  } else {
    console.error("Usage: node tasks.js add <title> | done <id> | list");
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
```

Output of `node tasks.js`

```ts
Usage: node tasks.js add <title> | done <id> | list
```

Run without a command, it explains how to use it. Save both files in a new folder and try it on your computer:

Terminal on your computer

```bash
$ node tasks.js add "Buy milk"
Added #1: Buy milk
$ node tasks.js add "Write report"
Added #2: Write report
$ node tasks.js done 1
Completed #1: Buy milk
$ node tasks.js list
[x] #1 Buy milk
[ ] #2 Write report
$ node tasks.js done 7
Error: task 7 not found
$ node tasks.js add "  "
Error: title must not be empty
$ cat data/tasks.json
[
  {
    "id": 1,
    "title": "Buy milk",
    "done": true
  },
  {
    "id": 2,
    "title": "Write report",
    "done": false
  }
]
```

Every command is a new process, yet the tasks are still there, because they live in a file. `cat` prints a file on macOS and Linux; in PowerShell, use `Get-Content data/tasks.json`.

### Where a JSON file stops being enough

A file works for one person at a time. A server handles many requests at once. Watch what happens when two tasks are added at the same moment:

race.jsNode.js only

```ts
import { rm } from "node:fs/promises";
import { TaskStore } from "./store.js";

await rm("race.json", { force: true });
const store = new TaskStore("race.json");

const [a, b] = await Promise.all([store.add("Task A"), store.add("Task B")]);
console.log("ids given out:", a.id, b.id);

const saved = await store.list();
console.log("tasks in the file:", saved.length);
```

Output of `node race.js`

```ts
ids given out: 1 1
tasks in the file: 1
```

Both calls read the file while it was still empty, both picked id 1, and whichever write finished last replaced the other. One task is lost (which one changes from run to run), and nothing reported an error. This is called a **race condition**. Databases exist to solve exactly this, and you will switch to one in [Databases](https://zudojs.oyinlola.site/learn/databases).

## Practice

TRY IT YOURSELF

### Count files by extension

Write a program that lists the `notes` folder from earlier and counts its files by extension. Create a few files first, so the answer is interesting.

**Show a solution**

extensions.jsNode.js only

```ts
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

await mkdir("notes", { recursive: true });
for (const name of ["today.txt", "todo.txt", "plan.md", "photo.png"]) {
  await writeFile(path.join("notes", name), "");
}

const counts = {};
for (const name of (await readdir("notes")).sort()) {
  const ext = path.extname(name) || "(none)";
  counts[ext] = (counts[ext] ?? 0) + 1;
}
console.log(counts);
```

Output of `node extensions.js`

```json
{ '.png': 1, '.md': 1, '.txt': 2 }
```

TRY IT YOURSELF

### Remove a task

Add a `remove(id)` method to `TaskStore` that deletes a task, emits `"removed"`, and throws `task 9 not found` (with the real id) when it is missing.

**Show a solution**

remove.jsNode.js only

```ts
import { rm } from "node:fs/promises";
import { TaskStore } from "./store.js";

class RemovableStore extends TaskStore {
  async remove(id) {
    const tasks = await this.list();
    const task = tasks.find((t) => t.id === id);
    if (!task) throw new Error(`task ${id} not found`);
    await this.save(tasks.filter((t) => t.id !== id));
    this.emit("removed", task);
    return task;
  }
}

await rm("remove.json", { force: true });
const store = new RemovableStore("remove.json");
store.on("removed", (task) => console.log(`Removed #${task.id}: ${task.title}`));

await store.add("Buy milk");
await store.add("Write report");
await store.remove(1);
console.log(await store.list());

try {
  await store.remove(9);
} catch (error) {
  console.log(error.message);
}
```

Output of `node remove.js`

```ts
Removed #1: Buy milk
[ { id: 2, title: 'Write report', done: false } ]
task 9 not found
```

In your own project, put the method straight into `TaskStore`. The solution extends the class only so it can reuse `store.js` from above without repeating it.

TRY IT YOURSELF

### Has the file changed?

Write `fingerprint(file)` that returns the SHA-256 hash of a file's contents. Show that the fingerprint changes after you append a line.

**Show a solution**

fingerprint.jsNode.js only

```ts
import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";

async function fingerprint(file) {
  const data = await readFile(file);
  return createHash("sha256").update(data).digest("hex");
}

await writeFile("list.txt", "Buy milk\n");
const before = await fingerprint("list.txt");
console.log("same when unchanged:", before === (await fingerprint("list.txt")));

await appendFile("list.txt", "Call Ada\n");
console.log("same after a change:", before === (await fingerprint("list.txt")));
```

Output of `node fingerprint.js`

```ts
same when unchanged: true
same after a change: false
```

## Recap

- Build paths with `path.join` and `path.resolve`, never with `+`. Check that a path built from user input stays inside the folder you allow.
- `node:fs/promises` reads, writes, appends, lists and describes files. A missing file throws an error with `code === "ENOENT"`; handle that case and re-throw the rest.
- `node:os` describes the computer. `node:crypto` makes unguessable ids and tokens, and hashes that fingerprint data (but not passwords).
- An `EventEmitter` calls every listener when you `emit`. Always listen for `"error"`.
- A JSON file keeps data between runs, but loses writes when two happen at once. That is a job for a database.

Next, you will learn what the bytes in a file really are, and how to handle files far too big to read in one go.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
