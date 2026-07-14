# Stage 09: Dynamic Validation

Status: complete
Frozen commit: `a61b4975ae7b59e244c0b5bbc4efd02466aa075c`

## Scope And Safety Gates

Dynamic checks run from the audit control worktree because it retains the
ignored local `.env` and installed dependencies. A path-scoped Git comparison
against the frozen commit returned exit `0` for `.github`, product source,
infrastructure, scripts, tests, examples and workspace configuration. No
tracked product delta was present before the checks.

The run never prints local secret values. Chatwoot-mutating browser fixtures
are allowed only when their configured base URL is explicitly local.

## Required Non-Browser Gates

| Command      | Start                       | End                         | Exit | Result | Key evidence                                                                                        |
| ------------ | --------------------------- | --------------------------- | ---- | ------ | --------------------------------------------------------------------------------------------------- |
| `pnpm lint`  | `2026-07-14T13:55:22+04:00` | `2026-07-14T13:55:48+04:00` | 0    | PASS   | Code-health checked 750 files; backend and frontend ESLint passed                                   |
| `pnpm build` | `2026-07-14T13:55:55+04:00` | `2026-07-14T13:56:15+04:00` | 0    | PASS   | Backend TypeScript and frontend production build passed                                             |
| `pnpm test`  | `2026-07-14T13:59:46+04:00` | `2026-07-14T14:09:11+04:00` | 0    | PASS   | Backend 125 files / 842 tests; frontend 127 files / 732 tests; production env/ingress checks passed |

The first verbose `pnpm test` harness lost its output consumer after a tool
wait returned prematurely. That process was terminated before it could be
used as evidence and the command was restarted with output redirected to a
temporary, untracked log. The restarted process is monitored by PID and a
separate exit-code file; only its terminal result is reported above.

## Candidate-Targeted Tests

| Candidate   | Literal test path                                      | Exact command                                                                                                        | Exit | Result                 |
| ----------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------- |
| `ARCH-004`  | `backend/src/app-admin-auth.integration.test.ts`       | `pnpm --dir backend exec vitest run --no-file-parallelism --reporter=default src/app-admin-auth.integration.test.ts` | 0    | PASS: 1 file / 3 tests |
| `FRONT-006` | `frontend/src/pwa/serviceWorkerBackgroundSync.test.ts` | `pnpm --dir frontend exec vitest run --reporter=default src/pwa/serviceWorkerBackgroundSync.test.ts`                 | 0    | PASS: 1 file / 8 tests |

The package-script form from the plan did not narrow Vitest on this workspace,
so it was stopped as soon as the unrelated `app.test.ts` appeared. The direct
Vitest commands above are the completed, bounded evidence runs.

## Local Runtime Readiness

| Boundary                | Observation before portal service startup                                                                                      | Consequence                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portal Postgres         | `pg_isready` returned exit `0` for the host/port/database parsed from ignored `.env`; values and credentials were not recorded | Existing local database can support portal runtime/global setup                                                                                     |
| Object storage          | Configured local endpoint returned HTTP status `000`                                                                           | Storage-dependent browser scenarios require a successful startup or remain blocked                                                                  |
| Mailpit                 | `http://127.0.0.1:8025` returned `200`                                                                                         | Local email inspection is available                                                                                                                 |
| Chatwoot                | `http://127.0.0.1:3000` returned status `000`                                                                                  | Chatwoot-dependent specs are blocked unless the service becomes available                                                                           |
| Portal backend/frontend | Ports `3301` and `5173` were not serving before this task starts them                                                          | The task owns and must stop any processes it starts                                                                                                 |
| Docker CLI              | The default context could not connect to `/var/run/docker.sock`                                                                | Compose startup/status commands need explicit failure recording; an already-running database may still be reachable through the configured WSL host |

`pnpm db:up`, `pnpm storage:up` and both required Compose `ps` commands
returned exit `1` because the default Docker socket was unavailable. The
database was not started by this task, but remained reachable through the
host parsed from ignored `.env`. MinIO remained unavailable.

