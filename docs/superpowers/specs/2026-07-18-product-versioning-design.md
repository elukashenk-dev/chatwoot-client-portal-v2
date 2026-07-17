# Product Version Display Design

## Status

Approved direction, rewritten on 2026-07-18 after the previous broad release
management scope was explicitly cancelled. The broad prior scope is
superseded. The current narrowed two-task plan lives at
`docs/superpowers/plans/2026-07-18-product-versioning.md`; Tasks 1 and 2 are
implemented, so this design and plan are complete.

## Goal

Show an authenticated user this informational line on the existing profile
page:

```text
версия: 0.1.0
```

## Design

The root `package.json` receives one product version, initially `0.1.0`.
Before a future production release, an operator manually changes that one
value according to SemVer, for example `1.0.0`, `1.0.1`, `1.1.0`, or `2.0.0`.
Before proposing that manual change, the agent analyses the release changes and
recommends patch, minor, or major. The operator must explicitly confirm the
recommendation before the agent changes the root version and performs the
separately approved release process.

The frontend build reads the root package version once through existing Vite
build configuration and embeds it as a static value. The existing profile page
renders that value in its current read-only details list with label `версия:`.
It does not fetch a version from the backend.

This means the visible version is the version of the frontend code currently
running in the browser. A cached PWA continues to show its own bundled version
until its frontend assets update, which is correct for an informational label.

## In Scope

- root `package.json` version set to `0.1.0`;
- small Vite build-time handoff of that value to the frontend;
- one read-only profile row with exactly `версия: 0.1.0`;
- one focused frontend test for that row;
- focused lint/build/test checks, review, and one scoped commit.

## Out Of Scope

- Git tags, release commits, release manifests, release provenance, release
  markers, rollback records, and staged deployment;
- GitHub Actions or repository rulesets;
- backend API, database, migrations, authentication, profile API changes, or
  runtime requests;
- release history, release notes, admin UI, settings page, or editing the
  displayed value in the browser;
- automated SemVer release workflow or validation beyond the operator's
  manual use of SemVer.

## Validation

The focused profile-page test asserts both the exact lowercase label
`версия:` and `0.1.0`. The frontend build verifies that Vite can embed the
root package value. Existing profile tests remain the authority that no new
profile API behavior is introduced.

## Future Improvements

Only if a later, separate request needs them, product versions could be bound
to Git tags, staged-deployment evidence, rollback records, or release
provenance. None of these mechanisms belong to this scope.
