# F-CHAT-004: Last opened chat is not restored on online app boot

- `status`: `open`
- `found_in`: notification deep-link follow-up review
- `risk`: `low`
- `urgency`: Fix as a separate chat boot UX slice after notification routing is closed.
- `area`: chat boot, thread selection, startup cache
- `evidence`: The frontend persists the selected thread into startup/offline cache in `frontend/src/features/chat/pages/useOfflineChatCachePersistence.ts`, but the normal online boot path calls `GET /api/chat/threads` and then chooses `threadsResponse.activeThreadId`. The backend currently returns `activeThreadId: private:me` from `backend/src/modules/chat-threads/service.ts`, so reopening the app online can move the user back to the private chat even if their last active chat was a group.
- `fix_short`: Make chat boot prefer the last locally persisted selected thread when it is still present in the server-visible thread list, falling back to backend `activeThreadId` and then the first visible thread.
- `acceptance`: If the user last used `group:154`, closes the app, and reopens while online, the portal opens `group:154` when that thread is still accessible. If the group is no longer accessible, boot falls back safely to the backend/default visible thread.
