# Thread-Only Clean Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a clean `threadId` / `portal_chat_threads` baseline with no previous portal users or previous portal chat mappings preserved.

**Architecture:** The portal is not live for real customers, so this is a destructive cleanup. The final portal database schema keeps only the thread-owned chat mapping and send idempotency is scoped only by `tenant_id + portal_chat_thread_id + user_id + client_message_key`. Browser-facing chat uses `threadId` only.

**Tech Stack:** Node.js, Fastify, TypeScript, Drizzle ORM, PostgreSQL, Vitest, Playwright.

---

## Scope Decision

- No migration of old portal users.
- No preservation of old private conversation mappings.
- No removed chat context compatibility endpoint.
- Local portal Postgres can be dropped and recreated.
- Chatwoot remains external system of record; portal DB reset does not delete Chatwoot contacts/conversations.
- GitHub and production deploy happen only after clean local verification.

## Tasks

### Task 1: Runtime Cleanup

- [x] Move shared authenticated-user helper out of removed chat compatibility code.
- [x] Stop registering the removed chat context endpoint.
- [x] Delete removed chat context module files.
- [x] Keep contact-link lookup as thread-owned infrastructure.

### Task 2: Schema Cleanup

- [x] Remove old portal chat mapping table from `backend/src/db/schema.ts`.
- [x] Make `portalChatMessageSends.portalChatThreadId` required.
- [x] Remove old public conversation selector fields from schema, repository types and service calls.
- [x] Squash Drizzle migrations into a single clean baseline.
- [x] Ensure a clean DB install ends with only the thread-owned schema.

### Task 3: Tests And Docs

- [x] Update backend tests away from removed context endpoint and old selector names.
- [x] Keep tests that reject browser-supplied Chatwoot conversation selectors on supported routes.
- [x] Update stable docs/work log to record destructive clean-schema decision.
- [x] Run backend tests/build, frontend tests/typecheck/build, root lint and Playwright e2e after local DB reset.

### Task 4: Local DB Reset And Runtime Validation

- [x] Drop/recreate portal Postgres schema.
- [x] Run migrations from scratch.
- [x] Create fresh portal users through supported flows and scripts.
- [x] Validate new private and company threads create fresh `portal_chat_threads` rows and messages send through `threadId`.
