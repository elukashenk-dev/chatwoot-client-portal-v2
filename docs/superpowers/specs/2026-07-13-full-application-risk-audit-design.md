# Full Application Risk Audit Design

Status: approved by the user on `2026-07-13`; audit execution has not started.

## Goal

Perform a multi-stage, risk-based audit of the current
`chatwoot-client-portal-v2` application and produce an evidence-backed decision:

- `GO` — the portal can continue operating and accept new clients;
- `GO with conditions` — operation may continue only under explicit limits and
  a mandatory remediation plan;
- `NO-GO` — validated risks block safe operation or onboarding until they are
  fixed.

The audit must help a non-developer owner understand what is safe, what is not,
and why. It must not turn uncertainty into an uncontrolled rewrite.

## Primary Decision Question

Can the portal safely continue operating and onboard new clients on its current
architecture and runtime baseline? If not, which validated risks block that
decision, and in what order should they be addressed?

## Chosen Approach

Use a multi-stage risk-based audit rather than a single monolithic review or an
immediate feature-by-feature rewrite.

The audit separates:

1. read-only discovery;
2. candidate validation;
3. canonical finding creation;
4. final risk synthesis;
5. later remediation in separately approved fix scopes.

No product-code fix is part of audit discovery.

## Fixed Baseline

Before discovery starts, record:

- branch and exact commit under review;
- `origin/main` relationship;
- clean or dirty worktree state;
- installed toolchain versions;
- test and runtime prerequisites;
- ignored local artifacts that must not be committed;
- available local services and external-service blockers.

The audit evaluates one fixed commit. If `main` changes during the audit, the
original verdict remains scoped to the recorded commit. A newer commit requires
an explicit delta review or a new audit baseline.

## Scope

The repository-wide audit includes:

- backend application and Telegram bridge;
- frontend application and service worker;
- tenant resolution and tenant isolation;
- customer auth, sessions, password reset and password setup;
- tenant-admin auth and authority separation;
- Postgres schema, migrations, queries and persistence invariants;
- Chatwoot clients, webhooks, realtime, thread mapping and message send flows;
- attachments, avatars and proxy boundaries;
- Web Push, unread state, read/typing synchronization and notifications;
- PWA install, IndexedDB, offline auth, cached chat state and durable outbox;
- branding settings, legal documents and object storage;
- Telegram bridge configuration, ingress and delivery processing;
- tests, fixtures, Playwright coverage and CI gates;
- Dockerfiles, Compose, environment contracts, scripts and runbooks;
- deploy, backup, restore and operational recovery boundaries;
- dependency and supply-chain status;
- stable documentation alignment with actual code;
- load and scalability behavior at approximately `10x` and `100x` growth.

## Hard Boundaries

During discovery and validation:

- do not modify product code;
- do not refactor or modernize code opportunistically;
- do not update dependencies or lockfiles;
- do not deploy or publish anything;
- do not mutate production portal data;
- do not restart, migrate or modify production Chatwoot;
- do not expose or print secrets;
- do not use external client-portal projects as references;
- do not treat generated output as source of truth;
- do not convert an unverified suspicion into a finding.

Local portal services described by this repository may be started for approved
runtime checks. Local isolated portal Postgres data may be recreated when the
execution plan explicitly requires it. Chatwoot remains an external service and
must not be changed without a separate decision.

## External Sources

For Chatwoot contract questions:

1. use current official Chatwoot documentation first;
2. inspect `../chatwoot-ce-stable` only when official documentation does not
   answer the question;
3. never modify Chatwoot core as part of the portal audit.

For dependency, platform and browser claims, use current primary sources:

- official project documentation and release notes;
- official security advisories and vulnerability databases;
- browser/vendor documentation for PWA, Web Push and storage behavior;
- package maintainers' supported-version policies.

Age alone is not a defect. A modernization finding requires demonstrated
unsupported status, a vulnerability, an incompatibility, or measurable impact.

## Audit Stages

### Stage 0. Baseline And Safety Net

- capture the fixed Git baseline;
- inventory modules, entrypoints, routes, tables, migrations and runtime
  processes;
- map unit, integration, Playwright and operations tests;
- record required local services and external fixtures;
- run safe baseline checks defined by the execution plan;
- record failures without fixing them.

### Stage 1. Threat Model And Architecture Invariants

Build a current threat model around:

- browser;
- portal backend;
- isolated portal Postgres;
- object storage;
- Chatwoot;
- SMTP/email;
- Web Push providers;
- Telegram;
- reverse proxy and deployment boundary.

