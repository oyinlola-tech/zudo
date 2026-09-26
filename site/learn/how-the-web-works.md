---
title: "How the web works — ZudoJS Academy"
description: "Follow a request from your browser to a server and back, and learn what clients, servers, IP addresses, DNS, ports, HTTP, HTTPS, APIs and databases are."
source: https://zudojs.oyinlola.site/learn/how-the-web-works
---

LEVEL 1 · LESSON 4 OF 18

Start here Foundation

# How the web works

Follow a request from your browser to a server and back, and learn what clients, servers, IP addresses, DNS, ports, HTTP, HTTPS, APIs and databases are.

- **30 min** to read and try
- **You need:** How programs run and Your developer environment
- **You build:** A URL taken apart in code, and a request followed from DNS to the database and back, with the status code each step gives

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain what a client and a server are, and follow one request and its response
- Explain what IP addresses, DNS and ports do, and pick the port a URL connects to
- Take a URL apart into protocol, hostname, port, path and query, by hand and with new URL
- Read an HTTP response's status code and headers, and explain what HTTPS adds
- Explain what a web API is and why the backend, not the browser, talks to the database

## Clients and servers

Every conversation on the web has two sides:

- The **client** asks. Your browser is a client. So is a phone app, the `curl` command, and any program that sends a question to another computer.
- The **server** answers. It is a program that waits for questions, usually on a computer in a data centre. The backend you will build is a server.

The question is a **request** and the answer is a **response**. One request always gets one response. A web page with ten images makes eleven requests the first time you open it: one for the page, then one per image. (On a later visit the browser may reuse images it saved, and send fewer.)

Clients and servers find each other over the **internet**: millions of networks joined together, passing small pieces of data from computer to computer until they reach the right one.

## IP addresses and domain names

Every computer on the internet has an **IP address**, a number that says where it is, like a postal address. There are two kinds:

- **IPv4**: four numbers from 0 to 255, like `104.20.23.154`.
- **IPv6**: a newer, longer form, like `2606:4700:10::6814:179a`. The world ran out of IPv4 addresses, so IPv6 has many more.

People do not remember numbers, so we use **domain names** like `example.com`. **DNS** (the Domain Name System) is the internet's phone book: it turns a name into an IP address. You can ask it yourself. `nslookup` works on Windows, macOS and Linux:

Terminal on your computer

```bash
$ nslookup example.com
Server:		172.20.10.1
Address:	172.20.10.1#53

Non-authoritative answer:
Name:	example.com
Address: 104.20.23.154
Name:	example.com
Address: 172.66.147.243
Name:	example.com
Address: 2606:4700:10::6814:179a
Name:	example.com
Address: 2606:4700:10::ac42:93f3
```

The first two lines are the DNS server your computer asked, usually your router or your internet provider. Then come the answers: `example.com` has two IPv4 and two IPv6 addresses. Big sites have several, so that one broken machine does not take the site down. Your answers can be different: the numbers change over time and between countries.

On Linux and macOS, `dig` gives a shorter answer:

Terminal on your computer

```bash
$ dig +short example.com
104.20.23.154
172.66.147.243
```

One name is special: `localhost` always means "this computer". Its IPv4 address is `127.0.0.1`. When you run a server on your own computer during development, you reach it at `localhost`.

## Ports and URLs

One computer runs many programs that talk to the network: a web server, a database, maybe a mail server. The IP address finds the computer. A **port**, a number from 1 to 65535, finds the program on it. Some ports are standard:

| Port | Used by |
| --- | --- |
| 80 | HTTP (web, not encrypted) |
| 443 | HTTPS (web, encrypted) |
| 5432 | PostgreSQL, the database you use later in this course |
| 3000, 8080 | Common choices for your own server while you develop |

A **URL** (the web address you type) packs all of this into one line. JavaScript can take one apart with `new URL(...)`:

url.js

```ts
const url = new URL("https://api.example.com:8443/tasks?done=false&limit=10");

console.log("protocol:", url.protocol);
console.log("hostname:", url.hostname);
console.log("port:", url.port);
console.log("path:", url.pathname);
console.log("query:", url.search);
console.log("done:", url.searchParams.get("done"));

const plain = new URL("https://example.com/");
console.log("default port:", JSON.stringify(plain.port));
```

