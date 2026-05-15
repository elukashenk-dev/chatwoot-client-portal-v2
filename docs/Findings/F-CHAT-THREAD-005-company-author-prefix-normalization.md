# F-CHAT-THREAD-005. Company Author Prefix Normalization

- `status`: `open`
- `found_in`: chat thread model technical design review
- `risk`: `low`
- `urgency`: before implementing company-thread message formatting
- `area`: backend chat messages, company thread author display, Chatwoot message formatting
- `evidence`:
  - Company-thread messages use a Markdown strong author prefix such as `**Иван Петров**`.
  - The plan escapes some Markdown characters but does not explicitly force the author display name to one line or enforce a maximum length.
  - Author names are user-provided through registration/profile data and can make Chatwoot-visible messages confusing if not normalized.
- `fix_short`: Normalize author display names before formatting: trim, collapse whitespace, remove line breaks/control characters, enforce a reasonable max length and use a safe fallback.
- `acceptance`:
  - Multi-line names cannot create extra message body lines before the real content.
  - Very long names are truncated or rejected according to a documented limit.
  - Empty/invalid names use a safe fallback such as the portal user's email or `Пользователь`.
  - Tests cover Markdown characters, line breaks, empty names and long names.
