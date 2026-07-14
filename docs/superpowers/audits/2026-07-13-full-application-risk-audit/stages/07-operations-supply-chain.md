# Stage 07: Operations, Dependencies And Supply Chain

Status: complete

Verdict effect: no reachable Critical or High product vulnerability was proved.
Five new Medium candidates require canonical validation: production environment
values are not fully propagated into the backend container, the executable
GitHub deploy path bypasses the documented archive/source controls and does not
health-gate completion, its optional SSH host-key bootstrap is unauthenticated,
the production lockfile currently contains nine advisories with no automated
advisory gate, and CI/container inputs are mutable. Portal backup/restore
readiness is a High-severity hypothesis but remains `needs_follow_up` because
the repository cannot prove or disprove external backups or a restore rehearsal.
The final `GO` blocker remains `SEC-DEEP-001` from Stage 02.

## Frozen Target And Review Boundary

- Repository revision: `a61b4975ae7b59e244c0b5bbc4efd02466aa075c`
- Frozen source:
  `/home/evluk/projects/chatwoot-client-portal-v2-audit-source-2026-07-13`
- Scope: package manifests/lockfile, Docker build/runtime definitions, CI and
  production deploy workflows, production environment name propagation,
  portal-only backup/restore runbooks and current primary advisory/platform
  guidance
- Product source mutation: none
- Production VM, portal/Chatwoot services, databases, object storage, DNS and
  external providers: not touched
- Secret handling: names were compared; no real `.env` file or value was read
- External-source access date: 2026-07-14

## Outcome Summary

| ID        | Status          | Severity | Operations/supply-chain failure hypothesis                                                                 |
| --------- | --------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `OPS-004` | candidate       | Medium   | Production compose drops provisioning and runtime settings that the example/runbook say are available      |
| `OPS-005` | candidate       | Medium   | A second deploy path can build mixed/unreviewed source and report success without final health/provenance  |
| `OPS-006` | candidate       | Medium   | Deploy SSH can trust the host key returned by the same unverified network connection                       |
| `OPS-007` | candidate       | Medium   | Nine production dependency advisories remain in the lockfile and CI has no advisory gate                   |
| `OPS-008` | candidate       | Medium   | Mutable Actions tags and container tags can change build/deploy inputs without a portal commit             |
| `OPS-009` | needs_follow_up | High     | No repository evidence proves off-host DB/object backup, bounded retention/RPO/RTO or a successful restore |

Existing candidates remain canonical rather than being duplicated:

- `BASE-003` owns the absence of a pull-request Playwright gate;
- `ARCH-009` owns whether production provisioning must reject plaintext HTTP
  tenant/Chatwoot URLs;
- `F-OPS-001` owns host OS upgrade/realtime restart policy and is revalidated in
  Task 10.

## Build, CI And Deploy Control Map

| Path/control                    | Evidence and behavior                                                                                                  | Assessment                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Root runtime/toolchain          | `packageManager` pins pnpm `10.33.0`; Node is constrained to major 24; frozen install passed                           | Strong reproducibility inside JavaScript dependencies; Node 24 is an official LTS line                       |
| Pull-request/main CI            | frozen install, lint, build and Vitest/ops test run on Ubuntu/Node 24                                                  | Good baseline, but browser gap is `BASE-003`; no `pnpm audit`, SBOM or explicit `permissions`                |
| Canonical archive deploy        | rejects dirty source unless labelled preview, records `DEPLOY_SOURCE.txt`, preserves env/logs/backups and upgrades env | Source controls are materially stronger; activation still ends after `compose up -d --build` plus `ps`       |
| Manual GitHub production deploy | accepts branch/tag/SHA, fetches into the existing VM checkout, detaches it and rebuilds locally                        | Separate undocumented authority path; no clean-tree gate, source manifest, env upgrade, tested-artifact link |
| Compose topology                | DB/storage/backend/bridge stay on an internal network; only web publishes host ports; health checks exist              | Isolation control holds; reference topology is one backend replica                                           |
| Backend container               | multi-stage frozen install/build, production-only install and `USER node` runtime                                      | Positive least-privilege/runtime control                                                                     |
| Frontend container              | static Vite build served by Caddy                                                                                      | Small runtime surface; builder and Caddy bases remain tag-addressed                                          |

The documented authority is unambiguous: routine deploys use
`scripts/deploy-production-archive.sh` from clean reviewed `main`, and the
deployed tree must contain `DEPLOY_SOURCE.txt`
(`docs/operations/production-deployment.md:5-18,88-116`). The GitHub workflow is
not referenced by that runbook and does not implement the same contract.

## Environment Propagation

