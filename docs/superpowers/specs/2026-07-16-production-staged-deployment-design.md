# Production Staged Deployment Design

Date: 2026-07-16

Status: revision pending confirmation

Confirmed follow-up: replace the one-step production activation path with one
mandatory, testable staged deployment authority and add one fail-closed source
bootstrap for an explicitly approved empty-root clean reinstall. This design
does not authorize a production deployment or clean reinstall.

## Problem

The routine archive helper currently delivers source and immediately runs
`docker compose up -d --build` when `--activate` is supplied. Candidate build,
container replacement and the first runtime check therefore share one step.
The helper does not guarantee that exact rollback images exist before the
candidate build, does not wait for bounded health completion, and can report
completion after `docker compose ps` without public tenant smoke or an explicit
rollback result.

The independent GitHub Actions workflow is a second deployment authority. It
resolves a mutable ref in a reused VM checkout, can trust `ssh-keyscan` output
when a verified host-key secret is absent, and runs its own direct
`docker compose up -d --build` path.

The controlled F-CHAT-012 rollout demonstrated the safer sequence manually:
prepare exact candidate and rollback images while the current containers keep
serving traffic, then activate already-built images with `--no-build`. That
sequence must become the normal automated path without allowing release
artifacts to accumulate indefinitely.

## Goals

- Make one staged orchestrator the only supported full production activation
  authority for local operators and GitHub Actions.
- Split deployment into explicit `prepare` and `activate` commands.
- Build an exact candidate and guarantee a usable previous release before any
  container replacement.
- Activate without building or pulling mutable images during cutover.
- Wait for bounded Compose health and validate every active tenant's public
  routing before declaring success.
- Automatically restore the exact previous release when the candidate fails
  and no migration policy forbids code rollback.
- Fail closed for migration releases until a separate policy is recorded.
- Keep permanent release storage bounded to current plus one previous stable
  release, with at most one temporary prepared candidate.
- Require preverified SSH host authentication in both local and GitHub paths.
- Preserve the clean-reinstall procedure through a separately approved,
  empty-root-only bootstrap that delivers one exact clean `origin/main` commit
  but cannot start or activate the portal.
- Add a fake-runtime test harness that proves orchestration behavior without
  accessing production.

## Non-Goals

- Do not deploy or otherwise mutate production while implementing this tool.
- Do not modify Chatwoot core, Chatwoot data, portal database rows, Docker
  volumes or object-storage data.
- Do not implement database down migrations or claim that every schema change
  is rollback-safe.
- Do not build a container registry pipeline in this slice.
- Do not pin every upstream Docker base image or GitHub Action by digest in this
  slice; that remains `F-SUPPLY-002`.
- Do not add the missing production Compose environment mappings tracked by
  `F-OPS-004`.
- Do not add a dependency-advisory release gate tracked by `F-SUPPLY-001`.
- Do not run a global Docker prune or delete artifacts not owned by this portal
  release process.
- Do not expose clean-reinstall bootstrap through GitHub Actions, allow it on an
  active/non-empty application root, or use it for dirty/WIP previews.

## Chosen Architecture

Add one public operator entry point:

```text
scripts/deploy-production-staged.sh
```

Add one focused remote phase helper:

```text
scripts/production-staged-release-remote.sh
```

The public orchestrator owns local Git provenance checks, archive creation,
SHA-256 calculation, strict SSH/SCP options and phase selection. The remote
helper owns only release-state transitions, Docker Compose operations, health
checks, rollback and bounded cleanup under the approved application root.

Both helpers use explicit phase arguments and validated scalar values. They do
not evaluate manifest content as shell code and never `source` a remote release
manifest.

The existing `scripts/deploy-production-archive.sh` and its package command are
retired in the same scope. Exact archive creation and transfer move into the
staged orchestrator, including the separately guarded clean-install bootstrap,
so the old helper cannot remain a second source-delivery or activation path.
Active documentation must contain no command that invokes the retired helper.

