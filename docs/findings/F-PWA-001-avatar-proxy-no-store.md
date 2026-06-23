status: open
found_in: PWA offline-first debugging review, 2026-06-23
risk: medium
urgency: before relying on offline chat UX for real users
area: chat avatars, attachment proxy, PWA offline cache

## Evidence

- `frontend/src/features/chat/components/ChatAvatar.tsx` only accepts same-origin
  `/api/...` avatar URLs.
- `frontend/public/sw.js` intentionally skips every `/api/*` request, so avatar
  image bytes are never stored in the service-worker app-shell cache.
- `backend/src/modules/chat-messages/avatarProxyRoutes.ts` sends avatar proxy
  responses with `ATTACHMENT_PROXY_CACHE_CONTROL`.
- `backend/src/modules/chat-messages/attachmentProxyHeaders.ts` defines that
  value as `private, no-store`.
- `backend/src/modules/chat-messages/messageMapping.ts` builds support-agent
  avatar URLs per message id (`/messages/:messageId/avatar`), so the same
  visible avatar can become many distinct URLs across the transcript.

This explains repeated avatar downloads while switching chats and means cached
offline chat snapshots can keep avatar `src` values while the actual avatar
bytes are not available offline.

## Fix Short

Split avatar proxy cache policy from attachment proxy cache policy. Use a
private revalidatable cache policy for safe avatar routes, and consider stable
avatar URLs for repeated identities where the backend can preserve access
checks.

## Acceptance

- Switching between already opened chats does not re-download unchanged avatar
  bytes.
- Offline cached chat either shows cached avatar images or intentionally falls
  back to initials without broken image fetches.
- Tests assert avatar cache headers separately from attachment cache headers.