Validate the non-negotiable invariants:

- tenant is resolved before customer/admin runtime;
- browser receives no Chatwoot authority;
- portal-owned data is tenant-scoped;
- customer and tenant-admin sessions remain separate;
- Chatwoot remains external system of record for chat data;
- portal database remains isolated from Chatwoot database.

### Stage 2. Backend, Data And Security

Review:

- authentication and authorization;
- session creation, renewal, revocation and expiry;
- email-code flows and advisory-lock behavior;
- tenant-admin verification and audit events;
- request validation and error mapping;
- upload validation, proxying and SSRF boundaries;
- cryptography, token storage and secret handling;
- SQL queries, tenant filters, constraints and indexes;
- migrations, destructive behavior and rollback assumptions;
- transactions, concurrency, idempotency and duplicate delivery handling;
- rate limits, retention and cleanup behavior.

The security portion uses a deep, multi-pass security scan workflow. Candidate
security findings still require canonical validation before reporting.

### Stage 3. Chatwoot And External Integrations

Review:

- tenant-specific Chatwoot runtime configuration;
- API assumptions against official Chatwoot contracts;
- webhook ownership, signature validation and deduplication;
- portal-owned thread mapping and access checks;
- conversation bootstrap and recovery;
- text and attachment send ledgers;
- SSE admission, routing and fanout;
- unread, read and typing behavior;
- notification and push delivery;
- Telegram bridge setup, webhook ingress, phone matching and delivery dedupe;
- bounded timeouts, retries and failure recovery.

### Stage 4. Frontend And PWA

Review:

- router and customer/admin route boundaries;
- frontend API contracts and stale contract remnants;
- auth state transitions and session handoff;
- error, retry, empty and loading states;
- unsafe rendering, XSS and sensitive-data exposure;
- tenant/user/thread scoping in browser storage;
- offline auth expiry and clock handling;
- cached chat reads and older-history recovery;
- text outbox idempotency and recovery;
- service worker cache boundaries;
- Web Push routing and app badge behavior;
- installed PWA startup and network-degraded behavior;
- accessibility, keyboard/focus and responsive behavior.

### Stage 5. Load, Scalability And Reliability

For each hot path, record whether execution is per request, page, tab,
reconnect, message, chat, user, tenant, subscription or background job.

Review:

- DB reads/writes and index support;
- N+1 and unbounded scans;
- synchronous external calls;
- per-recipient and per-subscription fanout;
- process-local state in multi-instance deployments;
- hot rows, locks and transaction duration;
- retry storms, duplicate work and write amplification;
- queue durability and backpressure;
- high-cardinality logs and unbounded in-memory state;
- behavior at `10x` and `100x` tenants, users, chats and events.

### Stage 6. Operations And Supply Chain

Review:

- dependency advisories and supported versions;
- lockfile consistency and install scripts;
- CI coverage and omitted release gates;
- production image contents and build boundaries;
- Compose environment propagation;
- deploy scripts and deploy-source tracking;
- reverse-proxy, Host and TLS assumptions;
- secret rotation boundaries;
- backup, restore and disaster-recovery instructions;
- portal/Chatwoot operational separation;
- runbook alignment with executable scripts.

### Stage 7. Dynamic Validation

Run the checks defined by the execution plan, including where applicable:

- lint and code-health;
- production build;
- backend unit/integration tests;
- frontend unit tests;
- operations tests;
- targeted Playwright flows;
- local isolated runtime checks;
- migration and schema consistency checks.

Every skipped or blocked check must record:

- the exact command or scenario;
- why it could not run;
- which conclusion remains unproven;
- the precise next step needed to unblock it.

### Stage 8. Canonical Validation And Synthesis

- validate every candidate against actual code and reachable behavior;
- reject false positives with a recorded reason;
- merge semantic duplicates;
- separate defects from modernization opportunities;
- independently revalidate every `Critical` and `High` finding;
- write canonical findings;
- produce the coverage matrix;
- assign the final verdict and remediation order.

## Candidate And Finding Lifecycle

An audit observation starts as a candidate, not a finding.

A candidate may become a finding only when it has:

- exact affected files and locations;
- a reachable attack path or failure path;
- affected authority/data/runtime boundary;
- concrete impact;
- relevant existing defenses;
- confidence level;
- missing or insufficient regression coverage;
- a testable remediation acceptance contract.

Existing files in `docs/findings/` are revalidated under the same rules. They
are not automatically accepted as current findings.