`.github/workflows/deploy-production.yml` becomes a thin caller of the same
public orchestrator. It must not contain its own remote Git checkout, Docker
build, Compose activation or host-key discovery path.

## Operator Interface

Preparation is a non-cutover operation:

```bash
scripts/deploy-production-staged.sh prepare \
  --host=ubuntu@93.77.166.238 \
  --ssh-port=22 \
  --identity-file=<approved-private-key-file> \
  --app-path=/opt/chatwoot-client-portal-v2 \
  --commit=<full-40-character-sha> \
  --known-hosts-file=<preverified-known-hosts-file>
```

Activation is a separate production mutation:

```bash
scripts/deploy-production-staged.sh activate \
  --host=ubuntu@93.77.166.238 \
  --ssh-port=22 \
  --identity-file=<approved-private-key-file> \
  --app-path=/opt/chatwoot-client-portal-v2 \
  --commit=<same-full-40-character-sha> \
  --known-hosts-file=<preverified-known-hosts-file>
```

For a migration release, activation additionally requires both an explicit
policy and a non-secret approval reference:

```bash
--migration-policy=backward-compatible|forward-only \
--approval-ref=<reviewed-change-or-operator-approval-label>
```

`prepare` and `activate` are intentionally different commands. Successful
preparation prints the candidate SHA, current SHA, migration classification,
release expiry, exact image IDs and the activation command. It does not invoke
that command automatically.

An exceptional clean-reinstall bootstrap uses the same provenance and SSH
boundary but is a third, separately approved phase:

```bash
scripts/deploy-production-staged.sh bootstrap \
  --host=ubuntu@93.77.166.238 \
  --ssh-port=22 \
  --identity-file=<approved-private-key-file> \
  --app-path=/opt/chatwoot-client-portal-v2 \
  --commit=<full-40-character-sha> \
  --known-hosts-file=<preverified-known-hosts-file> \
  --approval-ref=<clean-reinstall-approval-label>
```

`bootstrap` only delivers exact source into a proven-empty, inactive
application root. It never creates production env values, runs Compose, starts
containers or activates a release. Routine deployments therefore remain the
two-command `prepare` then `activate` process.

All operator arguments are data, never shell fragments. The production tool
accepts only the allowlisted canonical application root
`/opt/chatwoot-client-portal-v2`, a host in validated `user@host` form, a
numeric port in `1..65535`, exact lowercase full SHAs and approval references
matching `[A-Za-z0-9._:/-]{1,128}`. It rejects control characters, option-like
host values, path traversal and symlinked application roots.

## Release Provenance

Before creating a candidate archive, the orchestrator must prove all of the
following:

- the current local branch is `main`;
- `git status --short` is empty;
- `--commit` is exactly 40 lowercase hexadecimal characters and resolves to a
  commit;
- the commit is contained in the freshly fetched `origin/main` history;
- no preview/dirty override can be combined with `prepare`, `activate` or
  `bootstrap`.

The archive is created from the immutable Git commit object, not copied from
the working tree. A working-tree change after the cleanliness check therefore
cannot enter the archive. The orchestrator records and verifies the archive's
SHA-256 before the remote helper accepts it.

Each immutable prepared-release manifest records only non-secret evidence:

- deploy protocol version;
- candidate commit and archive SHA-256;
- preparation timestamp and expiry timestamp;
- current production commit observed during preparation;
- SHA-256 of the production env file, without recording any env value;
- migration classification;
- exact image tags and Docker image IDs for backend, web and Telegram bridge;
- expected active tenant slugs and public base URLs;

Migration policy and approval are activation-time decisions, so they are
written to a separate immutable decision record before cutover. Final
prepare/activate/rollback outcomes are written to separate bounded history
records. Neither operation mutates the prepared manifest.

`.env.production`, tokens, cookie values, database credentials, customer data
and message data must never be copied into a manifest or command log.

## Empty-Root Bootstrap

