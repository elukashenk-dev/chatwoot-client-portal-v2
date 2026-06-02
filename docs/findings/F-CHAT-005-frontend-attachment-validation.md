# F-CHAT-005 Frontend Attachment Validation

- `status`: `open`
- `found_in`: chat message reliability follow-up review
- `risk`: `medium`
- `urgency`: before the next chat send reliability hardening slice
- `area`: frontend chat composer, attachment send UX, voice send UX
- `evidence`:
  - `backend/src/modules/chat-messages/attachmentSend.ts` rejects empty files,
    files over `40 MB`, unsupported MIME types and file names over `255`
    characters before calling Chatwoot.
  - `backend/src/modules/chat-messages/routes.ts` also maps multipart file-size
    errors to `attachment_too_large`.
  - `frontend/src/features/chat/components/MessageComposer.tsx` currently lets a
    selected attachment reach `onSendAttachment` without checking the same
    obvious limits in the UI.
  - Text and attachment caption length are already guarded on the frontend via
    `frontend/src/features/chat/lib/messageContentLimits.ts`, but file-specific
    validation is still backend-first.
- `fix_short`: Add frontend attachment validation that mirrors backend-visible
  user limits: empty file, max `40 MB`, file name max `255`, and allowed file
  type/extension hints. Keep backend as authority.
- `acceptance`:
  - Selecting or sending a file over `40 MB` shows a local composer error before
    upload starts.
  - Empty files and overlong file names are rejected locally with clear Russian
    copy.
  - Unsupported file types are rejected locally when the browser exposes enough
    MIME/name information; backend still rejects anything that bypasses the
    client.
  - Voice blobs are checked before `onSendAttachment` receives them.
  - Existing text/caption length validation and online-only media send behavior
    remain unchanged.
