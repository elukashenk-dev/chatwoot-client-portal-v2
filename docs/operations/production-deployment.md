# Production Deployment

## Status

Routine production code releases have one authority:
`scripts/deploy-production-staged.sh`. The only normal release sequence is
`prepare`, followed by a separately approved `activate` for the same full
commit SHA. This guide is the canonical routine runbook; the MT-10 index links
to it and does not provide a competing activation path.

`prepare` creates and verifies an exact candidate and exact rollback evidence
while the current containers continue serving. It prints the candidate/current
commit, migration classification, expiry, image IDs and a suggested activation
command, but it never authorizes or performs activation. Treat the output as
review evidence; obtain an explicit activation approval after preparation.

Routine code releases do not have a dirty/WIP preview mode, a bridge-only
deployment path, or a local production-authority bypass. Review a device build
in local development or in a separately designed non-production environment.

Current VM access and installed-state evidence are maintained in the sibling
`lancora-production-infrastructure` repository (`inventory/servers.yaml`).
The active portal VM is Timeweb `lancora@5.129.253.99`; the former Yandex
`ubuntu@93.77.166.238` is stopped rollback infrastructure, not a release target.
Confirm access metadata against that inventory and the server before each release.
Identity/known-hosts paths below are examples; use the operator's existing trusted
files, without replacing SSH host trust.

## Routine Staged Release

Protocol 2 has the fixed service set `portal-backend,portal-web`. Prepare,
activation, diagnostics, image cleanup and rollback operate only on these two
application services and their existing Compose dependencies. Telegram bridge
is intentionally disabled on Timeweb; this release neither starts nor stops it.
Re-enabling it requires a separate reviewed release-contract change.

Each manifest binds the canonical Compose override checksum and the backend
host-gateway setting. The value is inherited from verified current evidence;
rendered Compose and live Docker must agree. An arbitrary live override cannot
be imported. Protocol 1 records cannot authorize protocol 2 activation.

Before either command, obtain approval for the exact production operation and
complete the slice checks. The script itself requires clean local `main`, a
fresh `origin/main` match and a full lowercase SHA contained in that history.

```bash
commit="$(git rev-parse HEAD)"

scripts/deploy-production-staged.sh prepare \
  --host=lancora@5.129.253.99 \
  --ssh-port=22 \
  --identity-file="$HOME/.ssh/production_deploy_key" \
  --app-path=/opt/chatwoot-client-portal-v2 \
  --commit="$commit" \
  --known-hosts-file="$HOME/.ssh/production_known_hosts"
```

Read the complete preparation result. `status=prepared` is the only successful
prepare result and is not a cutover. A prepared candidate expires after 24
hours; changed active state, missing rollback evidence, low disk budget or an
invalid/expired candidate must be resolved by a new approved preparation.

If `activate` returns `candidate_failed_rollback_succeeded`, production is
already back on the previous release. Do not edit server files. After checking
the printed outcome, deliberately prepare the same full SHA again with:

```bash
scripts/deploy-production-staged.sh prepare ... \
  --commit=<FULL_SHA> --retry-after-rollback=<THE_SAME_FULL_SHA>
```

The acknowledgement removes only that retained candidate after the script has
rechecked the active release, public tenant smoke and exact image identities.
It keeps the failure outcome in history. Any changed runtime, unresolved
transaction, different SHA, invalid evidence or ambiguous history remains
blocked.

Only after a separate approval, activate that exact prepared SHA:

```bash
scripts/deploy-production-staged.sh activate \
  --host=lancora@5.129.253.99 \
  --ssh-port=22 \
  --identity-file="$HOME/.ssh/production_deploy_key" \
  --app-path=/opt/chatwoot-client-portal-v2 \
  --commit="$commit" \
  --known-hosts-file="$HOME/.ssh/production_known_hosts"
```

For a migration classification, add both a reviewed policy and non-secret
approval reference to `activate`:

```text
--migration-policy=backward-compatible|forward-only
--approval-ref=<reviewed-change-or-operator-approval-label>
```

