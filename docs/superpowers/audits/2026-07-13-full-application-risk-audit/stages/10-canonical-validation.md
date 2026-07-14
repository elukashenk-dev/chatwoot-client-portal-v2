# Stage 10: Canonical Validation And Finding Registration

Status: complete
Frozen commit: `a61b4975ae7b59e244c0b5bbc4efd02466aa075c`

## Canonical Outcome

- Ledger rows: 71.
- Final statuses: 58 `validated`, 11 `needs_follow_up`, 2 `rejected`.
- Remaining `candidate` or `validating` rows: 0.
- Validated rows map to 56 unique project findings: 53 newly registered files plus 3 previously existing validated findings.
- Two architecture rows are exact duplicates of registered canonical security findings and do not create extra files.
- No Critical or High finding survived canonical validation. The only High hypothesis, `ARCH-008`, was independently downgraded and rejected as an aggregate duplicate.

Every detailed source location, failure path, countercontrol, confidence and acceptance action remains in `candidate-ledger.md`. The table below records the Task 12 resolution of the 37 previously open candidates plus the new baseline follow-up discovered during finding-worktree verification.

| Candidate   | Status          | Risk            | Canonical mapping                                              | Canonical rationale                                                                                                      |
| ----------- | --------------- | --------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `BASE-001`  | validated       | Medium          | `docs/findings/F-E2E-002-customer-browser-auth-suite-stale.md` | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `BASE-002`  | validated       | Low             | `docs/findings/F-DOC-001-source-of-truth-alignment.md`         | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `BASE-003`  | validated       | Medium          | `docs/findings/F-CI-001-critical-playwright-gate.md`           | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `DYN-001`   | validated       | Low             | `docs/findings/F-E2E-003-admin-branding-legal-fixture.md`      | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `ARCH-002`  | validated       | Medium          | `docs/findings/F-CHAT-009-group-message-key-scope.md`          | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `ARCH-004`  | validated       | Medium          | `docs/findings/F-AUTH-002-admin-email-enumeration.md`          | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `ARCH-005`  | validated       | Medium          | `docs/findings/F-LOAD-001-admin-session-touch-writes.md`       | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `ARCH-006`  | validated       | Medium          | `docs/findings/F-DATA-001-admin-auth-retention.md`             | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `ARCH-007`  | validated       | Low             | `docs/findings/F-AUTH-003-cookie-name-collision.md`            | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `BACK-001`  | validated       | Medium          | `docs/findings/F-LEGAL-001-acceptance-version-binding.md`      | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `BACK-002`  | validated       | Medium          | `docs/findings/F-AUTH-004-reset-delivery-generation-race.md`   | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `BACK-003`  | validated       | Medium          | `docs/findings/F-AUTH-005-admin-challenge-sending-lease.md`    | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `BACK-004`  | validated       | Medium          | `docs/findings/F-DB-001-drizzle-snapshot-lineage.md`           | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `BACK-005`  | validated       | Medium          | `docs/findings/F-LOAD-002-thread-bootstrap-transaction-io.md`  | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `BACK-006`  | validated       | Medium          | `docs/findings/F-CHAT-010-source-id-recovery-window.md`        | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `BACK-007`  | validated       | Medium          | `docs/findings/F-CHAT-011-send-lease-external-effect.md`       | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `BACK-008`  | validated       | Low             | `docs/findings/F-API-001-parser-error-status-mapping.md`       | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `INT-001`   | validated       | Medium          | `docs/findings/F-INT-001-chatwoot-webhook-reconciliation.md`   | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `INT-002`   | validated       | Medium          | `docs/findings/F-TG-001-telegram-effect-replay.md`             | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `INT-003`   | validated       | Medium          | `docs/findings/F-TG-002-telegram-webhook-cutover.md`           | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `INT-004`   | validated       | Medium          | `docs/findings/F-PROV-001-provisioning-single-owner.md`        | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `FRONT-001` | validated       | Medium          | `docs/findings/F-AUTH-006-frontend-session-expiry.md`          | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `FRONT-002` | validated       | Medium          | `docs/findings/F-PWA-004-offline-retention-bounds.md`          | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `FRONT-003` | validated       | Low             | `docs/findings/F-PWA-005-private-avatar-cache-purge.md`        | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `LOAD-001`  | validated       | Medium          | `docs/findings/F-LOAD-003-multi-instance-realtime.md`          | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `LOAD-002`  | validated       | Medium          | `docs/findings/F-LOAD-004-thread-refresh-amplification.md`     | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `LOAD-003`  | validated       | Medium          | `docs/findings/F-LOAD-005-support-polling-amplification.md`    | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `LOAD-004`  | validated       | Medium          | `docs/findings/F-LOAD-006-presence-throttle-state.md`          | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `LOAD-005`  | validated       | Medium          | `docs/findings/F-LOAD-007-maintenance-work-budget.md`          | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `OPS-004`   | validated       | Medium          | `docs/findings/F-OPS-004-production-env-propagation.md`        | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `OPS-005`   | validated       | Medium          | `docs/findings/F-OPS-005-deploy-authority-completion.md`       | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `OPS-006`   | validated       | Medium          | `docs/findings/F-OPS-006-ssh-host-authentication.md`           | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `OPS-007`   | validated       | Medium          | `docs/findings/F-SUPPLY-001-production-advisory-gate.md`       | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `OPS-008`   | validated       | Medium          | `docs/findings/F-SUPPLY-002-immutable-build-inputs.md`         | Distinct proof tuple and remediation; source, counterevidence and acceptance are preserved in the registered finding.    |
| `ARCH-001`  | validated       | Medium          | `docs/findings/F-SEC-006-sse-session-lifecycle.md`             | Exact duplicate of canonical `SEC-STD-A09-001`; no second project finding.                                               |
| `ARCH-003`  | validated       | Medium          | `docs/findings/F-SEC-003-admin-role-recheck.md`                | Exact duplicate of canonical `SEC-STD-A04-002`; no second project finding.                                               |
| `ARCH-008`  | rejected        | High hypothesis | `F-SEC-012`, `F-SEC-013`, `F-SEC-014`                          | Fresh independent review downgraded the components and rejected the aggregate as three already-canonical proof tuples.   |
| `DYN-002`   | needs_follow_up | Low             | No registry file                                               | One full-suite failure followed by four isolated passes cannot distinguish a flaky assertion from a brief UI-state race. |