`bootstrap` exists only so a separately approved clean reinstall can receive
the installer source before the staged runtime exists. It is not a deployment
shortcut and is never called by GitHub Actions.

The local orchestrator applies the same clean-`main`, exact full SHA,
fresh-`origin/main`, commit-object archive, checksum and strict SSH checks used
by `prepare`. It additionally requires a non-secret `--approval-ref`; there is
no dirty-tree, WIP, branch or mutable-ref mode.

Before accepting source, the remote bootstrap helper takes a non-blocking lock
outside the not-yet-created application root and proves all of the following:

- the application root is absent or is a genuinely empty directory;
- it contains no `.env.production`, `DEPLOY_SOURCE.txt`,
  `BOOTSTRAP_SOURCE.txt`, `.release-state`, `.releases`, install state or any
  other file or directory;
- no container exists with the portal Compose project label, whether running
  or stopped.

Existing named volumes do not by themselves make the source root active and
are neither inspected for content nor deleted. Any non-empty root or matching
container makes bootstrap fail closed; the tool never overwrites, merges with
or repairs an existing installation.

On success, bootstrap creates the application root, extracts the exact source
archive and writes a mode-0600 `BOOTSTRAP_SOURCE.txt` containing only protocol
version, application name, full `source_commit`, archive checksum, timestamp
and approval reference. It does not write `DEPLOY_SOURCE.txt`, create
`.env.production`, invoke the installer, run Compose or start a container. The
separately approved clean-install
procedure performs configuration and startup. Only after that procedure's
health checks pass may `scripts/install-production.sh` promote the bootstrap
commit to `DEPLOY_SOURCE.txt` and remove `BOOTSTRAP_SOURCE.txt`.
When a bootstrap marker exists, the installer must reject
`--skip-public-health`; both the public health and tenant-resolution checks and
the remaining install steps must complete before marker promotion.

If bootstrap fails after creating a previously absent root, its error trap may
remove only the partial root it created after proving no pre-existing content
or portal container appeared. If safe cleanup cannot be proved, it preserves
the partial evidence and exits non-zero; a later bootstrap still refuses that
non-empty root and requires an explicit operator recovery decision.

## Remote Layout And Active Marker

The application root remains:

```text
/opt/chatwoot-client-portal-v2
```

It continues to own `.env.production`, `DEPLOY_SOURCE.txt`, install state,
backups and logs. Staged release state is kept under bounded hidden paths:

```text
.release-state/
  deploy.lock
  transaction
  current
  previous
  prepared
  decisions/
  history/
.releases/
  <full-commit-sha>/
    source/
    compose.release.yaml
    manifest.txt
    tenants.tsv
```

`compose.release.yaml` assigns immutable release tags to only the three
portal-built services:

- `chatwoot-client-portal-v2-portal-backend:<full-sha>`;
- `chatwoot-client-portal-v2-portal-web:<full-sha>`;
- `chatwoot-client-portal-v2-telegram-bridge:<full-sha>`.

The root source copy and `DEPLOY_SOURCE.txt` continue to describe the active
runtime. They are published from candidate source only after Compose health and
all public tenant checks pass. Candidate preparation must not change them.

New active-source markers use a deterministic, mode-0600, non-secret
`key=value` protocol containing at least protocol version, application name,
full `source_commit`, archive checksum and activation timestamp. The existing
pre-staged marker format may be read only during first adoption and only when
it proves the exact application, a full clean commit, `source_dirty=false` and
no preview override. Once `.release-state/current` exists, the legacy format is
rejected; this one-time reader is removed from the normal state path rather
than becoming permanent compatibility behavior.

The active and previous release source directories remain present because
Compose bind mounts and an exact rollback must not depend on a deleted source
tree. The application root's current source copy keeps existing read-only
operator commands and maintenance tooling aligned with the active release.

## Prepare Flow

`prepare` performs these steps under a non-blocking remote `flock`:

1. Validate the application root, `.env.production`, current
   `DEPLOY_SOURCE.txt` and release protocol state.