The activation path uses Compose `--no-build` and `--pull never`; it cannot
build or pull a mutable image during cutover. A non-migration candidate failure
automatically restores the exact previous release and still exits non-zero with
`status=candidate_failed_rollback_succeeded`. Rollback failure is
`candidate_failed_rollback_failed`; a forward-only failure is
`candidate_failed_forward_only`. Other stable outcomes include `prepared`,
`prepare_failed`, `activation_succeeded`, `activation_refused_state_changed`,
`activation_refused_expired`, `activation_refused_migration_policy` and
`activation_failed_publication`. The clean-install-only phase reports
`bootstrap_completed`, `bootstrap_refused_nonempty` or `bootstrap_failed`.
Every status other than `prepared`, `activation_succeeded` and
`bootstrap_completed` and `baseline_recovered` exits non-zero.

Preparation records non-secret source, checksum, migration, image and active
tenant evidence in `.release-state/` and `.releases/`. Retention is bounded to
current plus previous release, at most one prepared candidate (24-hour expiry),
and 20 small outcome records. Preparation fails rather than overcommitting disk:
it requires the greater of 8 GiB or twice the candidate/retained release-image
footprint. Environment drift is a separate approved remediation; a release
never silently rewrites production environment values.

Activation waits for bounded Compose health and validates every active tenant's
HTTPS public health and tenant resolution. The matrix requires 1 through 100
active tenants; more than 100 active tenants needs a separately reviewed
higher-scale design. The five-worker concurrency bound limits public smoke
fan-out. Do not substitute a manual spot check for this evidence.

The active source marker is a `key=value` record. For staged runtime, read
`source_commit=` from `DEPLOY_SOURCE.txt` and confirm it agrees with the
`.release-state/current` pointer; the legacy marker format is only transitional
adoption evidence until a first staged activation establishes this state.

Changes to the release protocol or Compose configuration additionally require
`bash scripts/test-production-runtime-compose.sh`. This read-only integration
uses the installed Docker Compose CLI to verify the real template's service
selection and gateway rendering; it never starts containers.

## Explicit Recovery Of A Migrated Baseline

A migrated installation with current source/containers but missing archive,
manifest or root marker cannot use ordinary prepare. The operator first reviews
exact current SHA, both live image IDs, complete source-tree equality, canonical
network settings and the missing previous release. Only then approve
`recover-baseline` for that evidence:

```bash
scripts/deploy-production-staged.sh recover-baseline \
  --host=lancora@5.129.253.99 --ssh-port=22 \
  --identity-file="$HOME/.ssh/production_deploy_key" \
  --known-hosts-file="$HOME/.ssh/production_known_hosts" \
  --app-path=/opt/chatwoot-client-portal-v2 \
  --commit=<VERIFIED_CURRENT_FULL_SHA> \
  --retire-missing-previous=<VERIFIED_MISSING_PREVIOUS_FULL_SHA> \
  --backend-host-gateway=app.lancora.ru \
  --backend-image-id=sha256:<VERIFIED_BACKEND_IMAGE_ID> \
  --web-image-id=sha256:<VERIFIED_WEB_IMAGE_ID> \
  --approval-ref=<APPROVAL_REFERENCE>
```

The command uses the same clean-main, fresh-origin, trusted SSH and deploy-lock
boundaries. It compares the complete release source (including executable modes,
extra files and symlinks) to the exact Git archive before writing. Recovery
creates archive, manifest, root source mirror and source marker without build,
pull, migration or container changes. Existing conflicting files block recovery;
protected runtime paths and environment remain intact. The canonical override
is preserved byte-for-byte and made mode 0600.

`.release-state/recovery/journal.txt` durably records exact inputs before writes.
The explicit previous SHA retires only a pointer whose release directory is
absent; its value remains in the journal. Repeating the identical command resumes
verified writes. Changed inputs or conflicts require operator investigation;
never remove the journal to force preparation. Until identical `completed.txt`
evidence exists, prepare and activate remain blocked. `baseline_recovered` is
the only successful recovery status; `baseline_recovery_failed` exits nonzero.
Recovery is not release activation. Review the recovered baseline, then use the
normal prepare/activate procedure above.

