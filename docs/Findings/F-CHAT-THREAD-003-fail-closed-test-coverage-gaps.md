# F-CHAT-THREAD-003. Fail-Closed Test Coverage Gaps

- `status`: `open`
- `found_in`: chat thread model technical design review
- `risk`: `medium`
- `urgency`: before starting chat-thread implementation tasks that expose runtime behavior
- `area`: backend chat threads, test coverage, configuration errors
- `evidence`:
  - The implementation plan contains comment-only test placeholders for missing and disabled company contacts.
  - Route tests are described generically instead of listing concrete fail-closed cases.
  - This feature depends on fail-closed behavior when Chatwoot contact attributes are malformed, missing, disabled, cross-tenant or no longer grant membership.
- `fix_short`: Replace placeholder/generic test instructions with concrete backend tests before implementation proceeds.
- `acceptance`:
  - Tests cover malformed `portal_client_company_contact_ids`.
  - Tests cover missing company contact.
  - Tests cover referenced contact with wrong `portal_contact_type`.
  - Tests cover disabled person contact and disabled company contact.
  - Tests cover forged `threadId` for a company not listed on the current person contact.
  - Tests cover membership removal blocking future history/send/realtime.