2. Reject another prepared candidate, except an expired candidate that can be
   removed safely before continuing.
3. Read the current production commit and require it to exist in the local Git
   repository used by the orchestrator.
4. Create and verify exact archives for the candidate and, when the current
   release has not yet been imported into staged state, the current production
   commit.
5. Place source under `.releases/<sha>/source` without replacing the active root
   source.
6. Import the current production source and tag the exact image IDs used by the
   three running portal containers before any candidate build. If Docker can no
   longer inspect one of those image IDs, preparation stops; it must not
   silently substitute a rebuild as an exact rollback.
7. Validate `.env.production` without modifying it: run the existing env
   upgrade helper against a mode-0600 temporary copy, block when that copy
   would change, report missing key names only, and delete the copy. Record the
   real env file's SHA-256 and run `docker compose config --quiet` against the
   candidate Compose files. Missing required configuration is a separate
   operator change and blocks prepare.
8. Compare `backend/drizzle/`, `backend/drizzle.config.ts` and
   `backend/src/db/migrate.ts` between current and candidate commits. Any
   difference classifies the candidate as a migration release because backend
   and Telegram bridge startup can run migrations during activation.
9. Calculate the required disk budget and reject preparation before candidate
   build when available space is insufficient.
10. Build the three candidate portal images with full-SHA release tags and
    record their exact Docker image IDs.
11. Verify that all three candidate images, all three rollback images and every
    non-built image referenced by the candidate Compose config are locally
    available by exact tag and ID. A missing non-built image may be fetched
    during prepare, never during activate, and its resolved ID is recorded.
12. Read the active tenant smoke matrix from `portal_tenants` using only rows
    with `status='active'`. Store only `slug` and `public_base_url`; require
    unique slugs and HTTPS origin-only public URLs. Zero active tenants or more
    than 100 active tenants is an error. The latter requires a separately
    reviewed higher-scale deployment-smoke design rather than unbounded
    fan-out.
13. Write the prepared manifest with a 24-hour expiry and print the separate
    activation command.

Preparation must never call `docker compose up`, restart a container, update
the active marker or write portal application data.

For the first staged deployment, the current `DEPLOY_SOURCE.txt` commit is
imported as the rollback release and the exact image IDs used by its running
containers receive full-SHA release tags before candidate build. If those image
records are unavailable, staged adoption fails closed and requires a separate
operator-approved rollback-bootstrap decision. It never labels a rebuild as
the exact running release. Mutable upstream inputs remain separately open under
`F-SUPPLY-002`.

## Activate Flow

`activate` performs these steps while holding the same remote lock for the
entire cutover, smoke and possible rollback:

1. Require a non-expired prepared manifest for the exact requested commit and
   matching deploy protocol version.
2. Re-read the active marker and refuse activation if production changed since
   preparation.
3. Revalidate archive checksum, production env SHA-256, candidate/rollback
   image tags and exact image IDs, candidate Compose config, tenant smoke matrix
   and migration policy. If the env file or active tenant matrix changed after
   prepare, activation refuses the stale release and requires a new prepare.
   When a migration decision is required, write its policy and approval
   reference to a separate immutable activation-decision record before cutover;
   do not mutate the prepared manifest.
4. Start the prepared release with the production project name and exact base
   plus release override files using:

   ```text
   docker compose up -d --no-build --pull never --wait --wait-timeout 120
   ```

5. Check container health and restart counts.
6. Check `/api/health` and `/api/tenant` for every active tenant public base URL.
   The returned tenant slug must equal the database-derived expected slug.
7. Only after every check passes, publish the root source copy and active
   markers through a recoverable transaction. First persist a transaction
   journal containing the exact old/new release IDs and publication phase,
   then synchronize the candidate source while preserving runtime-owned files,
   and finally write `DEPLOY_SOURCE.txt`, `current` and `previous` via
   mode-safe temporary files plus same-directory rename. Markers are published
   last; the tool does not claim that a multi-file source synchronization is
   filesystem-atomic.
