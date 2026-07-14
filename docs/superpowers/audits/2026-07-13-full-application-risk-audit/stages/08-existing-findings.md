# Stage 08: Existing Finding Registry Revalidation

Status: complete

Verdict effect: the ten-file active registry contains three validated findings,
six findings that still need runtime, external-state or product-decision
follow-up, and one superseded finding. No entry was rejected as factually
false. `F-E2E-001` no longer matches the product contract because separate
registration was intentionally removed; `BASE-001` now owns the stale browser
suite. `F-PWA-003` still needs Android acceptance, but its static suspected
failure mode was mitigated after the file was written. No registry file was
modified or deleted during discovery. The final `GO` blocker remains
`SEC-DEEP-001` from Stage 02.

## Frozen Target And Review Boundary

- Repository revision: `a61b4975ae7b59e244c0b5bbc4efd02466aa075c`
- Frozen source:
  `/home/evluk/projects/chatwoot-client-portal-v2-audit-source-2026-07-13`
- Registry: `docs/findings/README.md` plus every `F-*.md` file under
  `docs/findings/`, read completely
- Revalidation inputs: current product code, stable docs, Git history and prior
  audit Stages 00-07
- Product source and `docs/findings/` mutation: none
- Production VM, installed mobile devices and external services: not touched

## Registry Inventory And Format

The frozen registry contains exactly ten active finding files and no untracked
finding document. All ten use an allowed source status (`open` or `deferred`)
and provide status, discovery source, risk, urgency, area, evidence, proposed
fix and acceptance semantics.

One format inconsistency remains:

- `F-CHAT-008-unread-indicators-missing-for-other-thread-push.md` uses
  `## Candidate Fix Direction` instead of the canonical `fix_short` field.
  The intended fix is understandable, so this is registry hygiene rather than
  missing risk evidence. Normalize it the next time that finding is edited.

The mix of YAML front matter and inline backtick fields is accepted by the
current README, although a future registry parser would benefit from one
machine-readable format.

## Disposition Summary

| Finding         | Source status/risk | Audit disposition | Current severity | Current conclusion                                                                                   |
| --------------- | ------------------ | ----------------- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| `F-AUTH-001`    | deferred / Low     | validated         | Low              | Auth counters remain bounded but process-local and are bypassable across backend replicas            |
| `F-CHAT-005`    | open / Medium      | validated         | Medium           | Composer still uploads predictable invalid files; voice accumulation has no duration/byte admission  |
| `F-CHAT-008`    | open / Medium      | needs_follow_up   | Medium           | Unselected stale markers persist, but visible 30-second thread refresh may now repair the symptom    |
| `F-CHAT-UI-003` | deferred / Low     | needs_follow_up   | Low              | Static narrow-width conflict remains; native audio rendering must be observed                        |
| `F-E2E-001`     | open / Medium      | superseded        | N/A              | Registration fixture env is not the current blocker; removed routes leave the Playwright suite stale |
| `F-IOS-001`     | deferred / Medium  | needs_follow_up   | Medium           | Code still follows iOS visual viewport motion; only a focused real-device experiment can close it    |
| `F-OPS-001`     | deferred / Medium  | validated         | Medium           | Historical incident is credible and the current runbook explicitly says the policy is not applied    |
| `F-OPS-002`     | open / High        | needs_follow_up   | High             | Custom-domain helper exists, but provider wildcard ingress and production lifecycle proof do not     |
| `F-OPS-003`     | deferred / Medium  | needs_follow_up   | Medium           | CLI-only is intentional today; operator/audit model is an unresolved conditional product choice      |
| `F-PWA-003`     | deferred / High    | needs_follow_up   | Medium           | Worker now keeps retryable sync pending; real closed-app Android delivery remains unproved           |

Counts: `validated=3`, `needs_follow_up=6`, `superseded=1`, `rejected=0`.

## Validated Findings

### F-AUTH-001: process-local auth rate limit

