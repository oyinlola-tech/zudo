---
title: "Streams and buffers — ZudoJS Academy"
description: "Learn what bytes and buffers are, then process files far bigger than memory piece by piece with readable, writable and transform streams, pipeline and readline."
source: https://zudojs.oyinlola.site/learn/node-streams
---

LEVEL 4 · LESSON 3 OF 20

Node.js Core

# Streams and buffers

Learn what bytes and buffers are, then process files far bigger than memory piece by piece with readable, writable and transform streams, pipeline and readline.

- **35 min** to read and try
- **You need:** Files, paths and your computer
- **You build:** A program that generates a 200,000-line log file and counts its lines and words with streams

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Turn text into bytes and back with Buffer, and explain why cutting bytes can cut a character in half
- Explain when a stream beats reading a whole file, and what readable, writable and transform streams do
- Respect backpressure by waiting for drain when write returns false
- Connect streams with pipeline and handle a failure anywhere in the chain
- Read a huge file line by line with readline and for await

## Bytes and buffers

A computer stores everything as **bytes**: numbers from 0 to 255. A file on disk, a network message and an image are all just a row of bytes. Text becomes bytes through an **encoding**, a rule that says which bytes stand for which character. The encoding used almost everywhere today is **UTF-8**.

In Node.js, a row of bytes is a **Buffer**. `Buffer` is global, so you don't import it:

bytes.jsNode.js only

```ts
const buf = Buffer.from("héllo", "utf8");

console.log(buf);
console.log("characters:", "héllo".length, "bytes:", buf.length);
console.log("first byte:", buf[0]);

console.log(buf.toString("utf8"));
console.log(buf.toString("hex"));
console.log(buf.toString("base64"));
console.log(Buffer.from("aMOpbGxv", "base64").toString("utf8"));
```

Output of `node bytes.js`

```ts
<Buffer 68 c3 a9 6c 6c 6f>
characters: 5 bytes: 6
first byte: 104
héllo
68c3a96c6c6f
aMOpbGxv
héllo
```

- `Buffer.from(text, "utf8")` turns text into bytes. Node.js prints each byte in hexadecimal: `68` is `h`.
- The word has 5 characters but 6 bytes. English letters take one byte in UTF-8, but `é` takes two (`c3 a9`). Other characters take three or four.
- A buffer works like an array of numbers: `buf[0]` is 104, the code for `h`.
- `toString(encoding)` turns bytes back into text. **hex** and **base64** are ways to write any bytes using only safe, printable characters. You will see base64 in e-mail attachments, images inside web pages and tokens.

Why does this matter? Because data does not always arrive in one piece. If you cut the bytes of a word in the wrong place, you cut a character in half:

half.jsNode.js only

```ts
const buf = Buffer.from("café");
console.log(buf.length, "bytes");

const first = buf.subarray(0, 4);
const rest = buf.subarray(4);
console.log(JSON.stringify(first.toString()), JSON.stringify(rest.toString()));

console.log(Buffer.concat([first, rest]).toString());
```

Output of `node half.js`

```ts
5 bytes
"caf�" "�"
café
```

`subarray` takes a slice of the bytes. The first slice ends in the middle of `é`, so each half ends up with `�`, the "replacement character", which means "these bytes are not valid text". Joining the bytes first with `Buffer.concat`, then decoding, gives the right word. Keep this in mind for the next sections: the tools you will use handle it for you, if you use them.

## Why streams