8. Run bounded release cleanup and record a successful outcome.

Any publication failure invokes the same migration-policy-aware recovery as a
runtime failure. Automatic-rollback releases restore the exact previous
runtime and root source. A `forward-only` release preserves the candidate
runtime and transaction evidence for explicit recovery rather than starting
old code. An unresolved transaction journal blocks every later `prepare` or
`activate`; neither command may guess which release is active.

Public checks use no more than five concurrent workers and have a 10-minute
overall deadline. Each request uses a 5-second connect timeout, a 15-second
total timeout and at most three attempts with a 3-second delay. This is one
bounded deployment-time pass over at most 100 tenants, not runtime polling. It
adds no application request-path reads or writes.

## Migration Policy And Rollback

When all migration-sensitive paths checked during prepare are unchanged, the
default policy is automatic code rollback. If Compose readiness or any public
tenant check fails, the remote helper:

1. activates the exact previous source and image override with
   `--no-build --pull never --wait`;
2. repeats container and all-tenant public checks;
3. leaves the previous release as current when recovery succeeds;
4. removes the failed candidate release artifacts by exact ownership label;
5. records `candidate_failed_rollback_succeeded` and exits non-zero.

Non-zero exit is mandatory because the requested candidate was not deployed,
even when service recovery succeeded.

When any migration-sensitive path differs, activation is blocked until one of
these policies is explicitly recorded:

- `backward-compatible`: the reviewed migration is safe for the previous code,
  so the automatic rollback sequence above is permitted;
- `forward-only`: automatic old-code rollback is prohibited; a failed
  activation stops with exact state evidence for a forward fix.

The deploy tool never runs a down migration, restores a database backup,
deletes a volume or guesses migration compatibility.

If rollback itself fails, the tool preserves current, previous and candidate
evidence, reports `candidate_failed_rollback_failed`, prints container state
and exact release IDs, and exits non-zero. It must not perform cleanup that
could remove recovery evidence or report the deployment as successful.

## Storage And Cleanup Bounds

Stable storage contains at most two complete releases:

- current;
- previous stable rollback.

During the interval between `prepare` and `activate`, one additional candidate
may exist, so the hard transient maximum is three release directories and
three sets of portal-built images. A second candidate is rejected.

The same three-release maximum is preserved after a critical rollback failure
so recovery evidence is not destroyed. Further prepare work remains blocked
until the operator resolves that state; it cannot accumulate a fourth release.

A prepared candidate expires after 24 hours. Expired or failed candidate
artifacts are removed automatically when a later `prepare` or `activate`
acquires the release lock. An abandoned candidate can therefore occupy one
bounded slot until the next deployment command, but a second candidate can
never accumulate. Small non-secret outcome manifests are capped at the latest
20 entries.

Before building a candidate, available disk space must be at least the larger
of:

- 8 GiB;
- twice the summed size of the current backend, web and Telegram bridge image
  set.

Cleanup deletes only exact `.releases/<sha>` paths, release-state entries and
the three full-SHA image tags proven to belong to this application. It never
uses `docker system prune`, never deletes Docker volumes and never removes
untagged or external images by broad filter. Local and remote temporary
archives/directories are removed through error-safe traps.

Docker BuildKit cache is not a release artifact and is not globally pruned by
this workflow. Existing operator disk-maintenance guidance remains separate.

Bootstrap source is not an additional retained release: it exists only in the
application root during an approved clean install and becomes that install's
active source after successful health checks. It cannot coexist with an active
staged release root.

## SSH Host Authentication

Every SSH and SCP call requires a caller-provided regular file containing a
preverified host-key entry for the exact host and port. The orchestrator uses:

```text
BatchMode=yes
StrictHostKeyChecking=yes
UserKnownHostsFile=<approved-file>
IdentitiesOnly=yes
IdentityFile=<approved-private-key-file>
Port=<explicit-port>
```