- `registerAuthRateLimit()` constructs one in-memory bucket map per Fastify
  instance (`backend/src/modules/auth/rateLimit.ts:86-132`). Keys include route,
  tenant/host and IP, but there is no shared durable store.
- Memory/cardinality behavior is better than the finding text implies:
  expired entries are pruned and the map is capped at 10,000
  (`rateLimit.ts:5,63-84,113-116`). The failure is cross-replica enforcement,
  not unbounded single-process memory.
- The reference compose runs one backend, so current single-instance behavior
  remains protected and the Low severity/conditional urgency are appropriate.
- Acceptance remains valid. A shared solution must preserve tenant/route/IP
  scope, `Retry-After`, fail behavior and explicit total request/write budgets;
  local development should not silently use weaker production semantics.

### F-CHAT-005: frontend attachment and voice admission

- Backend rejects empty, over-40-MiB, unsupported-type and over-255-character
  filenames (`backend/src/modules/chat-messages/attachmentSend.ts:8-78`).
- `submitAttachmentFile()` computes an idempotency signature and calls
  `onSendAttachment()` without checking those properties
  (`frontend/src/features/chat/components/MessageComposer.tsx:225-277`).
- Voice recording accumulates every non-empty MediaRecorder chunk until manual
  stop, then may convert before the same unchecked attachment submission
  (`useVoiceRecorder.ts:75-88,134-173,209-255`). No duration, source-byte or
  conversion-expansion limit was found.
- The original finding is valid and `FRONT-004` records the broader admission
  path. Backend authority limits server impact, but predictable invalid uploads
  waste bandwidth/memory and voice conversion can pressure the browser.
- Acceptance should add a bounded recording duration/source-byte test and
  conversion failure budget while retaining the existing listed file checks.

### F-OPS-001: uncontrolled OS upgrade can strand Chatwoot realtime

- The finding records an actual 2026-05-29 incident in which Redis/PostgreSQL or
  network service restarts left old Chatwoot web/worker processes with stale
  realtime connections; restarting those processes restored delivery.
- Current production guidance explicitly says the OS upgrade policy is not
  applied and points to this finding before real users/support SLAs
  (`docs/operations/production-deployment.md:180-186`).
- This is sufficient to validate the operations risk even though the audit did
  not inspect the live VM. The acceptance criteria remain sound: controlled
  maintenance, selective process restart and end-to-end realtime checks.
- Portal deploy work must not mutate Chatwoot to close this finding; it needs a
  separately approved production operations window and retained evidence.

## Findings That Need Follow-Up

### F-CHAT-008: other-thread push unread indicator

- The service worker posts only to visible, registered-ready clients and falls
  back after a response timeout (`frontend/public/sw.js:1475-1547`). The system
  badge can therefore update while React misses the push.
- Stale-marker recovery still passes only the selected thread
  (`useChatPushStaleMarkerRefresh.ts:42-60`), and a current frontend test
  deliberately keeps markers for unopened threads
  (`ChatPage.unread-indicators.test.tsx:353-381`).
- Counterevidence added since the production observation: every visible online
  tab refreshes the whole thread/unread projection after focus, online,
  visibility or 30 seconds
  (`useChatForegroundUnreadRefresh.ts:37-113`). That path should repair menu
  counts without opening/clearing the non-selected thread.
- Static evidence therefore proves a stale window, not the claimed
  reopen-only duration. Reproduce installed and normal-tab schedules, including
  waiting 30 seconds, before changing runtime. The original no-open/no-clear
  acceptance boundary remains essential.

### F-CHAT-UI-003: native audio at narrow widths

- The frozen component still applies `min-w-[220px]` to the native audio
  element (`AttachmentCard.tsx:20-26`), while incoming small-screen bubbles use
  `max-w-[calc(86%_-_2.5rem)]` and contain additional padding
  (`MessageBubble.tsx:390-404`).
