# Notification Settings Simplify Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the old push-heavy notification settings with a Telegram-like model: notifications on/off, sound on/off, and push as device connection state.

**Architecture:** `pushEnabled` is removed from user and chat notification preferences without backward compatibility. Backend push delivery depends on effective chat notifications plus active device subscriptions, and `soundEnabled` is sent in the push payload so browser notifications can be silent. Frontend no longer exposes push as a behavior toggle; it shows one device row with connect/disconnect actions.

**Tech Stack:** TypeScript, Fastify, Drizzle/Postgres migrations, React, Vitest, PWA service worker.

---

### Task 1: Backend Notification Settings Model

**Files:**
- Modify: `backend/src/modules/chat-notifications/types.ts`
- Modify: `backend/src/modules/chat-notifications/settings.ts`
- Modify: `backend/src/modules/chat-notifications/service.ts`
- Modify: `backend/src/modules/chat-notifications/routes.ts`
- Modify: `backend/src/modules/chat-notifications/repository.ts`
- Modify: `backend/src/db/notificationSchema.ts`
- Create: `backend/drizzle/0006_remove_push_enabled_notification_preferences.sql`
- Update tests under `backend/src/modules/chat-notifications/`

- [x] Write failing backend tests that reject `pushEnabled` in global/chat settings patches and expect settings responses without `pushEnabled`.
- [x] Run targeted backend notification tests and confirm they fail because `pushEnabled` is still accepted/returned.
- [x] Remove `pushEnabled` from backend types, schemas, merge logic, repository selections/upserts and Drizzle schema.
- [x] Add a destructive migration dropping `push_enabled` and `push_enabled_override`.
- [x] Run targeted backend notification tests and confirm they pass.

### Task 2: Push Delivery Uses Notifications Plus Active Subscriptions

**Files:**
- Modify: `backend/src/modules/chat-notifications/pushDeliveryService.ts`
- Modify: `backend/src/modules/chat-notifications/pushDeliveryService.test.ts`

- [x] Write failing tests that push is sent when notifications are enabled and active subscription exists, without a `pushEnabled` setting.
- [x] Write failing tests that push is skipped when effective `newMessagesEnabled` is false.
- [x] Write failing tests that payload includes `soundEnabled`.
- [x] Implement minimal push delivery changes: skip only on `!effective.newMessagesEnabled`, include `soundEnabled` in payload.
- [x] Run targeted push delivery tests and confirm they pass.

### Task 3: Service Worker Silent Notification Handling

**Files:**
- Modify: `frontend/public/sw.js`
- Modify: `frontend/src/pwa/serviceWorkerPushMessages.ts`
- Modify: `frontend/src/pwa/serviceWorkerAsset.test.ts`

- [x] Write failing service worker tests that `soundEnabled: false` in payload produces `showNotification(..., { silent: true })`.
- [x] Write failing service worker message parsing test that foreground clients receive `soundEnabled`.
- [x] Parse `soundEnabled` from push payload and include it in foreground messages.
- [x] Set `notificationOptions.silent = true` only when payload sound is explicitly false.
- [x] Run targeted service worker tests and confirm they pass.

### Task 4: Telegram-Like Global Settings UI

**Files:**
- Modify: `frontend/src/features/settings/pages/UserNotificationsPage.tsx`
- Modify: `frontend/src/features/settings/pages/useUserNotificationsSettings.ts`
- Modify: `frontend/src/features/settings/pages/UserNotificationsPage.test.tsx`
- Modify: `frontend/src/features/chat/components/NotificationSettingsControls.tsx`
- Modify: `frontend/src/features/chat/lib/notificationSettingsPresentation.ts`
- Modify: `frontend/src/features/chat/types.ts`

- [x] Write failing UI tests that global settings show `Уведомления о новых сообщениях`, `Звук`, and `Push на этом устройстве`, but do not show `Push-уведомления`.
- [x] Write failing UI tests that connecting push subscribes the device without updating user settings.
- [x] Implement reusable action/status row for device push.
- [x] Update global settings page to remove push switch and use device row.
- [x] Run targeted settings page tests and confirm they pass.

### Task 5: Telegram-Like Chat Settings UI

**Files:**
- Modify: `frontend/src/features/chat/components/ChatNotificationsPage.tsx`
- Modify: `frontend/src/features/chat/components/ChatNotificationsPage.test.tsx`
- Modify: `frontend/src/features/chat/pages/useChatNotificationsPanel.ts`
- Modify: `frontend/src/features/chat/components/ChatHeader.tsx`
- Modify: related frontend tests with notification settings fixtures

- [x] Write failing UI tests that chat settings show `Уведомления в этом чате`, `Звук`, and device push row, but do not show `Push-уведомления`.
- [x] Write failing UI tests that reset overrides only clears `newMessagesEnabled` and `soundEnabled`.
- [x] Remove chat-level push override UI and update hook reset/enable-device behavior.
- [x] Update header notification status copy to `Выключены`, `Без звука`, or `Включены`.
- [x] Run targeted chat notification UI tests and confirm they pass.

### Task 6: Verification And Review

**Files:**
- Modify docs only if stable baseline text needs adjustment: `docs/roadmap/work-log.md`, `docs/architecture/overview.md`, `docs/architecture/decisions.md`.

- [x] Run backend targeted notification tests.
- [x] Run frontend targeted notification/service-worker tests.
- [x] Run backend build/lint.
- [x] Run frontend build/lint.
- [x] Run `git diff --check`.
- [x] Review changed backend/frontend areas for stale `pushEnabled` references and UX contradictions.
- [x] Update stable docs if this slice changes the long-term baseline.
