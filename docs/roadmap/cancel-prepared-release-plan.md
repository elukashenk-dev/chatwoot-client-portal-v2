# Safe cancellation of an unactivated preparation

Approved scope (2026-11-16): cancel the obsolete two-tenant preparation so the
profile release can be prepared with only active `provgroup`. `pronalogi` has
already been archived by explicit user approval. Production activation remains
separately approved after the new preparation. The implementation branch is
`fix/ops-cancel-prepared`, based on `48d2260`.

## Contract

- Add `cancel-prepared` to the existing staged orchestrator. Require exact full
  candidate SHA, original prepared manifest SHA256 and non-secret approval ref.
  Keep clean `main`/origin and strict SSH requirements.
- Under the existing deploy lock, reject an activation transaction, a decision
  or outcome for this candidate, current/previous/adoption candidate references,
  changed source/archive/override/matrix evidence, or changed current runtime.
- Publish a durable cancellation intent and full tree inventory before any
  retirement. Move the entire candidate directory atomically into private
  `.release-state/cancellations/<manifest-sha256>/release`, fsync both parents,
  and verify the archived tree. No tenant data, env, volumes or containers move.
- Remove only the exact two candidate tag names after checking their IDs. A
  shared content-addressed image with the current release is valid; never remove
  by image ID, force removal, prune, or touch current/previous tags.
- Retire the prepared pointer only after archival and tag retirement. Complete
  the audit durably. Any interruption blocks ordinary prepare/activate until
  exact SHA + manifest + approval resume completes. Historical completed audits
  do not prevent a fresh preparation/activation of the same code SHA; replay of
  the old cancellation cannot retire a later preparation of that SHA.
- Never rewrite expiry, immutable manifest, tenant matrix, activation outcomes,
  migration policy or rollback evidence. The cancelled archive is audit evidence,
  not a rollback/activation source. It is immutable by protocol, not tamper-proof
  against the deployment owner.

## Load and limits

Operator-only work: one deploy lock, bounded source inventory (10,000 entries,
512 MiB per cancellation), at most 20 retained cancellations, two tag operations,
no DB writes/external API calls/background polling. Audit validation scans these
bounded local files; request/message paths are unchanged. A full audit directory
fails closed and requires a separately approved retention operation. Intent
publication currently requires the temporary directory and state on the same
filesystem; archive rename always verifies filesystem identity.

## Verification and handoff

- RED/GREEN cancellation integration: changed active matrix, archival, unchanged
  runtime, same-SHA reprepare, rejection of stale approval replay.
- Fault/resume at intent, rename, each tag, pointer retirement and completion;
  pending state blocks both prepare and activate. Corrupt audit/source/matrix,
  wrong SHA/checksum/ref, active candidate, activation evidence, missing/conflicting
  tags and shared candidate/current image IDs fail or resume as specified.
- Independent whole-diff review and re-review for Critical/Important findings.
- Full operations gate on final scripts, real Compose render, docs contracts,
  lint/build/diff checks. Previously green application suites are not repeated:
  backend/frontend source and contracts remain unchanged.
- Present the finished change and exact cancellation inputs for git publication
  and production cancellation approval; then execute already authorized prepare.
  Only after successful fresh preparation ask for exact-SHA activation approval.

All portal Docker tag writers must hold the same deployment lock. Docker has no
atomic compare-and-delete operation for a tag. Cancellation checks exact IDs
immediately before untagging and rechecks retained tags and live containers
after each removal; an out-of-protocol deployment-user/root tag writer is not
covered by this exclusive operator contract. Each tag retirement has a durable
journal-bound intent before the Docker call, so a lost acknowledgement is
resumable without accepting unexplained tag disappearance.

## Implementation progress and production inputs

Implementation and independent full-diff review are complete. F-OPS-011 was
accepted and fixed with exact initial tags and durable per-tag retirement
intent; re-review found no remaining Critical/Important findings. Filesystem
fault checks and the final operations gate passed on the frozen final scripts.
No cancellation or additional production change has been executed.

Read-only Timeweb verification for the proposed cancellation:

- candidate: `48d226064f991616519a8f7a6108e9443b435f11`;
- prepared manifest SHA256:
  `ca2592546cf3da260d61049ee1458fb13de2fc33227a50a95a433dcae4572f28`;
- current: `4cf719e41b07a009214ea51504265c10648dafda`;
- approval reference proposed: `profile-release-cancel-pronalogi-20261116`;
- archive location:
  `/opt/chatwoot-client-portal-v2/.release-state/cancellations/ca2592546cf3da260d61049ee1458fb13de2fc33227a50a95a433dcae4572f28/`;
- `/tmp`, release state and release directories share device 2049; state/release
  directories are private (0700), owned by `lancora`;
- backend/web image IDs and StartedAt still match the original production
  baseline. `pronalogi` remains archived; `provgroup` is the remaining active tenant.

After code publication and exact cancellation approval, cancel the old
preparation using the new clean-main orchestrator, then run ordinary prepare of
the new final main SHA. Keep activation as its separately approved last step.

Reviewed cancellation command (run only after its exact approval and publication
of this slice to clean `main`):

```bash
scripts/deploy-production-staged.sh cancel-prepared \
  --host=lancora@5.129.253.99 --ssh-port=22 \
  --identity-file=/home/evluk/.ssh/id_ed25519 \
  --known-hosts-file=/home/evluk/.ssh/known_hosts \
  --app-path=/opt/chatwoot-client-portal-v2 \
  --commit=48d226064f991616519a8f7a6108e9443b435f11 \
  --manifest-sha256=ca2592546cf3da260d61049ee1458fb13de2fc33227a50a95a433dcae4572f28 \
  --approval-ref=profile-release-cancel-pronalogi-20261116
```

## Closure evidence

All 111 staged scenarios and 13 cancellation filesystem fault checks passed on
the final implementation. Environment upgrade, release records, deployment and
documentation contracts, real Docker Compose rendering, Node 24.22.1 lint/build,
formatting and whitespace checks passed. Application test suites were not rerun:
application inputs are unchanged from the previously verified profile release.
Frozen scripts match the working tree; full results are recorded locally in
`/tmp/portal-cancel-final-results.json` and
`/tmp/portal-cancel-final-selection.json`.

Independent implementation review and full-diff re-review are complete with no
Critical/Important findings. Reviewer permissions were unrestricted; review was
voluntarily read-only. F-OPS-011 is closed after its exact-tag/progress-intent fix,
fault checks and re-review. The resolved temporary finding file is removed;
this plan and the canonical deployment runbook retain its requirements. Git
publication, production cancellation and fresh preparation are the next handoff;
production activation still awaits approval of that fresh preparation.