In [Files, paths and your computer](https://zudojs.oyinlola.site/learn/node-apis#fs), `readFile` loaded a whole file into memory at once. That is fine for a settings file. It is not fine for a 10 GB log file, a video upload or a database export: the program runs out of memory, and while it reads, it holds on to all of it.

A **stream** handles data piece by piece. Each piece is called a **chunk**. You process one chunk, let it go, and take the next, so memory use stays small whatever the size of the data. There are three kinds you will use:

- A **readable** stream gives you data: a file you read, a request arriving at your server.
- A **writable** stream takes data: a file you write, the response you send back.
- A **transform** stream does both: data goes in, changed data comes out. Compression is a transform.

Streams are everywhere in Node.js. `process.stdout`, where `console.log` writes, is a writable stream. In [An HTTP server with no framework](https://zudojs.oyinlola.site/learn/node-http), every request is a readable stream and every response a writable one.

## Writing a big file, and backpressure

You need a big file to experiment with. This program writes 200,000 lines to `tasks.log` through a writable stream from `createWriteStream`:

generate.jsNode.js only

```ts
import { once } from "node:events";
import { createWriteStream } from "node:fs";

const out = createWriteStream("tasks.log");
let waits = 0;

for (let i = 1; i <= 200_000; i++) {
  const status = i % 3 === 0 ? "done" : "open";
  const line = `task ${i} ${status} buy milk and call ada\n`;
  if (!out.write(line)) {
    waits++;
    await once(out, "drain");
  }
}

out.end();
await once(out, "finish");
console.log(`wrote ${out.bytesWritten} bytes, paused ${waits} times`);
```

Output of `node generate.js`

```ts
wrote 7688895 bytes, paused 117 times
```

The loop makes lines much faster than the disk can save them. If it just kept calling `write`, the unsaved lines would pile up in memory. This is the problem streams call **backpressure**: the reader (here, the disk) pushing back on a writer that is too fast.

Think of filling a bucket from a tap while the bucket drains through a small hole. `out.write(line)` returns `false` when the stream's bucket is full. That means "stop for a moment". The stream emits `"drain"` when it has room again. `once(out, "drain")`, from `node:events`, turns that event into a promise you can `await`. The program paused 117 times, and memory never held much more than 64 KB (the size of the stream's bucket) of the 7.7 MB.

At the end, `out.end()` says "no more data", and the `"finish"` event says everything has been saved.

## Reading in chunks

A readable stream is an async iterable, so it works with `for await...of`, which you know from [Generators](https://zudojs.oyinlola.site/learn/js-generators#async): each round of the loop waits for the next chunk.

chunks.jsNode.js only

```ts
import { createReadStream } from "node:fs";

let chunks = 0;
let bytes = 0;
let biggest = 0;

for await (const chunk of createReadStream("tasks.log")) {
  chunks++;
  bytes += chunk.length;
  biggest = Math.max(biggest, chunk.length);
}

console.log({ chunks, bytes, biggest });
```

Output of `node chunks.js`

```json
{ chunks: 118, bytes: 7688895, biggest: 65536 }
```

The file arrived in 118 chunks of at most 65,536 bytes (64 KB). Each chunk is a `Buffer`. The program only ever held one chunk at a time, not 7.7 MB.

A chunk ends wherever 64 KB ends, which is usually in the middle of a line, and can be in the middle of a character, as you saw with `café`. So never split lines inside each chunk yourself. Use `readline`, below, which puts the pieces back together properly.

## Transforms and pipeline

Most of the time you connect streams: read from here, change it, write there. `pipeline` from `node:stream/promises` does exactly that, handles backpressure between every pair of streams for you, and returns a promise. This one compresses the log with gzip, a transform stream from `node:zlib`:

compress.jsNode.js only

```ts
import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

await pipeline(createReadStream("tasks.log"), createGzip(), createWriteStream("tasks.log.gz"));

const before = (await stat("tasks.log")).size;
const after = (await stat("tasks.log.gz")).size;
console.log(`${before} bytes became ${after} bytes`);
```

Output of `node compress.js`

```ts
7688895 bytes became 546399 bytes
```

Three streams, one line, and the 7.7 MB file never sat in memory. The lines repeat a lot, so gzip shrinks it to about 7% of its size.

### Your own transform

A `Transform` gets each chunk in its `transform` function and passes the changed chunk on by calling `callback(null, newChunk)`. The first argument is for an error. `Readable.from` makes a readable stream from an array, which is handy for trying things out:

upper.jsNode.js only

```ts
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const upperCase = new Transform({
  transform(chunk, encoding, callback) {
    callback(null, chunk.toString().toUpperCase());
  },
});

const source = Readable.from(["buy milk\n", "call ada\n"]);
await pipeline(source, upperCase, process.stdout);
```

Output of `node upper.js`

```ts
BUY MILK
CALL ADA
```

### When a stream fails

If any stream in a pipeline fails, `pipeline` closes all of them and rejects its promise, so one `try`/`catch` covers the whole chain:

broken.jsNode.js only

```ts
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

try {
  await pipeline(createReadStream("no-such.log"), createGzip(), createWriteStream("out.gz"));
} catch (error) {
  console.log("pipeline failed:", error.code);
}
```

Output of `node broken.js`

```ts
pipeline failed: ENOENT
```

> PREFER PIPELINE OVER .pipe()
>
> Older code connects streams with `a.pipe(b)`. It handles backpressure, but when a stream fails it does not close the others or report the error in one place. That leaves files open and errors unnoticed. Use `pipeline`.

## Build: count lines and words

REASON IT OUT

### Before you build: counting lines in a file bigger than memory

You want to count the lines, words and `done` tasks in a log file that may be 8 GB. Think it through first:

- Could you `readFile` it and call `split("\n")`?
- If you read chunks and split each chunk on `"\n"`, what happens to a line that crosses from one chunk into the next?
- The file was written on Windows, with `\r\n` line endings. What does a split on `"\n"` leave at the end of each line?
- The last line has no line break after it. Is it still counted?

**Show the reasoning**

Reading it whole fails: `readFile` refuses files over 2 GB, and a JavaScript string cannot hold more than about 512 million characters. Even a file that fits would hold all of its memory at once.

Splitting each chunk yourself counts one line twice (half at the end of one chunk, half at the start of the next), and can cut a multi-byte character in half, as `café` showed. A `\r` would stay at the end of every line and break comparisons such as `line.endsWith("done")`.

The fix is a tool that keeps the unfinished end of each chunk and joins it to the next one: `readline`. With `crlfDelay: Infinity` it treats `\r\n` as one line break, and it returns the last line even without a final line break.

`createInterface` from `node:readline` takes a readable stream and gives you whole lines, one at a time, however the chunks were cut. With `for await`, reading a huge file line by line takes a few lines of code:

count.jsNode.js only

```ts
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const lines = createInterface({ input: createReadStream("tasks.log"), crlfDelay: Infinity });

let lineCount = 0;
let wordCount = 0;
let doneCount = 0;

for await (const line of lines) {
  lineCount++;
  wordCount += line.split(" ").filter((word) => word !== "").length;
  if (line.includes(" done ")) doneCount++;
}

const heapMb = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0);
console.log({ lineCount, wordCount, doneCount });
console.log(`JavaScript memory in use: about ${heapMb} MB`);
```

Output of `node count.js`

```json
{ lineCount: 200000, wordCount: 1600000, doneCount: 66666 }
JavaScript memory in use: about 7 MB
```

`crlfDelay: Infinity` makes Windows line endings (`\r\n`) count as one line break. The program counted 200,000 lines and 1,600,000 words in a 7.7 MB file while using only a few megabytes of memory. It would use the same few megabytes for an 8 GB file.

Run both programs on your computer. On macOS and Linux, the built-in `wc` ("word count") tool agrees:

Terminal on your computer

```bash
$ node generate.js
wrote 7688895 bytes, paused 117 times
$ node count.js
{ lineCount: 200000, wordCount: 1600000, doneCount: 66666 }
JavaScript memory in use: about 5 MB
$ wc -l -w tasks.log
 200000 1600000 tasks.log
```

Your memory figure may differ a little. The counts will not.

## Practice

TRY IT YOURSELF

### Bytes of an emoji

Print how many characters and how many UTF-8 bytes `"done ✅"` has, and its base64 form. Then decode the base64 back.

**Show a solution**

emoji.jsNode.js only

```ts
const text = "done ✅";
const bytes = Buffer.from(text);

console.log("characters:", text.length, "bytes:", bytes.length);
const encoded = bytes.toString("base64");
console.log(encoded);
console.log(Buffer.from(encoded, "base64").toString());
```

Output of `node emoji.js`

```ts
characters: 6 bytes: 8
ZG9uZSDinIU=
done ✅
```

`✅` is one character in JavaScript, but three bytes in UTF-8.

TRY IT YOURSELF

### Unzip and compare

Write a pipeline that decompresses `tasks.log.gz` (use `createGunzip`) into `copy.log`. Then prove the copy is identical to `tasks.log` by comparing SHA-256 hashes, reading both files as streams.

**Show a solution**

unzip.jsNode.js only

```ts
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

await pipeline(createReadStream("tasks.log.gz"), createGunzip(), createWriteStream("copy.log"));

async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

console.log("identical:", (await sha256("tasks.log")) === (await sha256("copy.log")));
```

Output of `node unzip.js`

```ts
identical: true
```

A hash object can take its data in pieces with `update`, so hashing a file works with a stream too.

TRY IT YOURSELF

### The longest line

Use `readline` to find the longest line in `tasks.log` and its line number.

**Show a solution**

longest.jsNode.js only

```ts
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const lines = createInterface({ input: createReadStream("tasks.log"), crlfDelay: Infinity });

let number = 0;
let longest = { number: 0, text: "" };

for await (const line of lines) {
  number++;
  if (line.length > longest.text.length) longest = { number, text: line };
}

console.log(longest);
```

Output of `node longest.js`

```json
{ number: 100000, text: 'task 100000 open buy milk and call ada' }
```

## Recap

- A `Buffer` is a row of bytes. Text becomes bytes through an encoding, usually UTF-8, where one character can take several bytes. hex and base64 write bytes as printable text.
- Streams move data in chunks, so memory stays small whatever the size. Readable streams give data, writable streams take it, transforms change it.
- Backpressure: when `write` returns `false`, wait for `"drain"`. `pipeline` from `node:stream/promises` does that for you and reports any failure in one place.
- To read a file line by line, use `readline`'s `createInterface` with `for await`, never your own splitting of chunks.

Next: [Events, processes and workers](https://zudojs.oyinlola.site/learn/node-events-processes), where one program coordinates its parts with events, runs other programs, moves heavy work to other threads and shuts down cleanly.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
