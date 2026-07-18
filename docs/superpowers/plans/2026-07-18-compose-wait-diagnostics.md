# Compose Wait Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve safe, actionable evidence when staged production activation fails during Docker Compose readiness.

**Architecture:** The remote activation helper will snapshot only structured Docker metadata for the three candidate services before rollback: Compose exit code, immutable image ID, running state, health state, and restart count. It will persist those values in the bounded deployment outcome and print them with failure evidence. Raw Compose output and container logs remain suppressed because they can contain sensitive runtime data.

**Tech Stack:** Bash, Docker Compose, existing staged-deployment shell contract tests.

## Global Constraints

- Work only on `fix/ops-compose-wait-diagnostics` from current `main`.
- Do not activate, prepare, or otherwise mutate production while implementing or testing this fix.
- Preserve the existing bounded automatic rollback flow and its status values.
- Persist only fixed-format, non-secret Docker metadata; never persist raw Compose output, environment values, response bodies, or container logs.
- Existing outcome records without the new optional evidence remain valid for retention and critical-state inspection.

---

### Task 1: Persist bounded Compose-readiness evidence

**Files:**

- Modify: `scripts/production-staged-release-remote.sh`
- Modify: `scripts/test-production-staged-deploy.sh`

**Interfaces:**

- Produces optional outcome fields only for `failure_stage=compose_wait`:
  `compose_wait_exit_code`, `compose_wait_portal_backend`, `compose_wait_portal_web`, and `compose_wait_telegram_bridge`.
- Each service field is either `unavailable` or
  `sha256:<64 lowercase hex>|<true|false>|<healthy|unhealthy|starting|none>|<non-negative restart count>`.
- Existing `status=candidate_failed_rollback_succeeded` remains the terminal result after a successful rollback.

- [x] **Step 1: Write the failing regression case in `scripts/test-production-staged-deploy.sh`.**

  Add a dedicated rollback test that sets both
  `FAKE_CANDIDATE_COMPOSE_UP_FAIL_AFTER_MUTATION=true` and
  `FAKE_CANDIDATE_SERVICE_UNHEALTHY=portal-backend`, then asserts the captured
  output and durable outcome contain:

  ```bash
  compose_wait_exit_code=82
  compose_wait_portal_backend=${candidate_backend_id}|false|unhealthy|0
  ```

  It must also set a fake stderr sentinel such as `do-not-leak-compose-output`
  and assert that sentinel is absent from output and the durable outcome.

- [x] **Step 2: Run the focused test before implementation.**

  Run:

  ```bash
  bash scripts/test-production-staged-deploy.sh
  ```

  Expected: the new assertion fails because Compose-wait fields are not yet
  emitted or stored; existing cases may still pass.

- [x] **Step 3: Implement the smallest safe snapshot in `scripts/production-staged-release-remote.sh`.**

  When `docker compose up -d --no-build --pull never --wait --wait-timeout 120`
  returns non-zero, capture its numeric exit code and inspect only the three
  candidate service containers. Validate each captured value against the fixed
  format above; substitute `unavailable` if the container cannot be resolved
  or the metadata is not safe. Pass the snapshot into the existing failure
  evidence printer and outcome writer before the rollback removes candidate
  artifacts.

  Extend outcome validation so the four fields are accepted only together on
  a `compose_wait` outcome, while legacy outcomes with no such fields remain
  valid. Reject these fields on every other failure stage.

- [x] **Step 4: Run the focused test after implementation.**

  Run:

  ```bash
  bash scripts/test-production-staged-deploy.sh
  ```

  Expected: all staged-deployment cases pass, including the new regression
  case; the fake stderr sentinel is never emitted or persisted.

### Task 2: Record the durable operational baseline and close the slice

**Files:**

- Modify: `docs/roadmap/work-log.md`
- Verify: `scripts/production-staged-release-remote.sh`
- Verify: `scripts/test-production-staged-deploy.sh`

- [x] **Step 1: Update `docs/roadmap/work-log.md`.**

  Add one concise completed-baseline entry stating that a staged activation
  Compose-readiness failure now retains bounded, non-secret candidate service
  evidence before rollback. Do not add command logs or incident narration.

- [x] **Step 2: Run required local gates.**

  Run:

  ```bash
  pnpm test:ops
  pnpm lint
  pnpm format:check
  git diff --check
  ```

  `pnpm test:ops` includes the full staged-deployment suite, so do not run it
  separately a second time. Expected: every command exits zero. No production
  commands are run.

  Result: `pnpm test:ops` and `pnpm lint` passed; `git diff --check` and scoped
  documentation formatting passed. The repository-wide `pnpm format:check`
  remains blocked by 97 pre-existing, unrelated files and is not changed in
  this operational slice.

- [x] **Step 3: Perform focused review and commit.**

  Review only the remote activation failure path, outcome schema validation,
  fake Docker regression case, and work-log entry. Fix every Critical or
  Important finding, rerun the affected checks, then commit exactly this
  slice:

  ```bash
  git add scripts/production-staged-release-remote.sh \
    scripts/test-production-staged-deploy.sh \
    docs/roadmap/work-log.md \
    docs/superpowers/plans/2026-07-18-compose-wait-diagnostics.md
  git commit -m "fix(ops): retain compose readiness diagnostics"
  ```