Each validated risk is represented by one file in `docs/findings/` according
to `docs/findings/README.md`. Finding registration and later remediation must
respect the repository rule for one bounded finding/fix scope per branch. The
detailed branch mechanics belong in the execution plan; multiple unrelated
product fixes must never be combined with the audit.

## Severity

### Critical

Examples include:

- practical cross-tenant compromise;
- authentication or authorization bypass with broad impact;
- secret disclosure enabling system compromise;
- remote code execution;
- mass or irreversible loss/corruption of authoritative data.

### High

Examples include:

- realistic unauthorized action within a protected boundary;
- serious session or tenant-isolation weakness;
- probable message loss or duplicate external side effects;
- dangerous migration or persistence corruption path;
- production deployment, backup or recovery failure with material impact.

### Medium

Examples include bounded correctness, reliability, load, privacy or UX failures
that have a workaround or limited blast radius.

### Low

Examples include localized maintainability, observability or UX issues without
material current safety impact.

Severity is based on exploitability/reachability, impact and blast radius, not
on code style or reviewer preference.

## Verdict Rules

### NO-GO

Assign `NO-GO` when there is:

- any validated `Critical`; or
- an unmitigated `High` in tenant isolation, authentication, data integrity,
  message delivery or production safety that blocks responsible operation.

### GO With Conditions

Assign `GO with conditions` when:

- no validated `Critical` exists;
- remaining risks are bounded by explicit operational or product limits;
- every blocking condition has an owner-independent remediation sequence and
  acceptance criteria;
- unverified areas are clearly disclosed.

### GO

Assign `GO` only when:

- no blocking `Critical` or `High` remains;
- core authority, tenant, persistence and runtime invariants are validated;
- required automated checks pass or non-material blockers are documented;
- unverified areas do not prevent the decision to operate and onboard.

## Audit Artifacts

The audit produces:

1. this approved design spec;
2. a detailed execution plan;
3. an audit manifest with commit, environment, commands and limits;
4. a subsystem coverage matrix;
5. one canonical file per validated finding;
6. a separate modernization-opportunities list;
7. a final plain-language report with verdict and remediation order.

Design, plan and point-in-time audit reports live under `docs/superpowers/` as
execution artifacts. Validated active risks live under `docs/findings/`.
Stable architecture and roadmap documents are not rewritten during discovery.
They may be updated later in a dedicated scope when a validated result changes
the durable baseline.

## Git And Change Policy

- audit design and planning use branch `docs/full-application-risk-audit`;
- the branch starts from current `main`;
- product code remains unchanged during discovery;
- audit documentation must pass formatting and `git diff --check`;
- generated output, secrets and local runtime artifacts are never committed;
- fixes happen only after the audit, in separate `fix/<area>-<short-slug>`
  branches;
- no production publish, merge or deploy is implied by audit completion.

## Communication And Stop Conditions

After each stage, report concisely:

- scope actually inspected;
- checks attempted and their result;
- candidate count;
- blockers and unverified areas;
- whether an immediate `Critical` risk exists.

If a likely `Critical` is discovered, report it immediately and preserve
evidence without exposing secrets. Continue only read-only impact analysis; do
not exploit production or begin remediation without a separate user decision.

If the worktree becomes dirty from unrelated or unclear changes, stop and
resolve ownership before continuing.

## Completion Criteria

The audit is complete only when:

- every in-scope subsystem is classified in the coverage matrix;
- every existing finding has been revalidated;
- every new candidate is confirmed or rejected with a reason;
- every `Critical` and `High` has independent revalidation;
- safe automated checks have been attempted;
- browser/runtime checks have passed or have exact blockers;
- all unverified areas are explicit;
- product code was not changed during discovery;
- the final verdict follows the rules above;
- the report gives a prioritized sequence of later fix scopes.

## Known Baseline Signals

The following are starting candidates, not pre-validated audit conclusions:

- unified email-code auth is present in `main`, while some Playwright auth
  scenarios still reference removed registration routes;
- the work log contains a recommended auth branch that is no longer present;
- current open/deferred findings require revalidation;
- production operations, dependency currency and multi-instance/load behavior
  require dedicated stages rather than assumptions from documentation.

## Out Of Scope

- implementing fixes;
- feature development;
- redesigning user interfaces;
- migrating production data;
- changing Chatwoot core;
- onboarding or deprovisioning a real tenant;
- production load testing;
- preserving obsolete portal-owned contracts for backward compatibility;
- declaring code wrong solely because a newer library or pattern exists.

## Next Gate

The user reviews this written spec. After explicit approval, create a detailed
task-by-task audit execution plan. Audit discovery must not begin before that
plan is reviewed and approved.