## SSH Host Authentication And GitHub

The local identity file and known-hosts file must be regular, non-empty,
operator-owned mode-0600 files. The script uses `StrictHostKeyChecking=yes` and
requires an entry for the exact host and port before it opens a connection.

Create that entry through an independent trusted channel, not through the
deployment connection. Obtain the server host public key/fingerprint through
the hosting-provider console or another already trusted administrative channel.
For example, on the server console:

```bash
sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
sudo sed -n '1p' /etc/ssh/ssh_host_ed25519_key.pub
```

Independently compare the fingerprint, construct the exact entry offline, then
store it mode 0600 in the known-hosts file. For port 22 the entry is
`host keytype base64`; for a non-default port it is
`[host]:port keytype base64`. The command `ssh-keyscan` is forbidden for
populating production trust, including from the same untrusted connection.

The manual GitHub workflow is a caller of this same interface. Configure these
GitHub secrets: `PRODUCTION_SSH_HOST`, `PRODUCTION_SSH_USER`,
`PRODUCTION_SSH_PORT`, `PRODUCTION_SSH_PRIVATE_KEY`, and
`PRODUCTION_SSH_KNOWN_HOSTS`. The runner writes private key and known-hosts
material as mode-0600 temporary files and fails before network access if any
required value is absent. `PRODUCTION_APP_PATH` is not configurable: the script
allowlists `/opt/chatwoot-client-portal-v2`. GitHub `prepare` and `activate`
remain separate runs; environment protection on activation is not satisfied by
a successful prepare.

## Boundaries And Follow-Up

Use `docs/operations/production-clean-reinstall.md` only for a separately
approved destructive/reconfigure procedure. Its `bootstrap` phase is not a
routine release, cannot target an existing runtime and does not start
production. Use `docs/operations/mt-10-deployment-runbooks.md` for the wider
tenant, backup/restore and acceptance index.

- Do not modify production Chatwoot core, database, uploads, services or
  Chatwoot Nginx sites as part of a portal release.
- Do not expose portal backend, portal Postgres or object storage publicly.
- Do not rely on global `CHATWOOT_*` environment values as portal authority.
- Do not use real release operations to test device UI or bridge-only changes.

Read-only post-release evidence may include Compose status/logs and the public
endpoints reported by staged smoke. Tenant API Channel configuration remains a
separate operator operation; it is not an activation flag.

## Maintenance Cleanup

Portal maintenance cleanup is intentionally portal-only. It removes expired
service traces from the isolated portal Postgres and never touches Chatwoot
core, Chatwoot DB, uploads, contacts, conversations or messages.

Production installs should use a host systemd timer. It runs once per day by
default, waits through missed boots (`Persistent=true`) and adds a randomized
delay so cleanup does not fight deploy/startup work.

```bash
scripts/install-production.sh --install-maintenance-cleanup
```

Check the timer:

```bash
scripts/install-production.sh --maintenance-cleanup-status
```

Run a safe dry-run manually:

```bash
scripts/install-production.sh --maintenance-cleanup-dry-run
```

Default retention:

- send ledger `confirmed`/`failed`: `90` days;
- send ledger stuck in `processing`: `24` hours;
- Chatwoot webhook delivery bookkeeping: `30` days;
- Telegram bridge delivery bookkeeping: `30` days for `processed`/`failed`
  rows;
- expired rate-limit buckets: `24` hours after reset;
- expired sessions: `7` days after expiry;
- expired verification records: `30` days after expiry.

## OS Upgrade Follow-Up

Uncontrolled OS upgrades can restart Redis/PostgreSQL/network services while
Chatwoot web/worker keep running with stale realtime connections. The policy is
not applied yet; track it through
`docs/findings/F-OPS-001-apt-daily-chatwoot-realtime.md` before relying on
Chatwoot realtime for support SLAs or real production users.

## Real Server Notes

Known production server facts are kept in:

```text
docs/operations/production-server-notes.md
```

That file is not a deploy runbook.
