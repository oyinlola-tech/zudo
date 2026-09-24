---
title: "How the web works"
description: "Follow a request from your browser to a server and back, and learn what clients, servers, IP addresses, DNS, ports, HTTP, HTTPS, APIs and databases are."
source: https://zudojs.oyinlola.site/learn/how-the-web-works
---

LESSON 4 OF 84

Start here Foundation

# How the web works

Follow a request from your browser to a server and back, and learn what clients, servers, IP addresses, DNS, ports, HTTP, HTTPS, APIs and databases are.

- **30 min** to read and try
- **You need:** Lessons 1 to 3
- **You build:** A tiny task API that runs on your computer and answers its own requests

  [Test yourself](#test)

## Clients and servers

Every conversation on the web has two sides:

- The **client** asks. Your browser is a client. So is a phone app, the `curl` command, and any program that sends a question to another computer.
- The **server** answers. It is a program that waits for questions, usually on a computer in a data centre. The backend you will build is a server.

The question is a **request** and the answer is a **response**. One request always gets one response. A web page with ten images makes at least eleven requests: one for the page, then one per image.

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
- The **port** picks the program. When a URL has no port, the protocol's default is used: 443 for `https`, 80 for `http`. That is why the port of `https://example.com/` is empty (`""`).
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

Run it on your computer. It needs the internet:

Terminal on your computer

```bash
$ node fetch-todo.js
Status: 200
Type: application/json; charset=utf-8
{ userId: 1, id: 1, title: 'delectus aut autem', completed: false }
```

The status is `200` and the content type is `application/json`: data, not a page. `response.json()` turns the JSON text into a JavaScript object. The title is placeholder text, like "lorem ipsum". The `await` keyword makes the program wait for the answer; the lesson [Asynchronous JavaScript](https://zudojs.oyinlola.site/learn/js-async) explains it.

### Your own API, on your computer

Now play both sides. This script starts a tiny task API with Node.js's built-in `node:http` module, sends two requests to itself with `fetch`, prints the answers, and shuts down:

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

That is a whole backend in miniature: receive a request, decide what it means, answer with a status code and data. You will build it properly, step by step, in the [Node.js HTTP lesson](https://zudojs.oyinlola.site/learn/node-http).

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

## Practice

TRY IT YOURSELF

### Take a URL apart

Use `new URL(...)` to print the hostname, the port, the path and the value of `q` in `http://localhost:3000/search?q=milk`.

**Show a solution**

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

**Show a solution**

443, 80 and 8080. The first two name no port, so the protocol's default is used: 443 for HTTPS, 80 for HTTP. The third names its port.

TRY IT YOURSELF

### Add a health check

Many APIs have a `/health` path that monitoring tools call to see if the server is alive. Add one to the tiny API: `GET /health` answers `200` with `{ "status": "ok" }`. Request it with `fetch`.

**Show a solution**

health.jsNode.js only

```ts
import { createServer } from "node:http";

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "Not found" }));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
console.log(response.status, await response.json());
server.close();
```

Output of `node health.js`

```ts
200 { status: 'ok' }
```

## Recap

- A client sends a request; a server sends back one response. Your backend is a server.
- DNS turns a domain name into an IP address. A port picks the program on that computer. A URL holds the protocol, host, port, path and query.
- HTTP requests have a method, a path and headers; responses have a status code, headers and a body. HTTPS encrypts all of it: use it for everything real.
- An API is a set of URLs for programs, usually answering in JSON. The backend sits between the client and the database.

Next: install Node.js on your computer and write your first program.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