Missing, empty, world-writable or non-matching known-hosts input is a hard
failure. The identity file must be a non-empty regular file that is not
group/world-readable, and the explicit SSH port must be a valid integer in
`1..65535`. The workflow and scripts must not call `ssh-keyscan` or silently
use trust-on-first-use.

GitHub Actions writes the required `PRODUCTION_SSH_KNOWN_HOSTS` secret to a
mode-0600 temporary file. An absent secret fails before any network call. The
fingerprint remains verified out of band by the operator; the repository does
not commit the production host key.

## GitHub Actions Contract

The manual production workflow retains one concurrency group and accepts:

- `commit`: required full 40-character commit SHA;
- `phase`: required `prepare` or `activate`;
- `migration_policy`: empty unless an approved migration release requires
  `backward-compatible` or `forward-only`;
- `approval_ref`: empty unless a migration policy is supplied.

The workflow checks out clean `main`, prepares strict SSH files, then invokes
the same `scripts/deploy-production-staged.sh` interface. It contains no
fallback host-key scan, remote Git mutation, direct Docker build, direct
Compose activation or alternative completion criteria.

The workflow has no `bootstrap` phase. Clean reinstall remains an exceptional
local operator procedure requiring its own explicit approval.

GitHub `prepare` and `activate` are separate workflow runs. The production
environment protection remains applicable to activation; successful prepare
does not authorize activation.

## Error Reporting

The scripts use stable machine-readable final statuses alongside concise
operator text:

- `prepared`;
- `prepare_failed`;
- `activation_succeeded`;
- `activation_refused_state_changed`;
- `activation_refused_expired`;
- `activation_refused_migration_policy`;
- `activation_failed_publication`;
- `candidate_failed_rollback_succeeded`;
- `candidate_failed_rollback_failed`;
- `candidate_failed_forward_only`;
- `bootstrap_completed`;
- `bootstrap_refused_nonempty`;
- `bootstrap_failed`.

Every refusal and failure status exits non-zero. `prepared`,
`activation_succeeded` and `bootstrap_completed` exit zero; the prepare and
bootstrap successes state explicitly that production was not activated. Logs
may include service names, tenant slugs, public base URLs, commit SHAs,
checksums and image IDs.
They must redact or omit environment values, tokens, cookies, database URLs,
customer identifiers and response bodies beyond the expected public tenant
slug.

## Testing Strategy

Add a dedicated fake-runtime harness:

```text
scripts/test-production-staged-deploy.sh
```

The production scripts expose test-only binary/path injection through explicit
environment variables used by the harness. Production defaults still resolve
the real `git`, `ssh`, `scp`, `docker`, `curl`, `flock`, checksum and filesystem
commands. The harness uses temporary directories and fake binaries; it does not
open a network connection or Docker socket.

Required TDD scenarios:

- dirty tree, non-main branch, incomplete SHA, unknown commit and commit outside
  `origin/main` fail before archive or network work;
- archive content comes from the requested commit and its SHA-256 is verified;
- missing/unusable known-hosts input fails before SSH/SCP;
- all SSH/SCP calls use strict host-key options and no script/workflow contains
  `ssh-keyscan`;
- bootstrap accepts only an absent/empty inactive root with a separate approval
  reference, installs exact commit-object source and never invokes Compose;
- bootstrap rejects any root content, env/source/release marker or running or
  stopped portal-project container, and safely handles partial-copy failure;
- clean install promotes `BOOTSTRAP_SOURCE.txt` to `DEPLOY_SOURCE.txt` only
  after successful health checks and rejects `--skip-public-health` while the
  bootstrap marker exists;
- prepare does not call Compose `up`, restart containers or change the active
  marker;
- prepare requires exact candidate and rollback tags/IDs and rejects low disk;
- first adoption accepts the existing source marker only for an exact clean
  full commit and rejects legacy marker parsing after staged current state
  exists;
- a second or expired prepared candidate follows the bounded retention rules;
- migration tree differences produce a gated manifest;
- activate rejects expired, mismatched, state-changed or incompletely prepared
  candidates;
