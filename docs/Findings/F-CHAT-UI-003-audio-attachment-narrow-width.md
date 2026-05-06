# F-CHAT-UI-003 Audio Attachment Narrow Width

- `status`: `deferred`
- `found_in`: auth shell markup cleanup and chat markup review
- `risk`: `low`
- `urgency`: re-evaluate in `MT-8.5 Portal UI/UX Baseline Review`; fix in a focused chat attachment UI polish slice if narrow mobile audio/voice states remain in the accepted baseline
- `area`: frontend chat transcript, audio attachment rendering, voice messages
- `evidence`:
  - `frontend/src/features/chat/components/chat-transcript/AttachmentCard.tsx` renders audio controls with `className="mt-3 w-full min-w-[220px] max-w-full"`.
  - `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx` constrains incoming bubbles to `max-w-[calc(86%_-_2.5rem)]` on small screens.
  - On narrow devices, bubble padding plus attachment-card padding plus `audio min-w-[220px]` can exceed the incoming bubble width and risk horizontal overflow or clipped native audio controls.
- `fix_short`: Replace the hard `audio` min-width with a bubble/container-aware width strategy, or use a custom compact audio attachment layout that preserves native playback while avoiding horizontal overflow.
- `acceptance`:
  - Voice messages render without horizontal overflow on narrow mobile widths.
  - Native audio controls remain usable on iOS Safari/PWA, Android Chrome, desktop Chrome/Edge/Safari.
  - Existing iPhone MP3 voice-message playback and duration behavior remain unchanged.