The task then started backend with `AUTH_RATE_LIMIT_MAX=100` and frontend with
the runbook host setting. Backend `/api/health` and the tenant-host
`/api/tenant` route both returned `200`. No startup error was found in either
captured log. Both task-owned process groups were terminated after browser
checks; ports `3301` and `5173` no longer had listeners. The task did not stop
the pre-existing portal database or Mailpit.

## Local-Only Chatwoot Mutation Gate

Ignored `.env` contains none of
`E2E_CHATWOOT_BASE_URL`, `E2E_CHATWOOT_ACCOUNT_ID`,
`E2E_CHATWOOT_PORTAL_INBOX_ID` or `E2E_CHATWOOT_API_ACCESS_TOKEN`.
No secret value was printed. Because the local Chatwoot service is also
unreachable, any spec that creates Chatwoot contacts or messages is `BLOCKED`
and must not run.

## Browser Validation

The local tenant was
`http://buhfirma.127.0.0.1.nip.io:5173`. Each permitted spec ran separately
with one Chromium worker and the list reporter.

| Playwright spec                                       | Exit | Tests     | Disposition | First actionable evidence                                                                                    |
| ----------------------------------------------------- | ---- | --------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| `tests/e2e/auth-email-flows.spec.ts`                  | —    | 4 not run | BLOCKED     | Creates Chatwoot contacts; local service/config failed the mutation gate                                     |
| `tests/e2e/auth-guard-negative.spec.ts`               | —    | 7 not run | BLOCKED     | Contains a Chatwoot contact fixture; local service/config failed the mutation gate                           |
| `tests/e2e/auth-session.spec.ts`                      | 1    | 5 failed  | FAIL        | Old heading/password-login screen is absent at `/auth/login`                                                 |
| `tests/e2e/chat-read-model.spec.ts`                   | 1    | 7 failed  | FAIL        | Every scenario times out waiting for removed password input before chat assertions                           |
| `tests/e2e/chat-notifications.spec.ts`                | 1    | 1 failed  | FAIL        | Removed password input blocks notification assertions                                                        |
| `tests/e2e/offline-first-pwa.spec.ts`                 | 1    | 6 failed  | FAIL        | Removed password input blocks offline/service-worker assertions                                              |
| `tests/e2e/chat-background-sync-real-network.spec.ts` | 1    | 1 failed  | FAIL        | Removed password input blocks the real-network service-worker assertion                                      |
| `tests/e2e/admin-branding-settings.spec.ts`           | 1    | 7 failed  | FAIL        | Fixture omits `/api/admin/legal-documents`; its real 401 rejects the page's combined load and hides the form |
| `tests/e2e/profile-page.spec.ts`                      | 1    | 1 failed  | FAIL        | Removed password input blocks profile assertions                                                             |

The seven executed files contain 28 tests and all 28 failed before their
intended product assertions. Twenty-one customer tests reproduce `BASE-001`.
The seven admin-branding failures establish `DYN-001`, a separate stale
browser fixture introduced when the page began loading branding and legal
documents together.

The complete `pnpm test:e2e` suite was not run: targeted failures were already
understood and the required local Chatwoot fixtures were unavailable. Running
the remainder would repeat the same stale customer helper or violate the
explicit fixture gate without adding product evidence.

## Candidate-Specific Runtime Limits

- `FRONT-005` could not reach the other-thread push schedule because the
  notification spec stops at `BASE-001`; its installed/open-tab timing remains
  a device/browser follow-up.
- `FRONT-006` retains fresh static recovery evidence from 8 passing targeted
  tests, but Chromium E2E stops at `BASE-001`; closed-app Android behavior
  remains unproved.
- `FRONT-007` requires the documented focused real-iPhone keyboard/drag
  matrix; no iOS device was available.
- `FRONT-008` depends on native audio-control rendering across narrow real
  devices; the current Playwright inventory has no audio scenario.
- No browser result in this stage establishes a new customer, chat, PWA,
  profile or branding product-runtime failure beyond the already documented
  candidates. It establishes that those browser safety nets cannot currently
  provide regression evidence.

## Product-Tree Integrity

The final path-scoped Git comparison against the frozen commit returned exit
`0`. Only audit documentation changed. Generated build, test and Playwright
output is ignored and is not part of the audit branch.