- Static geometry supports the hypothesis, but native controls and minimum
  intrinsic width differ across browsers. The Low severity and device-focused
  acceptance remain appropriate.
- Validate at representative narrow widths on iOS Safari/PWA, Android Chrome
  and desktop before selecting a compact/native layout change.

### F-IOS-001: focused textarea can pan the visual viewport

- `useAppViewportLock()` still follows `visualViewport.offsetTop` and listens
  to viewport scroll/resize (`useAppViewportLock.ts:35-93`). Keyboard detection
  observes viewport height but does not intercept textarea touch movement
  (`useVisualViewportKeyboardOpen.ts:11-64`).
- History confirms the broad offset freeze (`ac8cab0`) was reverted in
  `9f0ac58` after the empty-screen regression. The finding correctly prohibits
  repeating that mitigation.
- No static/browser emulation can prove native iPhone gesture chaining. Keep
  `needs_follow_up` and use the narrow real-device acceptance matrix already
  recorded in the finding.

### F-OPS-002: shared-SaaS domain ingress readiness

- The finding predates `scripts/configure-tenant-domain-ingress.sh`. The helper
  now validates a concrete custom domain's DNS, renders Host-preserving Nginx,
  obtains/checks a matching certificate and verifies `/api/tenant`; ops tests
  exercise its idempotence. That portion of the original gap is mitigated.
- Stable operations docs still state that provider DNS automation,
  provider-subdomain wildcard ingress/certificate provisioning and production
  rehearsal are missing before broad shared SaaS
  (`mt-10-deployment-runbooks.md:30-56`).
- `mt-10a-tenant-lifecycle-rehearsal.md:1-17,385-397` explicitly leaves the
  finding open until public production DNS/TLS/proxy/Host and lifecycle results
  are recorded. A local equivalent is not sufficient.
- Stage 07 adds a concrete prerequisite: `OPS-004` proves production compose
  does not pass the Platform token/provider suffix/service email values required
  by the runbook's backend-container commands. Fix and test that contract before
  attempting the rehearsal.
- High severity applies to a broad shared-SaaS rollout, not the documented
  dedicated one-tenant mode. Keep the file active until the chosen domain mode
  and full acceptance are actually proved.

### F-OPS-003: operator UI or audited wrapper

- Current operations docs intentionally support CLI-only tenant lifecycle and
  say self-service/provider DNS automation are not ready
  (`mt-10-deployment-runbooks.md:14-56`). Architecture permits early platform
  operations to remain CLI-based.
- No evidence shows that non-engineering operators or a tenant scale requiring
  a UI have been approved. Therefore absence of a UI is not a present runtime
  defect.
- The unresolved decision is still material before handing routine operations
  to others: who may run commands, how shell access/confirmations/output are
  controlled and whether an audited backend wrapper is required.
- Keep `needs_follow_up`; acceptance should first record the operating-model
  choice. Only build UI/wrapper scope if that choice requires it, preserving
  backend-only Platform/Chatwoot authority and bounded audit cardinality.

### F-PWA-003: closed-app Android outbox delivery

- The file's static suspected failure mode is stale. Commit `a18dd83` added
  `keepTextOutboxBackgroundSyncPendingIfRetryableWorkExists()`; the worker now
  rejects the sync promise whenever future-due queued or leased sending work
  remains (`frontend/public/sw.js:437-442,751-773`).
- Tests cover a future queued retry, active lease, a retry becoming due during
  another send and a timed-out retryable request
  (`serviceWorkerBackgroundSync.test.ts:339-452,537-593`). This closes the
  previously missing worker signal, not the platform outcome.
- The Web platform controls when/if another Background Sync attempt occurs.
  The repository still has no retained installed-Android close/lock/network
  restore evidence showing delivery without reopening the app.
- Exactly-once backend idempotency and next-open foreground drain reduce impact,
  so the current severity is Medium rather than the file's pre-mitigation High.