Output of `node url.js` and of the browser terminal

```ts
protocol: https:
hostname: api.example.com
port: 8443
path: /tasks
query: ?done=false&limit=10
done: false
default port: ""
```

- The **protocol** says which language the client and server speak: `https`.
- The **hostname** is the name DNS turns into an IP address.
- The **port** picks the program. When a URL has no port, the protocol's default is used: 443 for `https`, 80 for `http`. That is why the port of `https://example.com/` is empty. `JSON.stringify(…)` prints it with its quotes, `""`, so you can see the empty text instead of a blank.
- The **path** says what you want from the server, like `/tasks`.
- The **query**, after `?`, adds options as `name=value` pairs joined by `&`.

## HTTP and HTTPS

**HTTP** is the language of the web: the rules for how a request and a response are written. A request says what the client wants, with a **method** such as `GET` ("give me") or `POST` ("here is something new"), a path, and **headers**, extra lines of information. The response starts with a **status code** that says how it went, then its own headers, then the **body**: the page, the image or the data.

`curl` is a client in your terminal. With `-I` it asks only for the status and the headers:

Terminal on your computer

```bash
$ curl -I https://example.com
HTTP/2 200
date: Wed, 23 Sep 2026 13:23:24 GMT
content-type: text/html
server: cloudflare
last-modified: Tue, 22 Sep 2026 20:16:57 GMT
allow: GET, HEAD
accept-ranges: bytes
age: 11268
cf-cache-status: HIT
cf-ray: a3f9dd1cda3815a5-LHR
```

- `HTTP/2` is the version of HTTP, and `200` is the status code: "OK, here it is". You have surely met `404`, "not found".
- `content-type: text/html` says the body is a web page.
- The other headers are extra details, like when the page last changed.

Without `-I`, curl prints the body: the HTML of the page. Here are its first 120 characters:

Terminal on your computer

```bash
$ curl -s https://example.com | head -c 120
<!doctype html><html lang="en"><head><title>Example Domain</title><link rel="icon" href="data:,"><meta name="viewport" c
```

That text is all a web page is. The browser reads it and draws it. Your dates and some header values will differ.

> NOTE
>
> On Windows, type `curl.exe` instead of `curl`. In Windows PowerShell, plain `curl` is a different command with different options. `curl.exe` is the real curl, which comes with Windows 10 and 11.

### What the S in HTTPS adds

**HTTPS** is HTTP sent through an encrypted connection (called TLS). Plain HTTP travels as readable text, so anyone on the same Wi-Fi, or any computer on the way, can read it and even change it. HTTPS prevents that, and it also proves that the server really is `example.com`, using a **certificate**. That is the padlock in your browser's address bar.

> Always HTTPS for real users
>
> Never send a password, a login token or personal data over plain `http://`. Every public site and API you build must use HTTPS. Plain HTTP is only acceptable on `localhost`, where the data never leaves your computer.

You can watch all of this in your browser. Open the devtools (F12), choose the **Network** tab, and reload this page. Every row is one request. Click one to see its method, status code and headers.

## What an API is

A web page is made for people. An **API** (Application Programming Interface) is made for programs. A web API is a set of URLs that a program can call to read or change data. It usually answers in **JSON**, a text format for data that looks like JavaScript objects.

JavaScript's `fetch` sends a request from code. This script asks a free practice API for one to-do item. Save it as `fetch-todo.js`:

fetch-todo.jsNode.js only

```ts
const response = await fetch("https://jsonplaceholder.typicode.com/todos/1");
console.log("Status:", response.status);
console.log("Type:", response.headers.get("content-type"));

const todo = await response.json();
console.log(todo);
```

