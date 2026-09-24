---
title: "Deploying a ZudoJS app"
description: "Take the Task API from your computer to a server. Build it for production, run it under systemd or in Docker, add PostgreSQL and Redis with Docker Compose, put Caddy in front for HTTPS, run migrations during a deployment, read the logs and back up the database."
source: https://zudojs.oyinlola.site/learn/deployment
---

LESSON 82 OF 84

Production Production

# Deploying a ZudoJS app

Take the Task API from your computer to a server. Build it for production, run it under systemd or in Docker, add PostgreSQL and Redis with Docker Compose, put Caddy in front for HTTPS, run migrations during a deployment, read the logs and back up the database.

- **60 min** to read and try
- **You need:** The Task API project, Production engineering, and Docker installed (docker.com/get-started)
- **You build:** The Task API running in Docker Compose with PostgreSQL, Redis and a Caddy reverse proxy, with migrations, readiness checks and a tested backup

  [Test yourself](#test)

## From your computer to a server

**Deploying** means putting your app on a computer that is always on and reachable from the internet, a **server**, and keeping it running there. The path in this lesson:

1. Build the app for production and run it without any development tools.
2. Run it on a Linux server as a service that restarts when it crashes.
3. Package it as a Docker image, so it runs the same everywhere.
4. Start it together with PostgreSQL, Redis and a reverse proxy using Docker Compose.
5. Serve it over HTTPS on your own domain.
6. Deploy new versions safely: migrations, logs, backups.

Every command below was run for real on the Task API from [Create the Task API project](https://zudojs.oyinlola.site/learn/zudo-create-project). Your ids, times and sizes will differ.

## Prepare the app

In production the app needs a database. Add the PostgreSQL driver, `pg`:

Terminal on your computer

```bash
$ npm install pg
…
$ npm install -D @types/pg
…
```

Then add a few small files and changes. First, a function that creates a connection pool with the limits you chose in [Production engineering](https://zudojs.oyinlola.site/learn/production-engineering). It refuses to start without a database address:

src/databases/pool.tsNode.js only

```ts
import pg from "pg";

/** A connection pool with production limits. Refuses to start without a URL. */
export function createPool(connectionString: string | undefined): pg.Pool {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 2_000,
    statement_timeout: 5_000,
  });
}
```

Second, make the database an **integration**. You saw the empty `src/integrations/` folder in [the tour of the project](https://zudojs.oyinlola.site/learn/zudo-create-project#tour): an integration starts with the app, stops after everything else, and reports its health to `/health`. The generated `src/configs/index.ts` already reads `DATABASE_URL` into `config.database.url`:

src/integrations/postgres.tsNode.js only

```ts
import type pg from "pg";

import { createPool } from "../databases/pool.js";
import type { Integration } from "./integration.js";

let pool: pg.Pool | undefined;

/** The shared pool, for repositories. Only valid while the app runs. */
export function db(): pg.Pool {
  if (pool === undefined) throw new Error("The postgres integration has not started");
  return pool;
}

export const postgres: Integration = {
  name: "postgres",
  async start({ config, logger }) {
    pool = createPool(config.database.url);
    pool.on("error", (error) => logger.warn("idle database connection lost", { error: error.message }));
    await pool.query("SELECT 1");
  },
  async health() {
    await db().query("SELECT 1");
    return true;
  },
  async stop() {
    await pool?.end();
    pool = undefined;
  },
};
```

- `start` creates the pool and runs `SELECT 1`, so the app refuses to start when the database is unreachable, instead of failing on the first customer's request.
- `pool.on("error", …)` matters more than it looks. When the database restarts, `pg` reports the broken idle connections as an `error` event. Without a listener, Node.js treats that as an uncaught error and the whole app stops. With it, the app logs a warning and opens new connections when the database is back.
- `health` is what `/health` reports as `"postgres": "up"` or `"down"`.

Register it in `src/integrations/index.ts`, between the markers the CLI left there:

src/integrations/index.ts (part)Node.js only

```ts
// zudojs:integration-imports:start
import { postgres } from "./postgres.js";
// zudojs:integration-imports:end

export const integrations: readonly Integration[] = [
  // zudojs:integrations:start
  postgres,
  // zudojs:integrations:end
];
```

Third, trust forwarded headers only from the proxy you will add later. Add a `trustProxy` setting to `src/configs/index.ts`, and pass it to the adapter in `src/server.ts`. An empty value means "trust no proxy":

src/configs/index.ts (part)Node.js only

```ts
// zudojs:config:start
database: Object.freeze({ url: text(config, "database_url", "") }),
trustProxy: text(config, "trust_proxy", ""),
// zudojs:config:end
```

src/server.ts (part)Node.js only

```ts
adapter: createNodeHttpAdapter({
  server: httpServer,
  host: config.host,
  port: config.port,
  trustProxy: config.trustProxy || false,
}),
```

You do not need to touch the shutdown code: on `SIGTERM` the generated `src/server.ts` stops the HTTP server, then the runtime, which stops the integrations last and so closes the pool.

Last, a migration script. A **migration** is a numbered change to the database structure. The script applies the ones that have not run yet and records them in a `schema_migrations` table. The advisory lock makes two copies of the script, started at the same moment by two servers, wait for each other instead of both creating the table:

src/migrate.tsNode.js only

```ts
import { createPool } from "./databases/pool.js";

const migrations = [
  { id: 1, sql: "CREATE TABLE tasks (id SERIAL PRIMARY KEY, title TEXT NOT NULL, done BOOLEAN NOT NULL DEFAULT false)" },
];

const pool = createPool(process.env["DATABASE_URL"]);
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(4242)");
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (id INT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  for (const migration of migrations) {
    const done = await client.query("SELECT 1 FROM schema_migrations WHERE id = $1", [migration.id]);
    if (done.rowCount) continue;
    await client.query(migration.sql);
    await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [migration.id]);
    console.log(`applied migration ${migration.id}`);
  }
  await client.query("COMMIT");
  console.log("database is up to date");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
```

> NOTE
>
> If you use Prisma through `@zudojs/database`, its `createMigrationRunner` does the same job, with the same kind of lock. The idea is identical: migrations are code, versioned in Git, applied by a command, never by hand.

### The production build

In production you run compiled JavaScript with plain `node`, not `tsx`. `npm run build` runs `tsc`, which writes JavaScript into `dist/`:

Terminal on your computer

```bash
$ npm run build

> task-api@0.1.0 build
> tsc

$ ls dist/*.js dist/databases dist/integrations
dist/app.js
dist/container.js
dist/index.js
dist/migrate.js
dist/server.js

dist/databases:
index.js
pool.js

dist/integrations:
index.js
integration.js
postgres.js
```

On the server you install only the packages the app needs to run. `npm ci` installs exactly the versions in `package-lock.json`, and `--omit=dev` leaves out TypeScript, tsx and Vitest. Then you start the compiled server with the production settings:

```ts
npm ci --omit=dev
NODE_ENV=production DATABASE_URL=postgres://… node dist/server.js
```

That is the whole app: a `dist/` folder, `node_modules`, and environment variables.

## On a Linux server

Most servers run Linux, rented from a provider as a **VPS** (virtual private server). The basic setup, once:

- Log in with an SSH key, not a password, and turn password logins off.
- Install security updates, and turn on automatic ones.
- Allow only ports 22 (SSH), 80 and 443 (web) in the firewall. PostgreSQL's 5432 is never open to the internet.
- Install Node.js 24 from the official NodeSource or distribution packages, and PostgreSQL.
- Create a user that runs only the app, with no login and no admin rights: `sudo useradd --system --home /srv/task-api taskapi`.

### Keep it running with systemd

If you start `node dist/server.js` in an SSH session, it stops when you log out, and nothing restarts it after a crash or a reboot. A **process manager** does that. On Linux, the built-in one is **systemd**. Describe the app in a **unit file**, `/etc/systemd/system/task-api.service`:

```ts
# /etc/systemd/system/task-api.service
[Unit]
Description=Task API (ZudoJS)
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=taskapi
WorkingDirectory=/srv/task-api
Environment=NODE_ENV=production
EnvironmentFile=/etc/task-api/env
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=40
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

- `User=taskapi`: the app never runs as root.
- `EnvironmentFile`: the secrets, `DATABASE_URL` and friends, one `NAME=value` per line. Make the file readable only by root and the app: `sudo chmod 640 /etc/task-api/env` and `sudo chown root:taskapi /etc/task-api/env`.
- `Restart=on-failure`: if the process crashes, systemd starts it again after 5 seconds.
- `KillSignal=SIGTERM` and `TimeoutStopSec=40`: on stop, the app gets `SIGTERM` and 40 seconds for its graceful shutdown, more than the runtime's own 30.
- The last four lines lock the process down: it cannot gain privileges, write to the system, or read home folders.

Check the file before you install it. No output means it is valid:

Terminal on your computer

```bash
$ systemd-analyze verify task-api.service
```

Then, on the server, load it, start it, and look at it:

```ts
sudo systemctl daemon-reload
sudo systemctl enable --now task-api
systemctl status task-api
journalctl -u task-api -f
```

`enable --now` starts the app and also starts it at every boot. `journalctl -u task-api -f` follows its logs, everything the app writes to standard output, live.

> TIP
>
> **pm2** is a popular process manager written in Node.js (`npm install -g pm2`, then `pm2 start dist/server.js --name task-api`). It works on any system and has a nice dashboard. On a Linux server systemd is already there and does the same job, so this course uses it.

## Docker

A server set up by hand is hard to reproduce: which Node.js version, which system packages, which settings? **Docker** packages your app together with everything it needs to run into an **image**. A running copy of an image is a **container**. The same image runs on your laptop, in CI and on the server.

The recipe for an image is a `Dockerfile`. This one uses a **multi-stage build**: the first stage has all the tools to compile TypeScript, and the second, final stage gets only the compiled JavaScript and the production packages. The image is smaller and contains no compiler or test tools an attacker could use.

```ts
# Dockerfile
# Stage 1: install every dependency and compile TypeScript
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: only what production needs
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/server.js"]
```

- `node:24-alpine` is the official Node.js 24 image on Alpine Linux, a very small Linux.
- The `package.json` files are copied before the source code. Docker caches each step, so when only your code changes, `npm ci` is not run again and the build takes seconds.
- `USER node`: the official image has a user without admin rights. Use it.
- `HEALTHCHECK` asks `/health` every 10 seconds, so `docker ps` shows whether the app is healthy.
- `CMD` uses the list form, so `node` itself receives `SIGTERM` and can shut down gracefully.

> TIP
>
> `zudojs add docker` writes a similar multi-stage `Dockerfile`, a `.dockerignore` and a `compose.yaml` for you. This lesson writes its own so you understand every line. Both copy `package-lock.json` and install with `npm ci`, so the image gets exactly the versions you tested. (The CLI's file falls back to `npm install` only while the project has no lock file yet.) The CLI's file installs once in the build stage, removes the development tools with `npm prune --omit=dev`, and copies the remaining `node_modules` into the final stage, instead of installing a second time.

A `.dockerignore` file keeps local files out of the image. Above all, `.env` with your secrets must never be copied in:

```ts
# .dockerignore
node_modules
dist
.env
.git
tests
```

Build the image and give it a name and a version, a **tag**:

Terminal on your computer

```bash
$ docker build -t task-api:1.0.0 .
#1 [internal] load build definition from Dockerfile
#1 transferring dockerfile: 623B 0.0s done
#1 DONE 0.1s
…
#9 [stage-1 4/5] RUN npm ci --omit=dev && npm cache clean --force
#9 48.08
#9 48.08 added 31 packages, and audited 32 packages in 46s
…
#9 48.09 found 0 vulnerabilities
…
#9 DONE 49.6s

#8 [build 4/7] RUN npm ci
#8 60.51
#8 60.51 added 81 packages, and audited 82 packages in 59s
…
#8 DONE 60.9s
…
#12 [build 7/7] RUN npm run build
#12 0.737
#12 0.737 > task-api@0.1.0 build
#12 0.737 > tsc
#12 0.737
#12 DONE 1.5s

#13 [stage-1 5/5] COPY --from=build /app/dist ./dist
#13 DONE 0.2s

#14 exporting to image
…
#14 naming to docker.io/library/task-api:1.0.0 0.0s done
#14 DONE 1.5s
$ docker images task-api
IMAGE            ID             DISK USAGE   CONTENT SIZE   EXTRA
task-api:1.0.0   59ebb5d3dd0c        184MB             0B
```

The production stage installed 31 packages, the build stage 81: the other 50 are development tools that never reach the final image. Now run it:

Terminal on your computer

```bash
$ docker run --rm task-api:1.0.0
2026-09-23T17:45:14.777Z [ERROR] [task-api] Module "integrations" failed during initialization. error={"name":"Error","message":"DATABASE_URL is not set",…}
2026-09-23T17:45:14.785Z [ERROR] [task-api] Runtime failed to start. errorMessage="Module \"integrations\" failed during initialization."
2026-09-23T17:45:14.786Z [INFO] [task-api] Rolling back module startup.
2026-09-23T17:45:14.787Z [INFO] [task-api] Module rollback complete. failedModules=[]
…
RuntimeInitializationError: Module "integrations" failed during initialization.
    at runStartup (file:///app/node_modules/@zudojs/runtime/dist/startup/startup.core.js:68:15) {
  cause: Error: DATABASE_URL is not set
      at createPool (file:///app/dist/databases/pool.js:5:15)
…
Node.js v24.21.0
```

That failure is your `createPool` check doing its job: the postgres integration could not start, so the runtime undid the start-up and the app stopped, with the reason in the `cause`. The container needs a database next to it, and that is what Docker Compose is for.

## Docker Compose: app, PostgreSQL, Redis and a proxy

**Docker Compose** starts several containers that belong together from one file, `compose.yaml`, and puts them on a private network where each one can reach the others by its service name. That is the DNS-based service discovery from [the microservices lesson](https://zudojs.oyinlola.site/learn/zudo-microservices): the app connects to `db:5432`.

```ts
# compose.yaml
services:
  app:
    build: .
    image: task-api:1.0.0
    environment:
      NODE_ENV: production
      PORT: "3000"
      DATABASE_URL: postgres://taskapi:${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}@db:5432/taskapi
      REDIS_URL: redis://redis:6379
      TRUST_PROXY: private
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:17
    environment:
      POSTGRES_USER: taskapi
      POSTGRES_DB: taskapi
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U taskapi -d taskapi"]
      interval: 5s
      timeout: 3s
      retries: 10
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
    restart: unless-stopped

  proxy:
    image: caddy:2-alpine
    ports:
      - "8080:80"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
    depends_on:
      - app
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:
```

- **Only the proxy has `ports`.** The app, the database and Redis are reachable only inside the Compose network, never from the internet.
- **Volumes** (`pgdata`, `redisdata`) keep the data when containers are replaced. Without them, every deployment would delete your database.
- `depends_on` with `service_healthy` starts the app only after PostgreSQL and Redis pass their health checks.
- `${POSTGRES_PASSWORD:?…}` takes the password from the environment or from a `.env` file next to `compose.yaml`, and stops with a message if it is missing. There is no default password.
- `REDIS_URL` is ready for a shared cache or rate-limit store, as recommended in the previous lesson. `TRUST_PROXY: private` tells the app to believe `X-Forwarded-For` only from addresses on private networks, which is where Caddy sits.

The proxy's configuration, `Caddyfile`, forwards every request to the app:

```ts
# Caddyfile
:80 {
	reverse_proxy app:3000
}
```

Try to start it without a password, then create one. `openssl rand -hex 24` prints 48 random characters, so nobody ever types or sees the password:

Terminal on your computer

```bash
$ docker compose up -d
error while interpolating services.app.environment.DATABASE_URL: required variable POSTGRES_PASSWORD is missing a value: set POSTGRES_PASSWORD in .env
error while interpolating services.db.environment.POSTGRES_PASSWORD: required variable POSTGRES_PASSWORD is missing a value: set POSTGRES_PASSWORD in .env
$ echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" > .env
$ chmod 600 .env
```

Now start the database and Redis first, run the migrations, then start everything:

Terminal on your computer

```bash
$ docker compose up -d db redis
…
 Container task-api-db-1 Started
 Container task-api-redis-1 Started
$ docker compose run --rm app node dist/migrate.js
 Container task-api-redis-1 Healthy
 Container task-api-db-1 Healthy
…
applied migration 1
database is up to date
$ docker compose up -d
…
 Container task-api-app-1 Started
 Container task-api-proxy-1 Starting
 Container task-api-proxy-1 Started
$ docker compose ps --format 'table {{.Name}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
NAME               IMAGE            STATUS                            PORTS
task-api-app-1     task-api:1.0.0   Up 8 seconds (health: starting)   3000/tcp
task-api-db-1      postgres:17      Up About a minute (healthy)       5432/tcp
task-api-proxy-1   caddy:2-alpine   Up 8 seconds                      443/tcp, 2019/tcp, 443/udp, 0.0.0.0:8080->80/tcp, [::]:8080->80/tcp
task-api-redis-1   redis:8-alpine   Up About a minute (healthy)       6379/tcp
$ curl -i http://localhost:8080/health
HTTP/1.1 200 OK
Content-Length: 81
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
Content-Type: application/json
…
Via: 1.1 Caddy
X-Content-Type-Options: nosniff
…

{"status":"ok","checks":{"postgres":"up"},"timestamp":"2026-09-23T17:47:11.474Z"}
$ docker compose exec redis redis-cli ping
PONG
```

The request went to Caddy on port 8080 (the `Via: 1.1 Caddy` header), which passed it to the app. The app asked the postgres integration, which answered `up`. The security headers from the app came through the proxy unchanged. Running the migrations a second time is safe: the script prints only `database is up to date`.

### See the readiness check work

Stop the database and ask again:

Terminal on your computer

```bash
$ docker compose stop db
 Container task-api-db-1 Stopping
 Container task-api-db-1 Stopped
$ curl -i http://localhost:8080/health
HTTP/1.1 503 Service Unavailable
…
{"status":"unavailable","checks":{"postgres":"down"},"timestamp":"2026-09-23T17:48:48.033Z"}
$ docker compose start db
 Container task-api-db-1 Starting
 Container task-api-db-1 Started
$ curl http://localhost:8080/health
{"status":"ok","checks":{"postgres":"up"},"timestamp":"2026-09-23T17:48:55.064Z"}
```

Exactly as planned in the previous lesson: the generated `/health` is a readiness check. Without its database the app answers 503 and says which part is down, but it keeps running, logs one warning (you will see it in [the logs](#logs) below), and recovers by itself when the database is back. Docker marks the container `unhealthy` after three failed checks but does not restart it; Kubernetes would stop sending it traffic.

> NOTE
>
> When this lesson's example was first run without the `pool.on("error", …)` line, stopping the database crashed the app: the proxy answered `502 Bad Gateway`, and `restart: unless-stopped` restarted the app over and over until the database was back. One missing listener turned a database restart into an outage.

## Reverse proxy, domain and HTTPS

A **reverse proxy** is a server that sits in front of your app and receives every request first. It handles **HTTPS** (the encryption of every request between the browser and your server), compresses responses, and can spread traffic over several copies of the app. Your Node.js process then only speaks plain HTTP on the private network.

### Point your domain at the server

At the company where you bought your domain, create a DNS **A record** (and an **AAAA** record for IPv6) for the name you want, for example `api.example.com`, pointing to your server's IP address. Changes can take a few minutes to an hour to reach everyone. Check with `dig +short api.example.com`: it should print your server's address.

### HTTPS with Caddy

For a real domain, replace `:80` in the `Caddyfile` with the name, and publish ports 80 and 443 instead of 8080:

```ts
# Caddyfile on the server
api.example.com {
	reverse_proxy app:3000
	encode zstd gzip
}
```

That is all. When Caddy starts, it gets a free TLS certificate from Let's Encrypt for `api.example.com`, renews it before it expires, redirects HTTP to HTTPS, and adds the `Strict-Transport-Security` header. It needs ports 80 and 443 open and the DNS record in place. Add a volume for `/data` in the `proxy` service so the certificates survive a restart.

### The same with nginx

nginx is the other common choice. It does not get certificates by itself; you use `certbot` for that. The part that forwards to the app looks like this:

```ts
# /etc/nginx/sites-available/task-api
server {
    listen 443 ssl;
    server_name api.example.com;
    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> TRUST ONLY YOUR OWN PROXY
>
> Behind a proxy, every request reaches the app from the proxy's address, and the real client address is in the `X-Forwarded-For` header. Anyone can send that header, so the app must believe it only when it comes from your proxy. That is what `trustProxy` on the adapter does: `"loopback"` when nginx runs on the same machine, `"private"` inside Docker. Never set it to `"all"` on an app that is also reachable directly, or an attacker can pick their own IP address and walk around your per-IP rate limit.

## Logs

The app writes its logs to standard output, and the platform keeps them. With Compose:

Terminal on your computer

```bash
$ docker compose logs app --tail 3
app-1  | 2026-09-23T22:32:42.557Z [INFO] [task-api] Runtime is ready. runtimeId=rt_c1ff94a784f244ab9258e8a05b4a775b environment=production
app-1  | Listening on http://0.0.0.0:3000
app-1  | 2026-09-23T22:32:48.018Z [WARN] [task-api] idle database connection lost error="terminating connection due to administrator command"
$ docker compose stop app
 Container task-api-app-1 Stopping
 Container task-api-app-1 Stopped
$ docker compose logs app | grep -i "shut"
app-1  | Received SIGTERM: shutting down.
app-1  | 2026-09-23T22:33:13.290Z [INFO] [task-api] Initiating graceful shutdown. timeoutMs=30000
app-1  | 2026-09-23T22:33:13.303Z [INFO] [task-api] Graceful shutdown complete.
```

`docker compose stop` sent `SIGTERM`. The first line comes from the signal handler in `src/server.ts`, and the next two show the graceful shutdown from the previous lesson taking 13 milliseconds. Add `-f` to follow logs live. Under systemd the same is `journalctl -u task-api`. Docker keeps logs in files that grow forever by default; limit them with the `logging` option (`max-size: "10m"`, `max-file: "3"`) or ship them to a log service, as the production lesson recommends.

## Deploying a new version

Every deployment follows the same steps, in this order:

1. **Back up** the database (next section).
2. **Build** the new image with a new tag, such as `task-api:1.1.0`. Keep the old image so you can go back.
3. **Migrate** the database with the new image, before the new app starts.
4. **Replace** the app container. The old one gets `SIGTERM` and finishes its requests.
5. **Check** `/health`, the logs and your dashboard for a few minutes.

Terminal on your computer

```bash
$ docker compose build app
…
 Image task-api:1.0.0 Built
$ docker compose run --rm app node dist/migrate.js
database is up to date
$ docker compose up -d app
…
 Container task-api-app-1 Started
$ curl http://localhost:8080/health
{"status":"ok","checks":{"postgres":"up"},"timestamp":"2026-09-23T17:49:26.911Z"}
```

### Migrations that do not break the running app

Between step 3 and step 4, the *old* app runs against the *new* database. So every migration must work with both versions. Split breaking changes into two deployments, called **expand and contract**:

- **Renaming a column `title` to `name`:** deployment 1 adds `name`, copies the data, and the new code writes both columns. Deployment 2, once no old code is left, removes `title`.
- **Adding a `NOT NULL` column:** add it with a default, or as nullable first and fill it, then add the constraint later.
- **Never** edit a migration that already ran in production. Add a new one.

To **roll back** a bad release, start the previous image tag again. That only works if the database still suits it, which is one more reason for expand and contract.

## Backups

A backup you have never restored is only a hope. Make one with `pg_dump` in PostgreSQL's compact `custom` format, then prove it works by restoring it into a scratch database:

Terminal on your computer

```bash
$ docker compose exec db psql -U taskapi -d taskapi -c "INSERT INTO tasks (title) VALUES ('Write the deploy guide'), ('Test the backup')"
INSERT 0 2
$ mkdir -p backups
$ docker compose exec -T db pg_dump -U taskapi -d taskapi --format=custom > backups/taskapi-2026-09-23.dump
$ ls -lh backups
-rw-rw-r-- 1 you you 3.7K Sep 23 18:49 taskapi-2026-09-23.dump
$ docker compose exec -T db createdb -U taskapi restore_check
$ docker compose exec -T db pg_restore -U taskapi -d restore_check < backups/taskapi-2026-09-23.dump
$ docker compose exec db psql -U taskapi -d restore_check -c "SELECT id, title, done FROM tasks"
 id |         title          | done
----+------------------------+------
  1 | Write the deploy guide | f
  2 | Test the backup        | f
(2 rows)
$ docker compose exec -T db dropdb -U taskapi restore_check
```

Both rows came back from the file. The rules for real backups:

- **Automate them:** a nightly `cron` job or systemd timer that runs the `pg_dump` line with the date in the file name.
- **Store them somewhere else:** a backup on the same server dies with the server. Copy it to object storage in another region, encrypted.
- **Keep several:** for example 7 daily, 4 weekly and 12 monthly copies.
- **Test a restore** regularly, exactly as above.

Managed databases from cloud providers do nightly backups and point-in-time recovery for you, which is a good reason to use one once real money depends on your data.

## Clean up

When you are done experimenting on your computer, remove the containers, the network, the volumes (this deletes the database) and your image:

Terminal on your computer

```bash
$ docker compose down --volumes
 Container task-api-proxy-1 Stopping
 Container task-api-proxy-1 Stopped
…
 Container task-api-redis-1 Removed
 Container task-api-db-1 Removed
 Volume task-api_redisdata Removing
 Network task-api_default Removing
 Volume task-api_pgdata Removing
 Volume task-api_redisdata Removed
 Volume task-api_pgdata Removed
 Network task-api_default Removed
$ docker image rm task-api:1.0.0
Untagged: task-api:1.0.0
Deleted: sha256:90feffb7effdc7af96a374c1a6bee299066727e5d0a179e83e4532ffb0b2f828
```

On a real server, never run `down --volumes`: it deletes your production data.

## Practice

TRY IT YOURSELF

### Add log limits

Docker's default log files grow without limit and can fill the server's disk. Add a `logging` section to the `app` service in `compose.yaml` that keeps at most 3 files of 10 MB.

**Show a solution**

```ts
  app:
    # … everything from before
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

Run `docker compose up -d app` to apply it. The app keeps at most 30 MB of logs; older lines are dropped. Ship logs to a log service if you need to keep them longer.

TRY IT YOURSELF

### A nightly backup

Write the line for a `crontab` that makes a backup every night at 02:30, with the date in the file name, and deletes backups older than 14 days. Remember that `%` has a special meaning in crontab.

**Show a solution**

```ts
30 2 * * * cd /srv/task-api && docker compose exec -T db pg_dump -U taskapi -d taskapi --format=custom > backups/taskapi-$(date +\%F).dump && find backups -name '*.dump' -mtime +14 -delete
```

`date +%F` prints the date as `2026-09-23`; in a crontab each `%` must be written `\%`. Add a second job that copies the newest file to storage outside the server, and a reminder to test a restore every month.

TRY IT YOURSELF

### Spot the mistakes

Find four production problems in this Compose service:

```ts
  app:
    image: task-api:latest
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://admin:admin123@db:5432/taskapi
      TRUST_PROXY: all
```

**Show a solution**

- `task-api:latest`: you cannot tell which version runs or go back to the previous one. Use version tags.
- `ports: "3000:3000"` publishes the app directly to the internet, around the proxy and its HTTPS.
- The password is written in the file, it is weak, and `admin` suggests a database superuser. Use `${POSTGRES_PASSWORD:?…}` from `.env`, a random value, and a user that owns only this database.
- `TRUST_PROXY: all` together with a published port lets any client fake its IP address with `X-Forwarded-For`. Trust only the proxy's network.

## Recap

- Production runs compiled JavaScript: `npm run build`, `npm ci --omit=dev`, `node dist/server.js`, with every setting in environment variables.
- On a Linux server, systemd keeps the app running, restarts it after a crash, and holds its secrets in an `EnvironmentFile`.
- A multi-stage Dockerfile builds a small image with no build tools, running as a non-root user.
- Docker Compose runs the app with PostgreSQL, Redis and Caddy on a private network. Only the proxy is published, data lives in volumes, and a missing password stops the start.
- Caddy gets and renews HTTPS certificates for your domain by itself. Trust forwarded headers only from your own proxy.
- Every deployment: back up, build a new tag, migrate, replace, check. Write migrations that suit both versions, and test your backups by restoring them.

You can now ship a ZudoJS app. In the capstone you design and build a bigger one from scratch: ShopFlow.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
