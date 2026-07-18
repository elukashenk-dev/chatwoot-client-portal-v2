# Staged Retry After Rollback Design

## Goal

Allow an operator to prepare a new exact production candidate after an
automatic rollback has already restored the active runtime. Preserve the failed
candidate's durable outcome; do not use manual server cleanup or restore the
retired deployment path.

## Scope

- Add an explicit retry acknowledgement to `prepare`.
- Accept it only for the exact candidate whose latest terminal outcome is
  `candidate_failed_rollback_succeeded`.
- Before cleanup, revalidate the current release pointer, active source marker,
  current release evidence and healthy runtime state.
- Remove only the failed candidate's prepared pointer, candidate release
  directory and candidate image tags after their exact IDs are proven.
- Keep the history outcome as the permanent record of the failed activation.
- Record safe stop classification for candidate containers without storing or
  printing arbitrary container log text.

## Explicit Non-Goals

- Do not restore or call the legacy deployment script.
- Do not automatically retry a failed candidate.
- Do not delete history, current runtime evidence, database data, volumes or
  external images.
- Do not introduce a general manual state-editing command.

## Interface

The normal `prepare` remains unchanged. A retry requires both:

```text
prepare --retry-after-rollback=<full failed candidate SHA>
```

The supplied SHA must equal the requested candidate SHA. This makes the
operator acknowledge the precise failed candidate before its retained release
artifacts are removed. Any other failure status, missing outcome, changed
runtime, expired/missing candidate or ambiguous history remains blocked.

## Safe Data Flow

1. The local wrapper validates clean `main`, exact `origin/main`, full SHA and
   the explicit retry acknowledgement.
2. The remote helper locates exactly one durable
   `candidate_failed_rollback_succeeded` outcome for that SHA.
3. It validates that the active runtime still matches the outcome's previous
   commit and the normal release-state invariants.
4. It proves candidate image tags still resolve to the manifest's exact image
   IDs, removes those tags, removes only the candidate directory and prepared
   pointer, and fsyncs the changed state directory.
5. The existing `prepare` flow then creates a fresh candidate normally.

## Failure Evidence

For a failed `compose_wait`, retain only fixed safe classifications derived
from Docker state: exit code, OOM state and one of `clean_exit`,
`nonzero_exit`, `signal_termination` or `unavailable`. No arbitrary container
log content is persisted or printed.

## Verification

- Focused staged-deploy tests cover: retry is refused without matching terminal
  outcome; retry preserves history and current runtime; retry removes only
  exact failed candidate artifacts; a fresh prepare is then accepted.
- Existing compose-wait rollback evidence tests cover the new stop
  classification.
- Run focused staged-deploy tests, shell syntax checks, lint, build and
  `git diff --check` before commit.
