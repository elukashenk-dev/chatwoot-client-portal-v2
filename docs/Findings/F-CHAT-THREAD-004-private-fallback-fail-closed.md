# F-CHAT-THREAD-004. Private Thread Fallback Must Fail Closed

- `status`: `open`
- `found_in`: chat thread model technical design review
- `risk`: `medium`
- `urgency`: before implementing default active-thread selection
- `area`: backend chat threads, frontend active-thread selection, configuration errors
- `evidence`:
  - The design spec says default active thread may fall back to the first company thread if private thread is unavailable.
  - Company thread access is derived from the same current person contact attributes.
  - If the private thread is unavailable because the person contact is disabled, missing or not `portal_contact_type = person`, falling back to a company thread would bypass the core person-contact authority check.
- `fix_short`: Allow fallback to a company thread only when the person contact is valid and enabled, and only the private conversation itself is missing/empty. If person contact authority is invalid, fail closed for every thread.
- `acceptance`:
  - Disabled/missing/wrong-type person contact returns controlled configuration/access error and no thread list.
  - Empty private conversation can coexist with valid company threads.
  - Tests distinguish "private conversation missing" from "person contact authority invalid".
  - Frontend does not silently select a company thread after backend reports person-contact configuration failure.
