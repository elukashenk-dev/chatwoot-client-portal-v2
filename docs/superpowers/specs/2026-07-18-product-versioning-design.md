# Product Versioning And Client Visibility Design

## Status

Approved product-versioning design. Implementation requires a separate plan and
explicit user approval.

## Goal

Give each production release one human-readable product version that is:

- unambiguously bound to one immutable Git commit;
- recorded beside the existing staged deployment provenance;
- visible to a customer on the profile page as `версия: X.Y.Z`;
- useful to support during diagnosis and rollback.

The first client-facing production release is `v1.0.0`.

## Scope

- stable SemVer product versions in the root `package.json`;
- annotated Git tags bound to exact release commits;
- staged deployment provenance and release records extended with product version
  and tag;
- profile-page display of the version embedded in the frontend build;
- release and deployment validation plus regression coverage.

## Out Of Scope

- client-visible release notes or a "What is new" page;
- a version-history API, database table, or admin UI;
- pre-release labels such as `rc`, `beta`, or nightly builds;
- retroactive versioning of historical releases;
- real production deployment during implementation.

## Version Authority

The root `package.json` `version` field is the sole product-version authority.
Workspace package versions, dependency versions, protocol versions, migration
numbers and tenant asset versions are not product versions.

Only stable SemVer values matching `X.Y.Z` are valid. The user-facing form is
the same value without the tag prefix, for example `1.0.0`; its Git tag is
`v1.0.0`.

The release tag must be annotated, must resolve to the exact release commit and
must not be reused for another commit. A failed `prepare` does not permit moving
or reusing its tag: a later release receives a new version number.

`origin` must protect the `v*` tag namespace from deletion and force-updates by
normal release credentials. Deploy preflight fetches the exact tag object from
`origin` and rejects a lightweight tag or any mismatch with the requested
commit.

## Release Lifecycle

For a production release, an operator:

1. starts from a clean, current `main`;
2. updates the root product version according to SemVer;
3. completes normal review and required checks;
4. creates the dedicated commit `release: vX.Y.Z`;
5. creates annotated tag `vX.Y.Z` on that exact commit;
6. pushes both `main` and the tag to `origin`;
7. runs staged `prepare` for that exact commit;
8. receives the existing separate approval before staged `activate`.

Before source promotion, `prepare` must fail closed unless all of the following
are true:

- local and fetched `origin/main` identify the exact requested release commit;
- the root product version is valid stable SemVer;
- `v<product-version>` is an annotated tag for that same commit;
- the copied source archive retains the product version expected by the local
  provenance check.

The prepared-release manifest and activated-release record store the product
version and tag alongside the existing exact commit, archive checksum and
runtime evidence. `activate` revalidates those manifest values before cutover.
Rollback restores the previous exact source and its recorded version; the
restored frontend consequently displays that previous version after it updates.

## Client Visibility

The frontend build receives the validated root product version as a build-time
value. The authenticated customer profile page displays exactly:

```text
версия: X.Y.Z
```

It is read-only and does not link to release notes.

This value is bundled with the frontend rather than fetched from a new runtime
endpoint. It adds no backend request, database read or background polling. A
cached PWA correctly continues to show the version of the frontend code it is
currently running; after the browser or PWA updates to an activated release it
shows the new value.

## Validation And Tests

The implementation must add focused automated coverage for:

- valid and invalid stable SemVer parsing;
- absent, lightweight, origin-replaced, mismatched and already-used release
  tags;
- rejection when tag, product version, local `HEAD`, `origin/main` or copied
  source disagree;
- persistence and revalidation of version/tag in prepare, activate and rollback
  records;
- frontend display of the exact lowercase Russian label `версия: X.Y.Z` on the
  profile page;
- build failure when no valid product version can be injected.

Existing staged-deployment checks remain the authority for clean-source,
approval, migration, rollback and tenant-smoke constraints. The new checks add
only version provenance; they do not weaken those boundaries.

## Migration

There is no legacy product-version compatibility layer. Releases made before
this scope remain identifiable by their existing exact commits and release
records only. The first release produced with this design is `v1.0.0`.
