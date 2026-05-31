# MCP Playwright Latest Results

Этот файл хранит только последний результат прогона. При новом прогоне
перезаписать весь файл целиком, не добавлять историю ниже старых данных.

Не записывать сюда passwords, cookies, tokens, email codes, real customer data
или ссылки на screenshots с чувствительными данными.

## Run Metadata

| Field | Value |
| --- | --- |
| Date/time | 2026-05-31 23:14:35 +04 |
| Operator | Codex via MCP Playwright |
| Branch/commit/deploy | MCP sanity on `fix/chat-send-failure-retry` / `1914478`; merged into local `main` as `0d670e0`; local dev |
| Environment | local production-like tenant |
| TENANT_URL | `http://zubi.127.0.0.1.nip.io:5174` with backend trusted origin for local worktree validation |
| Browser engine | Chromium via MCP Playwright |
| Scope | S-33 fix sanity only |
| Result | PASS |

## Scenario Results

| ID | Result | Evidence | Notes |
| --- | --- | --- | --- |
| S-33 | PASS | First `POST /api/chat/messages` was fulfilled with synthetic `500`; second POST ran automatically; both payloads used the same `clientMessageKey`; final backend exact search count was `1`. | UI showed queued state after failure and removed it after backend canonicalization. |

## Latest Findings

| Finding file | Scenario | Status | Notes |
| --- | --- | --- | --- |
| `docs/findings/F-CHAT-UI-004-send-failure-optimistic-message.md` | S-33 | closed | Fixed by scheduled foreground outbox retry after transient send failure. Finding file removed. |