- Keep the registry entry as `needs_follow_up`, but refresh its evidence/status
  in a later findings-governance scope to cite `a18dd83` and narrow acceptance to
  installed-device scheduling plus exactly-once fallback.

## Superseded Finding And Preservation Audit

### F-E2E-001: registration fixture env is no longer the live blocker

- The finding was added by `c5df7b2` together with Playwright flows for
  `/auth/register*` and a real Chatwoot contact fixture.
- Commit `2438c0e` then unified customer access. Current route paths expose
  `/auth/login`, `/auth/login/verify` and `/auth/login/legal`, with no
  registration route (`frontend/src/app/routePaths.ts:16-25`;
  `frontend/src/app/AppRoutes.tsx:129-187`).
- Backend tests explicitly require legacy `/api/auth/register/*` endpoints to
  be absent (`backend/src/app.test.ts:545-560`), and the work log records that
  separate registration was replaced.
- The old Playwright file still navigates to `/auth/register` and still requires
  `E2E_CHATWOOT_*`. Supplying those variables would not make the test exercise
  the current product flow. `BASE-001` is the replacement candidate for the
  stale browser safety net.
- Disposition: `superseded`, not `rejected`. The missing-env event was true for
  the old contract; its proposed fix and acceptance are no longer valid.

Preservation audit completed before recommending later cleanup:

- control branch/worktree was clean at the audit checkpoint;
- `git log --all -- docs/findings/F-E2E-001-chatwoot-registration-fixture-env.md`
  resolves to `c5df7b2`;
- branches containing it include `main`, the historical passwordless
  registration/code-login branches and the audit branches;
- reference search found the execution plan plus Stage 00/ledger replacement,
  with no current product-code dependency on the finding file;
- no file was removed here. After `BASE-001` rewrites the Playwright suite for
  current email-code access, a dedicated docs/findings cleanup may delete
  `F-E2E-001` and name `BASE-001`/the rewritten suite as replacement.

Additional preservation checks were run for the partially stale active files:

- `F-PWA-003` history retains its original `3e251ce` report; later code commit
  `a18dd83` did not update the finding, and Stages 05/08 retain the narrowed
  replacement evidence;
- `F-OPS-002` history retains `9b64e60` and the later rehearsal reference;
  custom-domain automation commits `b8b3ebe`/`1accb84` mitigate only part of
  the active provider/wildcard/rehearsal scope.

## Acceptance And Registry Actions

No active finding should be deleted based only on this discovery stage.

1. Keep the three validated files active until their implementations and
   acceptance checks close them through the Findings Workflow.
2. Preserve the six `needs_follow_up` files; do not convert device/external or
   product-decision uncertainty into a pass.
3. Let `BASE-001` own the current browser-suite repair; remove `F-E2E-001` only
   in a later dedicated cleanup after that replacement is implemented and
   verified.
4. When next editing `F-CHAT-008`, normalize its `fix_short` field.
5. When next editing `F-PWA-003`, replace the obsolete static hypothesis with
   the `a18dd83` mitigation and current Android-only acceptance gap.
6. Keep `F-OPS-002` sequenced after `OPS-004`; the production rehearsal cannot
   follow the checked-in container wrapper until required env reaches it.

## Verification And Limitations

- Registry enumeration: 10 finding files, all read completely
- Required-field semantic check: 9 canonical; `F-CHAT-008` has one named-field
  inconsistency with equivalent narrative content
- Literal history/reference preservation checks: completed for `F-E2E-001`,
  `F-PWA-003` and `F-OPS-002`
- Current source locations: checked for every finding
- Dynamic evidence reused from Stages 00, 05, 06 and 07; Task 10 intentionally
  did not duplicate the full Task 11 runtime suite
- Production VM state, provider DNS/TLS, real iPhone gesture behavior, installed
  Android Background Sync and the observed other-thread push schedule remain
  outside this static revalidation

Task 11 must run the fresh frozen-code dynamic gate and use its evidence to
validate or reject the remaining executable candidates without changing product
source.