The production example, backend schema, compose service and MT-10A runbook were
compared by variable name only. `docker compose ... config --quiet` passed, but
all five names below are absent from `portal-backend.environment`.

| Name                                       | Declared/consumed by                                             | Effect when production uses compose                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `CHATWOOT_PLATFORM_API_ACCESS_TOKEN`       | production example; create/deprovision/reconcile CLIs            | operator CLIs in the running backend container cannot obtain the required Platform API credential         |
| `PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX`     | production example; provider-subdomain create; MT-10A `printenv` | the exact runbook command returns empty and provider-subdomain create rejects the missing suffix          |
| `PORTAL_PROVISIONING_SERVICE_EMAIL_DOMAIN` | production example; tenant create configuration                  | tenant create rejects the missing service email domain                                                    |
| `ADMIN_SESSION_COOKIE_NAME`                | production example; backend runtime config                       | a configured custom admin cookie name is silently ignored; the runtime falls back to its built-in default |
| `CHATWOOT_REQUEST_TIMEOUT_MS`              | production example; backend Chatwoot clients and operator CLIs   | the operator-selected timeout is silently ignored; runtime uses the parser default                        |

`loadEnv()` loads `.env` from the process working directory only when such a
file is mounted/present (`backend/src/config/env.ts:9-27`). The production
container is not given `.env.production`; compose explicitly constructs its
environment. Therefore the omitted names are not recovered implicitly.

### OPS-004: production environment propagation is incomplete

- The example declares all five names (`.env.production.example:29,33,47-49`),
  while `portal-backend.environment` enumerates other settings but omits them
  (`infra/production/compose.yaml:66-113`).
- MT-10A requires the Platform token, provider suffix and service email domain,
  then reads the suffix with `docker compose exec -T portal-backend printenv`
  (`docs/operations/mt-10a-tenant-lifecycle-rehearsal.md:63-85,126-130`).
- `tenant:create` reads the runtime env and requires those values; reconcile and
  deprovision explicitly reject a missing Platform token
  (`backend/src/scripts/create-tenant-core.ts:276-292`;
  `backend/src/scripts/reconcile-tenants.ts:15-20`;
  `backend/src/scripts/deprovision-tenant.ts:29-34`).
- Failure path: an operator follows the checked-in production runbook against
  the running backend container. Provisioning/reconciliation fails before the
  intended external action, while cookie/timeout overrides appear configured
  on the host but do not alter the runtime.
- Counterevidence: default-tenant runtime values, storage, SMTP, push and
  Telegram values needed by the long-running services are mostly propagated;
  compose validation and current ops tests pass. This narrows the defect to an
  incomplete contract/test rather than total environment failure.
- Validation contract: add the missing mappings deliberately, then make the ops
  test compare the production example/backend schema against an explicit
  per-service allowlist. Render key names only and prove the MT-10A container
  preflight without printing values.

## Deploy Authority, Completion And SSH Authentication

### OPS-005: the alternate deploy path bypasses release controls

- `.github/workflows/deploy-production.yml:3-9` accepts a mutable branch/tag or
  SHA. After any environment approval it resolves the name on the VM at fetch
  time, so the approved name is not an immutable reviewed commit.
- The VM path is reused in place. `git checkout --detach` is not preceded by a
  clean tracked/untracked check or isolated worktree
  (`deploy-production.yml:81-96`). Non-conflicting tracked modifications or
  arbitrary untracked source can remain, and `.dockerignore` excludes known
  generated paths rather than all untracked files.
- The workflow omits the archive path's env upgrade and
  `DEPLOY_SOURCE.txt`. It also does not establish that the resolved commit
  passed CI or promote a tested artifact.
- Both executable deploy paths finish with `docker compose up -d --build` and
  `docker compose ps` (`deploy-production.yml:95-97`;
  `scripts/deploy-production-archive.sh:353-377`). Neither uses `--wait`, checks
  the public health/tenant endpoints or automatically returns to a known image
  when the new stack is unhealthy. The runbook lists those checks only as
  later operator steps.
- Failure path: a stale/mixed VM checkout or moved ref is rebuilt; alternatively
  a container starts then becomes unhealthy. The workflow/script can complete
  successfully without the documented provenance and final service contract.
- Counterevidence: the workflow validates shell-sensitive inputs, uses a
  production environment and serializes deploys. Compose dependency health
  conditions prevent some premature starts, and the manual runbook has strong
  post-deploy checks.
- Validation contract: retire the unused path or make one shared deploy entry
  point accept only a full reviewed commit/artifact; require clean source,
  immutable provenance, env upgrade/config validation, bounded health wait,
  public smoke and an explicit migration-aware rollback decision.

### OPS-006: the SSH host-key fallback is unauthenticated

