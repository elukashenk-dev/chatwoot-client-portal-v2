# Chat Search Jump Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open old chat search results as a bounded transcript fragment with manual earlier/later context expansion.

**Architecture:** Add a portal backend message-context endpoint under the existing tenant/session/thread authority boundary. Extend the Chatwoot client with an `after` messages wrapper, then add frontend transcript fragment state that replaces the displayed transcript until the user returns to latest messages.

**Tech Stack:** Fastify, Zod, TypeScript, React, Vitest, Testing Library, Playwright.

---

## File Structure

- Modify `backend/src/integrations/chatwoot/messagePayload.ts`: add an after-page type.
- Modify `backend/src/integrations/chatwoot/client.ts`: support `after` in message fetches and expose `listConversationMessagesAfter`.
- Modify `backend/src/modules/chat-messages/types.ts`: add `ChatMessageContextResponse`.
- Modify `backend/src/modules/chat-messages/service.ts`: add `getCurrentUserChatMessageContext`.
- Modify `backend/src/modules/chat-messages/routes.ts`: add `GET /api/chat/threads/:threadId/messages/context`.
- Modify backend tests in `backend/src/modules/chat-messages/service.search.test.ts` and `routes.search.test.ts`.
- Modify `frontend/src/features/chat/types.ts`: add context response and fragment state types.
- Modify `frontend/src/features/chat/api/chatClient.ts`: add `getChatThreadMessageContext`.
- Modify `frontend/src/features/chat/pages/useChatSearchNavigation.ts`: load context for unloaded search results.
- Modify `frontend/src/features/chat/pages/ChatPage.tsx`: display fragment messages, expansion actions, and return-to-latest action.
- Modify `frontend/src/features/chat/components/ChatTranscript.tsx`: render fragment notice and context buttons.
- Modify frontend tests in `frontend/src/features/chat/pages/ChatPage.search.test.tsx`.

## Task 1: Backend Context API

- [ ] Add failing service tests for initial context around an unloaded message.
- [ ] Add failing service tests for `earlier` and `later` context pagination.
- [ ] Add failing route tests for auth, validation, and service call shape.
- [ ] Implement Chatwoot client `after` support.
- [ ] Implement `ChatMessageContextResponse` and service method.
- [ ] Implement route schema and route handler.
- [ ] Run targeted backend tests:

```bash
pnpm --filter portal-backend test -- src/modules/chat-messages/service.search.test.ts src/modules/chat-messages/routes.search.test.ts
```

## Task 2: Frontend Fragment State

- [ ] Add failing frontend test: unloaded search result opens fragment instead
      of silently returning to latest transcript.
- [ ] Add failing frontend test: `Показать более ранние`, `Показать более
поздние`, and `К последним сообщениям` work.
- [ ] Add API client method and types.
- [ ] Extend search navigation hook to request context when the message is not
      already loaded.
- [ ] Add fragment state to `ChatPage`.
- [ ] Extend `ChatTranscript` with fragment controls.
- [ ] Run targeted frontend tests:

```bash
pnpm --filter portal-web test -- src/features/chat/pages/ChatPage.search.test.tsx
```

## Task 3: Review And Verification

- [ ] Review backend authority boundary: tenant, session, thread, target message
      visibility, group author mapping.
- [ ] Review frontend state transitions: search page, fragment mode, latest mode,
      thread switching, realtime interaction.
- [ ] Run checks:

```bash
pnpm test
pnpm lint
pnpm build
pnpm test:e2e
git diff --check
```

- [ ] Update `docs/roadmap/work-log.md` only if this changes the stable product
      baseline enough to deserve a short baseline entry.
