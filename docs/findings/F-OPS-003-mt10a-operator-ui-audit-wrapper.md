# F-OPS-003. MT-10A Operator UI Or Audit Wrapper

- `status`: `deferred`
- `found_in`: MT-10A closure review, `2026-06-14`
- `risk`: `medium`
- `urgency`: before routine day-to-day tenant lifecycle operations are handed
  to non-engineering operators, or before tenant volume makes shell-only CLI
  operation error-prone
- `area`: production operations, platform admin UX, tenant lifecycle,
  operator audit
- `evidence`:
  - `docs/operations/mt-10-deployment-runbooks.md` marks the current shared
    SaaS path as "Ready As Operator CLI, Not Yet Self-Service" and says an
    operator UX/audit wrapper remains if CLI is not enough for day-to-day
    operations.
  - `docs/roadmap/implementation-plan.md` records that MT-10A operator CLI
    tenant lifecycle tooling exists, while broad shared SaaS rollout still has
    an optional operator UI gap.
  - `docs/superpowers/plans/2026-06-11-mt-10a-operator-tenant-provisioning-review.md`
    lists the first implementation as CLI/operator-only, not an admin UI.
  - `docs/architecture/multi-tenant-reference.md` says early platform
    operations can stay as CLI/scripts and UI is optional later.
  - Current MT-10A operation requires shell access and exact CLI arguments for
    `tenant:create`, `tenant:chatwoot:verify`,
    `tenant:chatwoot:webhook:configure`,
    `tenant:chatwoot:reconcile -- --dry-run|--apply`, and
    `tenant:deprovision -- --archive-only --confirm=<slug>`.
- `fix_short`: Decide whether shell-only CLI remains the supported operator
  model for the next rollout stage. If not, build a platform-admin operator UI
  or audited backend wrapper around the existing MT-10A services, preserving
  backend-only Chatwoot authority and safe report redaction.
- `acceptance`:
  - A product/operations decision is documented: continue with CLI-only for the
    next stage, build a minimal audited wrapper, or build a full platform-admin
    UI.
  - If CLI-only remains supported, the runbook defines who may run commands,
    where command output is recorded, how confirmations are reviewed, and how
    shell access is controlled.
  - If an audited wrapper or UI is built, all Chatwoot Platform/API authority
    remains backend-only; the browser never receives Chatwoot tokens, Platform
    API tokens, generated passwords or webhook secrets.
  - Operator authentication and authorization are explicit and separate from
    tenant customer auth.
  - Create, verify, webhook configure, reconcile dry-run, reconcile apply and
    archive/deprovision actions produce safe audit events with actor, tenant,
    action, result and redacted metadata.
  - Destructive or state-changing actions require clear confirmation, including
    exact tenant slug confirmation for archive/deprovision.
  - Reconcile apply is only available after an operator reviews dry-run output.
  - UI/wrapper reports reuse the same secret-redaction guarantees as the CLI
    safe reports.
  - Backend tests cover authorization, validation, audit writing, safe report
    redaction and no-browser-Chatwoot-authority invariants.
  - If a frontend UI is built, frontend tests cover form validation, loading and
    failure states, dry-run review, confirmation flow and no secret rendering.
  - `docs/operations/mt-10-deployment-runbooks.md` is updated with the chosen
    operating model.