- If `PRODUCTION_SSH_KNOWN_HOSTS` is absent, the workflow writes the output of
  `ssh-keyscan` from the target connection directly into `known_hosts`
  (`deploy-production.yml:21-40`).
- OpenSSH documents that constructing `known_hosts` with `ssh-keyscan` without
  independently verifying the keys leaves the user vulnerable to
  man-in-the-middle attack.
- Failure path: a network/DNS adversary answers the bootstrap scan and the
  subsequent SSH connection. The job can send deploy commands to the wrong
  host and return false production success. The private key is used for client
  authentication but does not authenticate the server.
- Counterevidence: when the secret is present, the workflow uses the
  pre-provisioned value; no password or env contents are sent through the scan.
- Validation contract: make the pre-verified secret mandatory, document an
  out-of-band fingerprint source and fail closed when it is absent.

Primary source: [OpenBSD `ssh-keyscan(1)`](https://man.openbsd.org/man1/ssh-keyscan.1).

## Dependency Evidence

Commands were executed from the frozen source on 2026-07-14:

- `pnpm audit --prod --json`: exit 1; 9 entries — 5 High, 3 Moderate,
  1 Low; 0 Critical;
- `pnpm -r outdated --format json`: exit 1; 29 direct dependencies have a newer
  registry version;
- these nonzero exits were treated as inventory evidence, not automatic proof
  of application exploitability.

| Package/path                          | Locked | Advisory count | Applicability in this portal                                                                                                  | Patched target evidence                |
| ------------------------------------- | ------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Fastify -> AJV compiler -> `fast-uri` | 3.1.0  | 2 High         | compiler dependency is present, but no attacker-controlled URI normalization/allowlist path was found; schemas are code-owned | `fast-uri >=3.1.2`                     |
| `react-router`                        | 7.14.1 | 2 High, 1 Low  | advisory text explicitly excludes Declarative Mode; portal uses `<BrowserRouter>` (`frontend/src/app/App.tsx:53-58`)          | `>=7.15.1` clears all three ranges     |
| `nodemailer`                          | 8.0.5  | 1 High, 3 Mod. | direct dependency, but portal uses SMTP user/pass and only `from/subject/text/to`; no OAuth2, `raw`, `list` or JSON transport | `>=9.0.1` clears all four audit ranges |

The advisory descriptions and ranges were verified against the GitHub Advisory
Database:

- [`fast-uri` encoded path traversal](https://github.com/advisories/GHSA-q3j6-qgpj-74h6)
  and [host confusion](https://github.com/advisories/GHSA-v39h-62p7-jpjc);
- React Router [Framework Mode RCE](https://github.com/advisories/GHSA-49rj-9fvp-4h2h),
  [Framework Mode DoS](https://github.com/advisories/GHSA-8x6r-g9mw-2r78)
  and [Framework Mode CSRF](https://github.com/advisories/GHSA-84g9-w2xq-vcv6);
- Nodemailer [List header injection](https://github.com/advisories/GHSA-268h-hp4c-crq3),
  [JSON transport access bypass](https://github.com/advisories/GHSA-wqvq-jvpq-h66f),
  [OAuth2 TLS validation](https://github.com/advisories/GHSA-r7g4-qg5f-qqm2)
  and [`raw` access bypass](https://github.com/advisories/GHSA-p6gq-j5cr-w38f).

Node 24 itself is not an unsupported-runtime finding. The root restricts major
24, Docker/CI select Node 24, and the official Node release schedule lists v24
as LTS: [Node.js releases](https://nodejs.org/en/about/previous-releases).

### OPS-007: production dependency advisories have no automated gate

- `pnpm-lock.yaml` fixes `fast-uri@3.1.0`, `react-router@7.14.1` and
  `nodemailer@8.0.5`; the current registry audit reports the nine entries above.
- CI performs install/lint/build/test only (`.github/workflows/ci.yml:28-38`).
  No checked-in dependency-update or advisory policy prevents newly published
  production advisories from remaining unnoticed.
- No portal-specific exploit path was established for the nine current entries,
  so their upstream High labels are not promoted to High portal findings.
  Nevertheless, reachability can change as code evolves and supported patched
  releases exist.
- Validation contract: update in a dedicated dependency scope, rerun the full
  closure suite, require zero known production advisories or an expiring,
  owner/reachability-documented exception, and automate read-only alerting/gate
  behavior without turning registry outages into silent passes.

## Mutable Supply-Chain Inputs

### OPS-008: build and CI inputs are not immutable

- CI invokes `actions/checkout@v4` and `actions/setup-node@v4`. GitHub states
  that a full commit SHA is the only immutable way to consume an action.
- Backend/frontend images use `node:24-alpine`; frontend runtime uses
  `caddy:2-alpine`; compose uses `postgres:16-alpine`. MinIO defaults use dated
  tags. None is digest-pinned.
- Production rebuilds these inputs on the VM, so identical portal source can
  produce different images as tags move. A compromised/mistaken upstream tag
  can execute in CI/build/runtime without a portal commit.
- Counterevidence: dependencies use a frozen lockfile, registries/images are
  reputable upstreams, MinIO tags are dated, backend runtime is non-root and
  internal service exposure is narrow.
- Validation contract: pin Actions to verified full SHAs and images to reviewed
  digests while retaining human-readable version comments; use scheduled
  update PRs, rebuild/test the complete stack and record image/artifact
  provenance.

Primary sources:
[GitHub secure use reference](https://docs.github.com/en/actions/reference/security/secure-use),
[Docker image digests](https://docs.docker.com/dhi/core-concepts/digests/).

## Backup, Restore And Failure Recovery

Controls that held:

- portal DB, portal object storage, production env and deploy marker are
  explicitly identified as one restore set
  (`docs/operations/mt-10-deployment-runbooks.md:623-654`);
- Chatwoot backup is explicitly separate, and portal-destructive instructions
  prohibit changing Chatwoot DB/uploads/services;
- the clean-reinstall path preserves `.env.production`, full and selected
  custom-format DB dumps, and checksums in a mode-0700 directory;
- object storage is recognized as production data and its volume is preserved
  by default.

### OPS-009: recoverability is not proved for new-client onboarding

- The concrete DB backup stays on the same production VM
  (`production-clean-reinstall.md:206-249`). There is no repository-owned
  schedule, retention/budget, off-host copy, success monitoring, RPO or RTO.
- The generic restore notes name the object-storage volume but provide no
  executable object backup/restore command. Preserving a local Docker volume is
  not protection from VM/disk loss.
- Checksums are written, but the destructive sequence does not show
  `sha256sum -c` or `pg_restore -l` before deleting the DB volume. No retained
  evidence proves a full DB + object + key restore rehearsal.
- Impact hypothesis: VM/disk loss or an unusable dump can permanently remove
  portal-owned identities, legal acceptance/runtime metadata, encrypted tenant
  configuration and branding objects. Chatwoot chat data remains a separate
  system of record, which limits but does not eliminate impact.
- Counterevidence: AGENTS/product rules still classify portal-owned data as
  test data, the runbooks preserve the correct data boundaries, and an external
  infrastructure backup may exist outside this repository.
- Validation contract: inventory actual provider/VM snapshots without exposing
  secrets; define bounded RPO/RTO/retention and monitored off-host copies for DB
  plus object storage and key/env material; perform an isolated restore drill
  with checksum/catalog validation, migration/startup and tenant/branding/auth
  acceptance. Until then this remains `needs_follow_up`, not a proven current
  data-loss incident.

## Ordinary Currency And Modernization

`pnpm outdated` reported 29 direct packages. Apart from the advisory-bearing
packages, the material production updates are ordinary patch/minor currency:
React/React DOM 19.2.5 -> 19.2.7, AWS S3 client 3.1063.0 -> 3.1086.0,
Fastify 5.8.5 -> 5.10.0, PostgreSQL client 8.20.0 -> 8.22.0 and Zod 4.3.6 ->
4.4.3. Dev-tool updates and major migrations (ESLint 10, TypeScript 7) belong
in scheduled, independently tested scopes rather than this audit report.

Non-defect improvements are recorded in `modernization-opportunities.md`:
explicit workflow permissions, automated update PRs, SBOM/provenance and
low-cardinality deploy/backup observability.

## Verification Executed

- `pnpm test:ops`: PASS
- `docker compose --env-file .env.production.example -f infra/production/compose.yaml config --quiet`: PASS
- `bash -n` for archive deploy, production env/object-storage and install
  scripts: PASS
- name-only compose check: all five OPS-004 variables absent as described
- `pnpm audit --prod --json`: completed with the recorded nonzero advisory
  result
- `pnpm -r outdated --format json`: completed with the recorded nonzero
  currency result
- frozen source `git status --short`: clean

## Limitations And Handoff

- Production source state, GitHub environment protection/default token
  permissions, actual SSH secret presence, VM health and external backup
  controls were not inspected.
- No production restore, rollback, deploy, image pull or provider call was run.
- Advisory applicability is based on frozen code paths and primary advisory
  descriptions; Task 10/Stage 10 own final deduplication and canonical status.
- Task 10 must now revalidate every existing `docs/findings/` entry against the
  frozen code and the evidence from Stages 00-07.
