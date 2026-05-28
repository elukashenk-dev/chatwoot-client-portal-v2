# Offline-first PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать Offline-first PWA MVP: приложение не зависает на splash при плохой связи, открывает сохраненные tenant/auth/chat данные после предыдущего online входа и надежно ставит текстовые сообщения в локальную очередь с последующей доставкой.

**Architecture:** Browser хранит только scoped local display/cache data в IndexedDB и никогда не получает Chatwoot authority. Portal backend остается единственной authority-зоной для tenant, auth/session, send, realtime и Chatwoot access. Service worker отвечает за app shell/static cache, push bridge и optional wakeups, но не становится generic `/api/*` cache.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, IndexedDB, `idb`, Service Worker, Fastify, Drizzle/Postgres, Playwright.

---

## Spec Review Result

Reviewed spec:

- [2026-05-27-offline-first-pwa-design.md](../specs/2026-05-27-offline-first-pwa-design.md)

Result: OK to plan implementation. The implementation is split into smaller reviewable slices; each slice is intended to be implemented, reviewed, checked and checkpointed independently.

Architectural guardrail for implementation:

- Durable outbox must be implemented as a separate frontend-domain module under `frontend/src/features/offline/`, not embedded inside `ChatPage`. `ChatPage` may wire UI state, selected thread and lifecycle triggers, but queue persistence, due-record selection, stale `sending` recovery, leases and drain logic must live in offline-domain files such as `offlineOutboxStore.ts`, `outboxDrain.ts` and `useOfflineOutboxDrain.ts`.
- Frontend app IndexedDB access must use the small `idb` Promise wrapper. Do not
  hand-roll a full app-side `IDBRequest`/`IDBTransaction` wrapper and do not
  adopt Dexie in the MVP. The non-bundled service worker may keep a tiny native
  helper only for push stale marker persistence.
- The MVP must fail closed on local-storage uncertainty: evicted/corrupt
  IndexedDB, unsupported storage, incompatible app/service-worker/database
  versions or suspicious local clock rollback must lead to controlled
  online-required/session-check-required/update UI, not partial protected data
  or an indefinite splash.
- Chromium automation is required, but browser confidence for this slice also
  needs a documented installed-PWA smoke matrix for Android Chrome and
  iOS/iPadOS Home Screen, or an exact blocker if a device is unavailable.

## Branching And Checkpoints

Project rule: do not implement this on the docs branch.

Implementation branch:

```text
feature/offline-first-pwa
```

Use one implementation branch for the MVP unless a slice produces a clean docs-only or backend-only checkpoint that the user explicitly wants to isolate. After each slice:

- implementation is complete for that slice;
- touched area is reviewed;
- findings are fixed or explicitly deferred;
- targeted checks pass or an exact blocker is recorded;
- a checkpoint commit is proposed before moving to the next slice.

`docs/roadmap/work-log.md` is updated only at final closure, because the stable runtime baseline changes only when the MVP is working end to end.

## Slice Map

1. [Slice 01: Backend Prerequisites](./2026-05-27-offline-first-pwa-01-backend-prerequisites.md)
   - Locks auth session metadata and push user binding.
2. [Slice 02: IndexedDB Foundation](./2026-05-27-offline-first-pwa-02-indexeddb-foundation.md)
   - Adds `idb`, defines `portal-offline` schema, scoped keys, cleanup,
     retention, storage diagnostics and schema compatibility rules.
3. [Slice 03: Startup UX And Tenant Cache](./2026-05-27-offline-first-pwa-03-startup-ux-tenant-cache.md)
   - Adds anti-hang startup deadlines and cached tenant fallback.
4. [Slice 04: Cached Auth Session](./2026-05-27-offline-first-pwa-04-cached-auth-session.md)
   - Adds bounded cached auth and local-device signout behavior.
5. [Slice 05: Cached Chat Read Model](./2026-05-27-offline-first-pwa-05-cached-chat-read-model.md)
   - Saves and opens cached chat thread/message snapshots.
6. [Slice 06: Outbox Core](./2026-05-27-offline-first-pwa-06-outbox-core.md)
   - Implements offline-domain outbox persistence, drain, leases and stale recovery.
7. [Slice 07: Composer And Chat Queue UI](./2026-05-27-offline-first-pwa-07-composer-chat-queue-ui.md)
   - Wires durable outbox behavior into composer and chat UI.
8. [Slice 08: Service Worker And PWA Hardening](./2026-05-27-offline-first-pwa-08-service-worker-pwa-hardening.md)
   - Hardens app-shell precache, route chunks, build/cache version signaling
     and push stale marker persistence.
9. [Slice 09: Runtime E2E And Closure](./2026-05-27-offline-first-pwa-09-runtime-e2e-closure.md)
   - Verifies browser runtime behavior, storage-loss behavior, device smoke
     matrix and closes the baseline.

## Acceptance Mapping

- Anti-hang startup: Slices 03, 04, 09.
- Offline tenant/auth protected shell: Slices 02, 03, 04, 09.
- Cached chat read model: Slice 05.
- Durable text outbox: Slices 06, 07, 09.
- Multi-tab and stale sending recovery: Slices 06, 09.
- Push stale markers with user binding: Slices 01, 08.
- Service worker asset hardening and `/api/*` passthrough: Slice 08.
- Local device data removal and logout cleanup: Slices 02, 04.
- Retention/pruning: Slice 02 and final review in Slice 09.
- Storage eviction/corruption and blocked IndexedDB UX: Slices 02, 03, 04, 09.
- Local clock rollback guard for cached auth: Slices 04, 09.
- App/service-worker/IndexedDB version compatibility: Slices 02, 08, 09.
- Reconnect freshness without relying on push: Slices 05, 08, 09.
- Installed-PWA real-device smoke matrix: Slice 09.
- Privacy-safe observability/logging hooks: Slices 03, 06, 08, 09.
- SMS fallback readiness: Slices 02, 07, 09.

## Recommended Review Order

1. Review Slice 01 first because it locks backend contracts consumed by later slices.
2. Review Slice 02 before any frontend offline feature work because it defines the IndexedDB schema and cleanup semantics.
3. Review Slices 03-05 in order because startup, auth and chat cache build on each other.
4. Review Slice 06 independently and carefully because durable outbox core is the highest-risk frontend-domain module.
5. Review Slice 07 after Slice 06 to keep UI wiring separate from queue ownership.
6. Review Slice 08 after schema decisions are stable.
7. Review Slice 09 last, after all runtime behavior exists.

## Execution Handoff

Plan index saved to:

```text
docs/superpowers/plans/2026-05-27-offline-first-pwa-implementation.md
```

Detailed slice plans are saved next to it as `2026-05-27-offline-first-pwa-0N-*.md`.

Two execution options:

1. Subagent-Driven (recommended): dispatch a fresh subagent per slice, review between slices, fast iteration.
2. Inline Execution: execute slices in this session using `superpowers:executing-plans`, with checkpoints for review.
