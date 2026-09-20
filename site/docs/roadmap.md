---
title: "Roadmap"
description: "Where Zudo is headed. Features, milestones, and vision. Current releases, near-term, mid-term, and long-term goals."
source: https://zudojs.oyinlola.site/docs/roadmap
---

v1.x

# Roadmap

Implementation status, completed milestones, and future directions for the Zudo framework.

ROADMAP STATUS FUTURE

## Timeline

Current

### v1.x — Core Framework

The foundational release. 39 packages across 6 architecture layers, all published to npm.

DI Container

Event Bus

Config System

Lifecycle

CQRS Primitives

Auth Stack

OAuth 2.0 Sign-in

HTTP Server

CLI Tooling

Current

### Audit & Hardening — Rounds 9–11

A numbered audit series over every package. Each finding is reproduced by executing the real source before it is written down, and ships with a regression test that fails against the unfixed code. Round 11 closed 98 findings, 3 of them critical, with the suite green at 7,891 tests.

Safe Defaults At The Edge

Forwarded headers are ignored unless `trustProxy` is set, so a client cannot choose its own `req.ip`. An `OPTIONS` request can no longer reach another method's handler.

Context Cannot Be Forged

The queue owns its reserved `zudo:context` metadata key, so an enqueuer can no longer hand a job the tenant it runs as.

Redaction On Every Path

Secret detection moved into the config store itself, so `toSafeObject()` redacts `initialValues` and runtime `set()` values, not only values read from a source.

Declared Means Wired

Fourteen capabilities that were typed, exported and documented but never invoked are now wired up or removed — the defect class these rounds exist to find.

Next

### Near-Term — Expand Ecosystem

Broadening the package ecosystem and developer experience.

Additional Adapters

Express, Fastify, Koa, Hono transport adapters.

More Schematics

Code generation templates for modules, services, handlers.

CLI Enhancements

Interactive project setup, package upgrades, migration tools.

Documentation Site

Full reference docs, guides, tutorials, and examples.

HTTP Query Method

A client-side `httpQuery()` convenience method for GET requests. The server-side query parser is complete and hardened; this is the client helper that builds on it.

Mid-Term

### Mid-Term — Platform & Integrations

Building the ecosystem around Zudo.

Plugin Marketplace

Discover and install community plugins. Version management, compatibility checks.

Cloud Integrations

AWS, GCP, Azure adapters. Serverless deployment, container orchestration.

Monitoring Dashboards

Pre-built Grafana dashboards, Prometheus exporters, health check endpoints.

Admin UI

Built-in admin interface for managing config, users, and feature flags.

Vision

### Long-Term — The Future

Where Zudo is ultimately headed.

Multi-Runtime

Run Zudo on Node.js, Deno, Bun, and Cloudflare Workers.

Edge Computing

Deploy Zudo modules to edge locations with zero config.

AI-Assisted Dev

AI code generation, auto-completion, and intelligent refactoring.