## Existing And Security Finding Reconciliation

- All 19 completed Codex Security Standard findings were imported into self-contained `F-SEC-001` through `F-SEC-019` registry files. Each wrapper records the canonical `SEC-STD-*` ID, generated writeup path, exact source/failure path, counterevidence, confidence and closure contract.
- `ARCH-001` is subsumed by `SEC-STD-A09-001` / `F-SEC-006`; `ARCH-003` is subsumed by `SEC-STD-A04-002` / `F-SEC-003`.
- `ARCH-008` combined pre-dedupe unread work, synchronous realtime fanout and unqueued push fanout. Those are already separate `SEC-STD-A13-001`, `A13-003` and `A13-004` remediations. Registering a fourth aggregate would violate one-finding/one-risk and remediation-subsumption rules.
- Existing validated `F-AUTH-001`, `F-CHAT-005` and `F-OPS-001` were retained. Six existing follow-up findings were retained. Superseded `F-E2E-001` was not deleted in this task; its preservation/removal rationale remains in Stage 08 and replacement `F-E2E-002` is now registered.

## Follow-Up And Rejection Reasons

| Candidate      | Status          | Severity hypothesis | Written reason / blocker                                                                                                                                            |
| -------------- | --------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DYN-002`      | needs_follow_up | Low                 | Needs follow-up; exact blocker is the non-reproducible full-suite schedule and it does not block the final product verdict unless message-state loss is established |
| `ARCH-008`     | rejected        | High                | Independent review downgraded and rejected this aggregate as duplicate of registered F-SEC-012, F-SEC-013 and F-SEC-014 proof tuples                                |
| `ARCH-009`     | needs_follow_up | Medium              | Pending contract and operations validation                                                                                                                          |
| `ARCH-010`     | rejected        | Low                 | Rejected: no supported cross-tenant or attacker-controlled routing path established                                                                                 |
| `SEC-DEEP-001` | needs_follow_up | High                | No canonical Deep report; blocks final `GO` pending closure                                                                                                         |
| `INT-005`      | needs_follow_up | Low                 | Pending measured load validation                                                                                                                                    |
| `FRONT-005`    | needs_follow_up | Medium              | Existing open `docs/findings/F-CHAT-008-unread-indicators-missing-for-other-thread-push.md`                                                                         |
| `FRONT-006`    | needs_follow_up | Medium              | Existing deferred `docs/findings/F-PWA-003-background-sync-closed-app-outbox-may-stall.md`                                                                          |
| `FRONT-007`    | needs_follow_up | Medium              | Existing deferred `docs/findings/F-IOS-001-keyboard-textarea-viewport-pan.md`                                                                                       |
| `FRONT-008`    | needs_follow_up | Low                 | Existing deferred `docs/findings/F-CHAT-UI-003-audio-attachment-narrow-width.md`                                                                                    |
| `OPS-009`      | needs_follow_up | High                | Pending external backup evidence and restore rehearsal                                                                                                              |
| `F-OPS-002`    | needs_follow_up | High                | Existing finding retained; pending production/domain evidence                                                                                                       |
| `F-OPS-003`    | needs_follow_up | Medium              | Existing conditional finding retained; pending product/operations decision                                                                                          |

`needs_follow_up` is used only where exact deployment, device, external-service or scheduler evidence is unavailable. `SEC-DEEP-001` remains the only unresolved audit proof gap that blocks an unconditional final `GO`; Task 13 must reflect that limitation.

## Finding Branch And Commit Receipts

Current `main` stayed at `a61b4975ae7b59e244c0b5bbc4efd02466aa075c` throughout registration. A reusable sibling worktree followed the repository's existing worktree convention. Every branch was created from that `main`, added exactly one finding file, passed Prettier and `git diff --check`, staged exactly its literal path, and committed before a single-commit cherry-pick into the audit control branch.

| Finding        | Candidate         | Branch                                 | Source commit                              | Integrated commit                          | Path                                                              |
| -------------- | ----------------- | -------------------------------------- | ------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------- |
| `F-SEC-001`    | `SEC-STD-A03-001` | `fix/security-sec-std-a03-001`         | `400b4b75a6894c6449428b1db51949945cda7b85` | `3bdbb4d83e936722d99a116b580eb23e4df1331d` | `docs/findings/F-SEC-001-login-normalized-email-index.md`         |
| `F-SEC-002`    | `SEC-STD-A04-001` | `fix/security-sec-std-a04-001`         | `2bf584653852315f30c980bc1d061b3a102f2ba7` | `4820a7d1ee6b2641a504b1c135f6802937033ee6` | `docs/findings/F-SEC-002-admin-code-attempt-rollback.md`          |
| `F-SEC-003`    | `SEC-STD-A04-002` | `fix/security-sec-std-a04-002`         | `37fad9a19c8ad84a0f7140a42b41929ba038c4cb` | `6489c268f37761a81e654751bd28e8eb2c7d49a3` | `docs/findings/F-SEC-003-admin-role-recheck.md`                   |
| `F-SEC-004`    | `SEC-STD-A05-001` | `fix/security-sec-std-a05-001`         | `b6f4b8f3841957adf71ae89ab0f1dd0e6d9cda3b` | `7b97b422240e39782605a301ef36ddb08865786d` | `docs/findings/F-SEC-004-passwordless-resend-cooldown.md`         |
| `F-SEC-005`    | `SEC-STD-A07-001` | `fix/security-sec-std-a07-001`         | `54cf10ec81adfc1412db95aaaeb0ff027fdec14b` | `73bc62e2d44d380aa9b1c00117d6091783acfecb` | `docs/findings/F-SEC-005-password-reset-generation-fence.md`      |
| `F-SEC-006`    | `SEC-STD-A09-001` | `fix/security-sec-std-a09-001`         | `47792ce3406e69e95719ffa16137f286ff3caed9` | `78f9b953ce212677f51d71d3e66317f840766b52` | `docs/findings/F-SEC-006-sse-session-lifecycle.md`                |
| `F-SEC-007`    | `SEC-STD-A09-003` | `fix/security-sec-std-a09-003`         | `c57e7466a27dcf8b5aae05299f5ec627be74de43` | `ece780c1f622fc49878f8b5b6cb1e09850c37d9a` | `docs/findings/F-SEC-007-group-info-call-amplification.md`        |
| `F-SEC-008`    | `SEC-STD-A10-003` | `fix/security-sec-std-a10-003`         | `d0928c845c5a3fac5921014f0421bd9dcef3f5d9` | `226fc64ca3f707aae9fea721fc9dcccfd0ea4487` | `docs/findings/F-SEC-008-push-session-lifecycle.md`               |
| `F-SEC-009`    | `SEC-STD-A10-004` | `fix/security-sec-std-a10-004`         | `73247839debdb6fb32963900de8fe72661f79bb3` | `e37f472db1424fa4b5579e9103fe9a6e3d4924f5` | `docs/findings/F-SEC-009-push-subscription-cardinality.md`        |
| `F-SEC-010`    | `SEC-STD-A11-001` | `fix/security-sec-std-a11-001`         | `be1b3a2b499340a33aea8c400c361b64b627d609` | `01cf6300eb2c0c8eaec14d999025d42248057e15` | `docs/findings/F-SEC-010-attachment-prebuffer-limit.md`           |
| `F-SEC-011`    | `SEC-STD-A11-002` | `fix/security-sec-std-a11-002`         | `b157e9b16184c9dddd7c8b4c0fa997f16d531d07` | `766d7c7317a242fcfcca67e7b77e2b57d22bf03c` | `docs/findings/F-SEC-011-rate-limit-key-cardinality.md`           |
| `F-SEC-012`    | `SEC-STD-A13-001` | `fix/security-sec-std-a13-001`         | `f85f54ac7b8be3d2759ed65d54664df641b6126c` | `bc1bbd1a85fcfff61870dfb57b27e1524d59a65a` | `docs/findings/F-SEC-012-webhook-dedupe-before-recipient-work.md` |
| `F-SEC-013`    | `SEC-STD-A13-003` | `fix/security-sec-std-a13-003`         | `d8608baa6cd3f512b0fac0f7c126d9696718b35d` | `92e56fa31a657eaa7acd6ee2d0bdb1b4ae5ab5b7` | `docs/findings/F-SEC-013-realtime-fanout-backpressure.md`         |
| `F-SEC-014`    | `SEC-STD-A13-004` | `fix/security-sec-std-a13-004`         | `fd78e11c233f73a0bdd6fa8647d0e538ac989ff1` | `8475ca2f65ebd25741aa7fe58711496e889562af` | `docs/findings/F-SEC-014-push-fanout-backpressure.md`             |
| `F-SEC-015`    | `SEC-STD-A14-001` | `fix/security-sec-std-a14-001`         | `b73320537f4c6707e4fc3bda3f8fed0f0a37d01e` | `ce557ab74f08347eac8917570130d0c9094013e8` | `docs/findings/F-SEC-015-docx-parser-budgets.md`                  |
| `F-SEC-016`    | `SEC-STD-A14-002` | `fix/security-sec-std-a14-002`         | `c4373042133ab07b9884a1fe1fa97da79e88d042` | `44656bc32b0c8f8e79423516d714f6b939cef4d6` | `docs/findings/F-SEC-016-pdf-parser-budgets.md`                   |
| `F-SEC-017`    | `SEC-STD-A15-001` | `fix/security-sec-std-a15-001`         | `13c9802bb37ff46f81cb6ea6a08d99bb3815503e` | `446c8d7b430077c0333f45f0fb2c0f862fb7200e` | `docs/findings/F-SEC-017-branding-upload-race-cleanup.md`         |
| `F-SEC-018`    | `SEC-STD-A18-002` | `fix/security-sec-std-a18-002`         | `9fb282dd8fa89776cb578977cf0e12a0fc673b47` | `f8a8df3345b1ce9a3fc0aee6feed486218cc912f` | `docs/findings/F-SEC-018-chatwoot-redirect-ssrf.md`               |
| `F-SEC-019`    | `SEC-STD-A22-004` | `fix/security-sec-std-a22-004`         | `e99038b67d2e4b03cf4b608476b23609083cfc83` | `9b72ee54a1275e87a590030a6004dbf387568af6` | `docs/findings/F-SEC-019-secret-file-permissions.md`              |
| `F-E2E-002`    | `BASE-001`        | `fix/e2e-customer-auth-suite-stale`    | `4c4b810ad41ec7a6a7a0e00be4f923f06735a67e` | `b6f9fcc3d268d565fdaa0a7c26ff36fa5ee17689` | `docs/findings/F-E2E-002-customer-browser-auth-suite-stale.md`    |
| `F-DOC-001`    | `BASE-002`        | `fix/docs-source-of-truth-alignment`   | `ec3718c85d5f7e54aa591274f19362e41f010776` | `3041f3bc1453c1e6e19b33b0d727cf9a37b68533` | `docs/findings/F-DOC-001-source-of-truth-alignment.md`            |
| `F-CI-001`     | `BASE-003`        | `fix/ci-critical-playwright-gate`      | `79b51cca4b08d15c347fa0deb97c1a31256fcfb3` | `c000858f3c51fefccbcb97e8a971e8ab2cf71056` | `docs/findings/F-CI-001-critical-playwright-gate.md`              |
| `F-E2E-003`    | `DYN-001`         | `fix/e2e-admin-branding-legal-fixture` | `0cee7469110bc2ea1e92b25f44aa878cf2026b5e` | `94489779941f1fdcb281a296ab67987e103cd39a` | `docs/findings/F-E2E-003-admin-branding-legal-fixture.md`         |
| `F-CHAT-009`   | `ARCH-002`        | `fix/group-message-key-scope`          | `6498cade5cf9f4ffe75058669212efa54c50d955` | `b72d5cb6a35d131565a75c56f9dd65d26bfc1407` | `docs/findings/F-CHAT-009-group-message-key-scope.md`             |
| `F-AUTH-002`   | `ARCH-004`        | `fix/admin-email-enumeration`          | `3b97b6109e88a6f639875a8bea0eef1ff478b717` | `1207b56cb65f1e3682616b355b9e4657b9740bdb` | `docs/findings/F-AUTH-002-admin-email-enumeration.md`             |
| `F-LOAD-001`   | `ARCH-005`        | `fix/admin-session-touch-writes`       | `2c19a2f0b9081b796e94b9691c9cc28c03355e9e` | `b9f539e217c41580627fe46483efe3fe2d4e3487` | `docs/findings/F-LOAD-001-admin-session-touch-writes.md`          |
| `F-DATA-001`   | `ARCH-006`        | `fix/admin-auth-retention`             | `441593dc9cba629f54b5ea2f87c7b0f4c2243127` | `e52475264aaca7db45725d6318a598e9e0770c46` | `docs/findings/F-DATA-001-admin-auth-retention.md`                |
| `F-AUTH-003`   | `ARCH-007`        | `fix/cookie-name-collision`            | `2e2085031adbbc2586977f13443589448072d247` | `a6b38c7c39a2b4aac7dacdd10b4db365c34b9563` | `docs/findings/F-AUTH-003-cookie-name-collision.md`               |
| `F-LEGAL-001`  | `BACK-001`        | `fix/acceptance-version-binding`       | `4ccba88e0569b0703d082018de52c243d6700c9c` | `63714ee2c730c59ae0ecd444544434181c34dadc` | `docs/findings/F-LEGAL-001-acceptance-version-binding.md`         |
| `F-AUTH-004`   | `BACK-002`        | `fix/reset-delivery-generation-race`   | `6c3d97ff7912a6c87da538d9eb84b79391ca206f` | `1ae86e772e4a2b100900116fb3a87e3909880ae8` | `docs/findings/F-AUTH-004-reset-delivery-generation-race.md`      |
| `F-AUTH-005`   | `BACK-003`        | `fix/admin-challenge-sending-lease`    | `8206bd130e8d8cafd53309fcbbcd7c166aa7fb37` | `67131647fe088b196c6e7ee1673fd817175a85d9` | `docs/findings/F-AUTH-005-admin-challenge-sending-lease.md`       |
| `F-DB-001`     | `BACK-004`        | `fix/drizzle-snapshot-lineage`         | `0551dad3eb60c974e8ae55af76ebb34da3fcd0a8` | `cb09e079b749198b099fa10ceb1e8a7f9bdb6db9` | `docs/findings/F-DB-001-drizzle-snapshot-lineage.md`              |
| `F-LOAD-002`   | `BACK-005`        | `fix/thread-bootstrap-transaction-io`  | `0810646bec3187c6ea9f6c4282e94b4d27f2fe7b` | `e95cdb9fe5b9513e137d2d862f5aefcedba2579b` | `docs/findings/F-LOAD-002-thread-bootstrap-transaction-io.md`     |
| `F-CHAT-010`   | `BACK-006`        | `fix/source-id-recovery-window`        | `68f22df130254f5c72c6453dfac7eb92a7f103ad` | `2645c9d32b2be3e06d83ac8a0be491b896b58b00` | `docs/findings/F-CHAT-010-source-id-recovery-window.md`           |
| `F-CHAT-011`   | `BACK-007`        | `fix/send-lease-external-effect`       | `b810b24e4e859e3063ffffb624b3e9431957ec77` | `cbbdbe0a4ea812c05e6dc58ae1ff065b42b4e7e0` | `docs/findings/F-CHAT-011-send-lease-external-effect.md`          |
| `F-API-001`    | `BACK-008`        | `fix/parser-error-status-mapping`      | `c99af6cd984bd0ac156da4eaf462687dce3df26c` | `04ef9254ce9039a93ea23f6d15ffa7fe5776311d` | `docs/findings/F-API-001-parser-error-status-mapping.md`          |
| `F-INT-001`    | `INT-001`         | `fix/chatwoot-webhook-reconciliation`  | `c0d115d5df7a3f129410f411e87f03ba07baf7bd` | `b82dcdcb1ddce981b0d50b243a37e9ad2e721bfd` | `docs/findings/F-INT-001-chatwoot-webhook-reconciliation.md`      |
| `F-TG-001`     | `INT-002`         | `fix/telegram-effect-replay`           | `840c551c77da60ca258455af5baaaefc0a9e0f52` | `16ff43799e6d260dd09daa86917acb36090e9c66` | `docs/findings/F-TG-001-telegram-effect-replay.md`                |
| `F-TG-002`     | `INT-003`         | `fix/telegram-webhook-cutover`         | `804136e7a2c083e83dfc1d34edd506dff9d20bd0` | `6a7be953886401a2ed19e98c5ecb1cef9718c236` | `docs/findings/F-TG-002-telegram-webhook-cutover.md`              |
| `F-PROV-001`   | `INT-004`         | `fix/provisioning-single-owner`        | `4b268fa47ca5a75d3136d145500b6c86adef1d8d` | `c98ee4d4e8d3a203b0f86be75cf3e04cde1d680b` | `docs/findings/F-PROV-001-provisioning-single-owner.md`           |
| `F-AUTH-006`   | `FRONT-001`       | `fix/frontend-session-expiry`          | `9a8b9420c1b82f058111742ae5192a84ef2c64d1` | `592636ec2b72bd06858b1349fea2b1f0a69d76d8` | `docs/findings/F-AUTH-006-frontend-session-expiry.md`             |
| `F-PWA-004`    | `FRONT-002`       | `fix/offline-retention-bounds`         | `7d1c83d23c82637d3b4438143d06f51b20dbc690` | `3725bf1147100299e219b6f5e7c53b0f605530b8` | `docs/findings/F-PWA-004-offline-retention-bounds.md`             |
| `F-PWA-005`    | `FRONT-003`       | `fix/private-avatar-cache-purge`       | `28d3cf318c9c544778f6aa759807dfbf38ff5b31` | `d8ba7887879ad860f48d413e575fd9115aba70b6` | `docs/findings/F-PWA-005-private-avatar-cache-purge.md`           |
| `F-LOAD-003`   | `LOAD-001`        | `fix/multi-instance-realtime`          | `2d1ddc6dc237bdf7b18761c1704da421e29f3a1c` | `76f5ca10e7410f38497945475fda17619f96e13f` | `docs/findings/F-LOAD-003-multi-instance-realtime.md`             |
| `F-LOAD-004`   | `LOAD-002`        | `fix/thread-refresh-amplification`     | `d7e5a9d3ac7ec0330fc202219b3e287aa1ac30b7` | `7d7858187c8a5ba41bd5083c4a562ae259c833e7` | `docs/findings/F-LOAD-004-thread-refresh-amplification.md`        |
| `F-LOAD-005`   | `LOAD-003`        | `fix/support-polling-amplification`    | `8cd927c25cbb946fa63708fdb0953bd76187b0a8` | `0edb2de74e49d76db35ac2724aed46017e9a9343` | `docs/findings/F-LOAD-005-support-polling-amplification.md`       |
| `F-LOAD-006`   | `LOAD-004`        | `fix/presence-throttle-state`          | `680874668a679ff7bd23f7128b07051544a49cd3` | `93a067d86ef6d0e03a90933085e7874ebd3f6915` | `docs/findings/F-LOAD-006-presence-throttle-state.md`             |
| `F-LOAD-007`   | `LOAD-005`        | `fix/maintenance-work-budget`          | `927e6385387f3dd5a891fe51f33b85bc625d5b39` | `65a226b6961f27dd136f65393ae1e13bc3394f9e` | `docs/findings/F-LOAD-007-maintenance-work-budget.md`             |
| `F-OPS-004`    | `OPS-004`         | `fix/production-env-propagation`       | `afdb3776026f4e214b28ce56c19eb52d1f854f55` | `c1ea83d31f8b6cd1f5dcb2f1268061ca1dd3b64c` | `docs/findings/F-OPS-004-production-env-propagation.md`           |
| `F-OPS-005`    | `OPS-005`         | `fix/deploy-authority-completion`      | `6f21554cacf94788005b61fd1c83e3796e454b78` | `e3e3a6a3eed7aa66832111044d6cdc3391c6ce2d` | `docs/findings/F-OPS-005-deploy-authority-completion.md`          |
| `F-OPS-006`    | `OPS-006`         | `fix/ssh-host-authentication`          | `fe3440386979fe1acafe08fc5baa5521aba05a97` | `7b21a7229cd2b402fc941fe687f4e6006ab60768` | `docs/findings/F-OPS-006-ssh-host-authentication.md`              |
| `F-SUPPLY-001` | `OPS-007`         | `fix/production-advisory-gate`         | `088be7d22406d192f7953c9c3e48656d18cfc871` | `1959e661805afb0323f5a0cb318027e3b26df57c` | `docs/findings/F-SUPPLY-001-production-advisory-gate.md`          |
| `F-SUPPLY-002` | `OPS-008`         | `fix/immutable-build-inputs`           | `5c1c5a369bb0ab8771e64da701c3f68559ad7acd` | `4b04969772c3679ecc90ecfc53f7df32f3897477` | `docs/findings/F-SUPPLY-002-immutable-build-inputs.md`            |

Receipt readback proved all 53 source commits have parent `main`, each changes exactly its recorded path, all integrated paths are unique, and every file contains `status`, `found_in`, `risk`, `urgency`, `area`, `evidence`, `fix_short` and `acceptance`. No product file was included.

## Verification And Baseline Qualification

- Stage 09 already passed fresh lint, build, 842 backend tests, 732 frontend tests and production ops checks on the exact product tree.
- The registration worktree installed from the frozen lockfile. Its full suite produced 731/732 frontend passes and one optimistic-outbox timing failure; the exact test then passed four consecutive isolated reruns. This is recorded as `DYN-002 needs_follow_up`, not hidden as a pass or promoted without proof to a product defect.
- No Critical/High registry file required a new independent reviewer: the Standard scan contains only Medium/Low findings, and independent review rejected the sole later High aggregate.
- `main` did not advance, so no current-main revalidation branch was required.
- No existing finding was deleted or modified. Product source remained identical to the frozen commit.