- activation uses `--no-build --pull never --wait --wait-timeout 120`;
- the remote lock rejects overlapping prepare/activate work;
- success checks multiple tenant URLs and commits active state only after every
  tenant passes;
- prepared manifests remain immutable while activation decisions and outcomes
  are written separately;
- failure injection across root-source and marker publication proves the
  transaction journal, exact rollback/restore and unresolved-state blocking;
- tenant checks never exceed concurrency five and use the specified timeout and
  retry limits;
- non-migration candidate failure performs exact rollback and exits non-zero;
- rollback failure and forward-only failure preserve evidence and exit
  non-zero;
- cleanup retains only current, previous and at most one prepared candidate,
  without broad image/volume deletion;
- logs and manifests contain no fixture secrets;
- the old archive helper/package entry is removed and active documentation
  contains no reference to it;
- GitHub Actions delegates both phases to the staged orchestrator and has no
  alternate SSH trust or Docker activation path, and exposes no bootstrap
  phase.

Closure gates are:

- focused staged deploy harness;
- `pnpm test:ops` including that harness;
- shell syntax checks for every changed shell script;
- full `pnpm test`;
- `pnpm lint`;
- `pnpm build`;
- focused workflow/static contract checks;
- `git diff --check`;
- independent high-risk review and repeat verification after fixes.

No real production `prepare`, `activate` or rollback command is part of the
implementation closure. A later production rehearsal requires a fresh exact
operator approval.

## Documentation And Finding Closure

Update `docs/operations/production-deployment.md`, the MT-10 runbooks,
`docs/operations/continue-on-new-laptop.md`, production server notes and the
Telegram bridge production guidance so they describe one staged authority, the
two routine commands, migration decision, all-tenant smoke, bounded retention
and rollback statuses. Remove active instructions that recommend full
`up -d --build`, dirty/WIP production preview or direct Telegram-only bypass
activation.

Update `docs/operations/production-clean-reinstall.md` to use only the bounded
empty-root bootstrap before its separately approved install procedure. It must
state that bootstrap neither configures nor starts production and cannot be
used against an existing installation.

After implementation, tests and independent review satisfy their acceptance:

- close `F-OPS-005` because archive and GitHub paths converge on one immutable,
  health-gated, rollback-aware authority;
- close `F-OPS-006` because unverified SSH host-key fallback is removed and
  strict preverified known-hosts becomes mandatory.

Keep these findings open because this design does not implement their separate
acceptance criteria:

- `F-OPS-004` production env propagation;
- `F-SUPPLY-001` production advisory gate;
- `F-SUPPLY-002` immutable upstream build and CI inputs.

Update `docs/roadmap/work-log.md` only after the complete implementation,
review and verification establish the new stable operations baseline.

## Acceptance

- Full production activation has one supported authority used locally and by
  GitHub Actions.
- Clean reinstall source bootstrap uses that same authority, accepts only an
  empty inactive root and cannot start or activate production; it is absent
  from the routine workflow.
- `prepare` cannot change the active runtime and produces exact candidate plus
  rollback evidence.
- `activate` cannot build or pull during cutover and cannot proceed from stale,
  expired or incomplete preparation.
- Every active tenant receives bounded public health and tenant-resolution
  checks before success is recorded.
- Non-migration failure automatically restores the exact previous release;
  migration rollback follows only an explicit reviewed policy.
- A candidate or rollback failure can never be reported as successful.
- Root-source and marker publication is journaled and recoverable; an
  unresolved transaction blocks later deployment work.
- Stable release artifacts remain bounded to current and previous, with at most
  one 24-hour prepared candidate and 20 small outcome manifests.
- SSH host authentication fails closed without preverified known-hosts.
- The workflow never deletes portal data, Docker volumes, object storage or
  Chatwoot state.
- Required automated tests, full project gates and independent review pass
  before local merge.
- Production remains unchanged until a separate approved rehearsal or deploy.
- A clean reinstall remains unchanged until its own separate explicit approval.
