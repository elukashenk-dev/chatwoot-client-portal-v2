# F-CHAT-UI-002 Context Menu Keyboard Accessibility

- `status`: `deferred`
- `found_in`: auth shell markup cleanup and chat markup review
- `risk`: `low`
- `urgency`: re-evaluate in `MT-8.5 Portal UI/UX Baseline Review`; fix in a focused chat accessibility polish slice before relying on message actions as a primary workflow
- `area`: frontend chat transcript, message context menu, message reply/copy actions
- `evidence`:
  - `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx` opens message actions through `onContextMenu` and swipe gestures.
  - `frontend/src/features/chat/components/chat-transcript/MessageContextMenu.tsx` renders `role="menu"` and `role="menuitem"` buttons, but does not move focus into the menu, restore focus on close, or implement keyboard menu navigation.
  - Keyboard users have visible buttons only for failed text retry; normal reply/copy actions are not exposed as a straightforward keyboard path.
- `fix_short`: Either downgrade the pointer-only context menu to non-menu semantics and add explicit per-message keyboard actions, or implement a real accessible menu pattern with focus entry, Escape/arrow handling, close-on-blur, and focus restore.
- `acceptance`:
  - A keyboard-only user can reply to and copy a message without using pointer gestures.
  - Opening the message actions moves focus predictably and closing them restores focus.
  - Escape closes the menu and does not disturb transcript scroll.
  - Existing desktop right-click and mobile swipe-to-reply behavior remain unchanged.