Once Node.js is installed (in [Set up your computer](https://zudojs.oyinlola.site/learn/setup)), you can run it on your computer. It needs the internet:

Terminal on your computer

```bash
$ node fetch-todo.js
Status: 200
Type: application/json; charset=utf-8
{ userId: 1, id: 1, title: 'delectus aut autem', completed: false }
```

The status is `200` and the content type is `application/json`: data, not a page. `response.json()` turns the JSON text into a JavaScript object. The title is placeholder text, like "lorem ipsum". The `await` keyword makes the program wait for the answer; the lesson [Asynchronous JavaScript](https://zudojs.oyinlola.site/learn/js-async) explains it.

### Your own API, on your computer

Now play both sides. This script starts a tiny task API with Node.js's built-in `node:http` module, sends two requests to itself with `fetch`, prints the answers, and shuts down. You do not need to understand every line yet, and you cannot run it until you install Node.js in [Set up your computer](https://zudojs.oyinlola.site/learn/setup), at the start of the next course. For now, the output is shown under it.

tiny-api.jsNode.js only

```ts
import { createServer } from "node:http";

const tasks = [
  { id: 1, title: "Buy milk", done: false },
  { id: 2, title: "Write report", done: true },
];

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/tasks") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(tasks));
    return;
  }
  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "Not found" }));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
console.log("Listening on", base);

for (const path of ["/tasks", "/nothing-here"]) {
  const response = await fetch(base + path);
  console.log("GET", path, "->", response.status);
  console.log(await response.json());
}

server.close();
```

Output of `node tiny-api.js`

```ts
Listening on http://127.0.0.1:37601
GET /tasks -> 200
[
  { id: 1, title: 'Buy milk', done: false },
  { id: 2, title: 'Write report', done: true }
]
GET /nothing-here -> 404
{ error: 'Not found' }
```

Read it as a conversation:

- `listen(0, "127.0.0.1")` asks for port `0`, which means "any free port". The operating system picked one. Your number will be different. `127.0.0.1` is `localhost`, so only your own computer can reach this server.
- The client asked for `/tasks`. The server's function checked the method and the path, and answered `200` with the list as JSON.
- The client asked for a path the server does not know. It answered `404` with an error message, also as JSON.

That is a whole backend in miniature: receive a request, decide what it means, answer with a status code and data. You will build it properly, step by step, in [An HTTP server with no framework](https://zudojs.oyinlola.site/learn/node-http).

## Where databases fit

The tiny API keeps its tasks in a list inside the program. Stop the program and they are gone. Real data must survive restarts and be shared by many copies of the server. It lives in a **database**: a separate program, often on a separate computer, built to store data safely and find it fast.

Here is the whole journey when someone opens a task app, from start to end:

1. The browser asks DNS for the IP address of the app's domain.
2. It connects to that address on port 443 and sets up the encrypted HTTPS connection.
3. It sends an HTTP request: `GET /tasks`, with headers.
4. The server, your backend, checks the request: is it valid, and who is asking?
5. The backend asks the database for the tasks, and the database answers.
6. The backend sends an HTTP response: `200`, and the tasks as JSON.
7. The browser shows them on the page.

Notice who talks to whom. The browser only talks to your backend. It never talks to the database directly: the backend stands between them and decides what each person may read or change. That is the job this course teaches you to do well.

REASON IT OUT

### What does the user see when a step fails?

Take the seven steps of the journey above. Before reading on, pick three of them and ask, for each: what could go wrong at this step, and what would the person using the app see?

- What if DNS has no address for the name, for example because of a typing mistake in the domain?
- What if the server is switched off, so nothing listens on port 443?
- What if the request arrives, but the backend decides the person is not allowed to see these tasks?
- What if the backend is fine but the database does not answer?

**Show the reasoning**

**No DNS answer:** the browser never finds an address, so no request is sent at all. The browser shows its own error page ("this site can't be reached"); your backend never hears about it.

**Nothing on the port:** the address is found, but the connection is refused or times out. Again there is no HTTP response, because there was no program to answer, and the browser shows its own error.

**Not allowed:** this time the backend *did* receive the request, so it answers properly, with a status code that says so (such as `403`, "forbidden") instead of `200`. Deciding that answer is your job as a backend developer.

**Database silent:** the backend is running but cannot do its work. It should still answer, with a status code that says the problem is on the server's side (`500` or `503`), rather than leaving the browser waiting forever.

The pattern: before the request reaches your server, failures are the browser's to report; once it reaches your server, every failure must become a clear response. Later courses teach you to choose those status codes and messages.

## Practice

TRY IT YOURSELF

### Take a URL apart

Use `new URL(...)` to print the hostname, the port, the path and the value of `q` in `http://localhost:3000/search?q=milk`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`new URL(text)` gives you an object with `.hostname`, `.port` and `.pathname` already split apart.

HINT 2

The query string is read with `url.searchParams.get("q")`, not by reading the text after the `?` yourself.

SOLUTION

parts.js

```ts
const url = new URL("http://localhost:3000/search?q=milk");

console.log(url.hostname);
console.log(url.port);
console.log(url.pathname);
console.log(url.searchParams.get("q"));
```

Output of `node parts.js` and of the browser terminal

```ts
localhost
3000
/search
milk
```

This URL does name a port, `3000`, so `port` is not empty. It is a typical address for a server you run while developing.

TRY IT YOURSELF

### Which port?

Which port does the client connect to for each URL? `https://shop.example.com/cart`, `http://example.com/`, and `http://localhost:8080/tasks`.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Does the URL name a port after the host, with a `:`? If not, the protocol has a default.

HINT 2

HTTPS defaults to port 443 and HTTP to port 80, when the URL does not say otherwise.

SOLUTION

443, 80 and 8080. The first two name no port, so the protocol's default is used: 443 for HTTPS, 80 for HTTP. The third names its port.

TRY IT YOURSELF

### Predict the tiny API's answers

The tiny API answers `200` only when the method is exactly `GET` and the path is exactly `/tasks`. Everything else gets `404`. Without running anything, predict the status code for each request: `GET /tasks`, `POST /tasks`, `GET /Tasks`, `GET /tasks?done=false` and `GET /tasks/`. Then write `predict.js` below, run it on your computer once Node.js is installed, and check your predictions.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Each pair is an array of two strings, `[method, path]`, exactly as in the example: `["GET", "/tasks"]`.

HINT 2

List all five as `[["GET", "/tasks"], ["POST", "/tasks"], ["GET", "/Tasks"], ["GET", "/tasks?done=false"], ["GET", "/tasks/"]]`.

SOLUTION

Only the first gets `200`. `POST` is a different method. `/Tasks` has a capital T, and the check compares the text exactly, so it is a different path. The last two surprise most people: the server compares `request.url`, which is the path *and* the query, so `/tasks?done=false` is not the text `/tasks`, and neither is `/tasks/` with its extra slash. All four answer `404`.

After [Set up your computer](https://zudojs.oyinlola.site/learn/setup), you can check the prediction on your computer. The only change from the tiny API is the list of requests, now pairs of a method and a path:

predict.jsNode.js only

```ts
import { createServer } from "node:http";

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/tasks") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify([{ id: 1, title: "Buy milk", done: false }]));
    return;
  }
  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "Not found" }));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

for (const [method, path] of [["GET", "/tasks"], ["POST", "/tasks"], ["GET", "/Tasks"], ["GET", "/tasks?done=false"], ["GET", "/tasks/"]]) {
  const response = await fetch(base + path, { method });
  console.log(method, path, "->", response.status);
}

server.close();
```

Output of `node predict.js`

```ts
GET /tasks -> 200
POST /tasks -> 404
GET /Tasks -> 404
GET /tasks?done=false -> 404
GET /tasks/ -> 404
```

A real API would want `GET /tasks?done=false` to work, so it would look at the path and the query separately, exactly as `new URL` does. Predicting before running is what found that gap.

## Recap

- A client sends a request; a server sends back one response. Your backend is a server.
- DNS turns a domain name into an IP address. A port picks the program on that computer. A URL holds the protocol, host, port, path and query.
- HTTP requests have a method, a path and headers; responses have a status code, headers and a body. HTTPS encrypts all of it: use it for everything real.
- An API is a set of URLs for programs, usually answering in JSON. The backend sits between the client and the database.

Next: [What programming is](https://zudojs.oyinlola.site/learn/think-programming), where you start thinking like a programmer: every program as input, processing and output, and a method for solving problems before you write the code.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
