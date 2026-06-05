---
status: open
found_in: production unread indicators smoke
risk: medium
urgency: investigate/reproduce before fixing
area: frontend chat unread indicators, service-worker push delivery, push stale markers
---

# F-CHAT-008 Unread Indicators May Miss Other-Thread Push While App Is Open

## Evidence

Observed in production during read/typing feature smoke:

- Portal user is viewing a group chat.
- Agent sends a message to the user's private chat.
- Browser push arrives.
- Notification sound plays.
- App icon badge number appears.
- Chat menu red dot does not appear.
- Chat menu private-thread unread count does not appear.
- After closing/reopening the app, the red dot and private-thread unread count
  appear correctly.

The symptom was seen more than once, but it is not yet confirmed as consistently
reproducible.

## Current Code Observations

- Backend push payload should include both per-thread and total unread counts:
  `backend/src/modules/chat-notifications/pushDeliveryService.ts` builds
  `threadUnreadCount` from `visibleThread.unreadCount` and `totalUnreadCount`
  from `visibleThreads.totalUnreadCount`.
- Service worker app badge can be updated independently from React UI:
  `frontend/public/sw.js` calls `setExactAppIconBadge(payload.totalUnreadCount)`
  after push handling falls through to system notification.
- React menu unread state updates only if the page receives and handles
  `PORTAL_PUSH_MESSAGE`:
  `useChatPageNotifications` sends other-thread pushes to
  `handleOtherThreadPush`, and `applyPushUnreadCounts` updates the matching
  thread.
- Service worker only posts push messages to clients that are considered ready:
  visible, same-origin, and present in `PUSH_READY_CLIENT_IDS`.
- If a visible React client is not ready, does not receive the message, or does
  not answer in time, the service worker still shows the notification and sets
  the app badge.
- Service worker persists a push stale marker in that fallback path.
- Current stale-marker refresh path in
  `frontend/src/features/chat/pages/useChatPushStaleMarkerRefresh.ts` consumes
  markers only for the selected thread by passing `[selectedThread]` to
  `consumePushStaleMarkersForKnownThreads`.
- That means a stale marker for an unselected private chat can remain until a
  startup/reopen or foreground thread-list refresh loads unread counts from the
  backend.

## Working Hypothesis

The backend unread state is likely correct because unread indicators appear
after app reopen. The likely gap is frontend runtime refresh:

1. Push arrives for a non-selected thread.
2. Service worker sets app badge from `totalUnreadCount`.
3. React state does not receive/apply `threadUnreadCount`.
4. A push stale marker is stored.
5. The open app refreshes stale markers only for the selected thread, so the
   non-selected thread menu badge remains stale until reopen or another full
   thread-list refresh.

## Important Caution Before Fixing

Do not blindly refresh `getChatMessages` for non-selected stale-marker threads.
For the selected/opened thread this is valid, but for a non-selected thread it
can clear unread as if the user opened that chat.

Any fix should preserve this boundary:

- selected thread: message snapshot refresh may be valid;
- non-selected thread: prefer thread-list/unread-count refresh without opening
  or clearing the target thread.

## Investigation Steps

While reproducing, collect:

- Does the bug happen only when the app has been open for a while, after service
  worker update, or after network/foreground changes?
- Does it happen only when the app is installed PWA, or also in normal browser
  tab?
- When the bug happens, does waiting 30 seconds update the menu without reopen?
  `useChatForegroundUnreadRefresh` has a 30 second foreground thread-list
  refresh interval.
- Does focusing away and back update the menu?
- Does opening the chat menu trigger any delayed update, or only full app
  reopen?
- Does the system notification body show the correct unread count for the
  private chat?

## Candidate Fix Direction

If the hypothesis is confirmed:

- on stored push stale markers for known non-selected threads, refresh
  `/api/chat/threads` or another unread-only endpoint;
- update `pageState.threads` from backend thread unread counts;
- update app badge from backend `totalUnreadCount`;
- delete consumed stale markers for known refreshed threads;
- do not replace the active transcript unless the refreshed marker belongs to
  the selected thread.

## Acceptance

- Reproduction or strong diagnostic evidence confirms the failing layer.
- Test covers a non-selected-thread stale marker while another thread is open.
- Fix updates menu red dot and per-thread unread count without opening/clearing
  the non-selected thread.
- Existing selected-thread stale marker behavior remains covered.
