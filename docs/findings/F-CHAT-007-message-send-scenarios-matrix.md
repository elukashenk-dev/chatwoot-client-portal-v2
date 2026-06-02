# F-CHAT-007 Message Send Scenarios Matrix

- `status`: `open`
- `found_in`: chat message reliability follow-up review
- `risk`: `low`
- `urgency`: before the next larger send/retry/read-receipt implementation
- `area`: docs, chat send QA, product behavior baseline
- `evidence`:
  - `docs/operations/production-mcp-playwright-test-cycle.md` contains many
    production-like QA scenarios, but it is too broad to serve as a compact
    product-facing map of chat send behavior.
  - There is no dedicated simple table that lists current UI behavior for common
    send cases: normal text, offline text, VPN blackhole, slow network,
    transient backend failure, permanent backend rejection, file, voice, group
    chat, private chat, retry, and reload while queued.
  - Without a compact current-behavior matrix, reliability changes can drift
    from the product expectation discussed in chat.
- `fix_short`: Create a small docs table that describes current behavior only,
  not desired future behavior, and link it from the relevant operations docs.
- `acceptance`:
  - A new docs file lists user scenario, precondition, user action, current UI
    response, backend/outbox behavior, and known caveat.
  - The table covers text, attachment, voice, private/group, offline, VPN,
    slow network, transient failure, permanent failure, retry, app reload and
    background sync cases.
  - Each row is grounded in current code or an existing test/QA scenario.
  - Future behavior changes update the matrix in the same slice.
