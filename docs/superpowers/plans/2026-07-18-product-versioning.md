# Product Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Give every production release one immutable stable SemVer version, show it on the authenticated profile page, and bind it to staged-deployment provenance.

**Architecture:** The root package.json is the only product-version authority. A Node helper validates and injects it into frontend builds; the profile reads that bundled value without a request. The local staged-deployment authority verifies the exact annotated origin tag before source promotion. The remote authority records and revalidates version/tag evidence before activation or rollback.

**Tech Stack:** Node.js 24, pnpm 10, React 19, Vite 8, TypeScript 6, Bash, Git, Docker Compose, GitHub Actions.

## Global Constraints

- Root package.json field version is the sole product-version authority.
- Only stable SemVer X.Y.Z is valid: no rc, beta, nightly, metadata, or fallback.
- The first client-facing release is v1.0.0. Use 0.1.0 as the implementation baseline; a later dedicated release commit changes it to 1.0.0.
- A release is a dedicated release: vX.Y.Z commit and annotated vX.Y.Z tag on that exact commit. Failed prepare consumes the version/tag.
- origin must protect v\* from deletion and force-updates for normal release credentials. Document that external GitHub setting; do not change GitHub settings or deploy production.
- prepare and activate remain separately approved. No task invokes either against production.
- Version display adds no API call, database read, polling, or background work, and gives no Chatwoot authority to the browser.
- Profile copy is exactly lowercase версия: X.Y.Z, read-only, with no release-notes/history UI.
- Historic releases are not retroactively versioned. Keep their source evidence readable only for safe rollback.
- Do not modify preserved SEC-DEEP-001 evidence, plan, or specification.

---

## Planned File Structure

| File                                                         | Responsibility                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| package.json                                                 | Root version authority and version-test command.                        |
| scripts/product-version.mjs                                  | Parses stable root version for builds/deploy code.                      |
| scripts/product-version.test.mjs                             | Tests valid, invalid, missing, and malformed product versions.          |
| frontend/package.json                                        | Injects validated root version into dev, test, and build.               |
| frontend/Dockerfile                                          | Copies root helper into frontend build context.                         |
| frontend/src/shared/lib/productVersion.ts                    | Fail-closed frontend accessor.                                          |
| frontend/src/features/profile/pages/UserProfilePage.tsx      | Shows read-only version row.                                            |
| frontend/src/features/profile/pages/UserProfilePage.test.tsx | Covers exact Russian copy without API change.                           |
| scripts/deploy-production-staged.sh                          | Verifies root version and exact annotated origin tag.                   |
| scripts/production-release-records.sh                        | Validates bounded version/tag release evidence.                         |
| scripts/production-staged-release-remote.sh                  | Validates archive version, manifest, activation, and rollback evidence. |
| scripts/test-production-staged-deploy.sh                     | Fake-origin/remote provenance regression tests.                         |
| scripts/test-production-release-records.sh                   | Unit tests for version/tag record schemas.                              |
| scripts/test-production-deploy-contracts.sh                  | Guards GitHub/local authority and documentation contract.               |
| docs/operations/production-deployment.md                     | Canonical versioned release procedure.                                  |
| docs/operations/mt-10-deployment-runbooks.md                 | Short pointer to canonical procedure.                                   |
| docs/roadmap/work-log.md                                     | Stable completion note and current next step.                           |

### Task 1: Establish the validated build-time version authority

**Files:**

- Create: scripts/product-version.mjs
- Create: scripts/product-version.test.mjs
- Modify: package.json
- Modify: frontend/package.json
- Modify: frontend/Dockerfile
- Create: frontend/src/shared/lib/productVersion.ts

**Interfaces:**

- Produces parseProductVersion(value: unknown): string and readProductVersion(packageJsonPath?: string): string.
- Produces productVersion: string for the frontend.
- Consumes root package.json version only; workspace package versions stay unrelated.

- [ ] **Step 1: Write a failing Node test**

  Create scripts/product-version.test.mjs:

  ```js
  import assert from 'node:assert/strict'
  import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
  import { tmpdir } from 'node:os'
  import { join } from 'node:path'
  import test from 'node:test'

  import {
    parseProductVersion,
    readProductVersion,
  } from './product-version.mjs'

  test('accepts stable SemVer values', () => {
    assert.equal(parseProductVersion('0.1.0'), '0.1.0')
    assert.equal(parseProductVersion('1.0.0'), '1.0.0')
    assert.equal(parseProductVersion('12.34.56'), '12.34.56')
  })

  test('rejects missing and non-stable values', () => {
    for (const value of [
      undefined,
      '',
      'v1.0.0',
      '1.0',
      '1.0.0-rc.1',
      '1.0.0+build.7',
      '01.0.0',
      '1.00.0',
      '1.0.00',
      1,
    ]) {
      assert.throws(() => parseProductVersion(value))
    }
  })

  test('reads only package.json version', () => {
    const directory = mkdtempSync(join(tmpdir(), 'portal-product-version-'))
    const packagePath = join(directory, 'package.json')

    writeFileSync(packagePath, JSON.stringify({ version: '2.3.4' }))
    assert.equal(readProductVersion(packagePath), '2.3.4')
    writeFileSync(packagePath, JSON.stringify({ name: 'portal' }))
    assert.throws(() => readProductVersion(packagePath))
  })

  test('frontend scripts run the root helper before Vite or Vitest', () => {
    const frontendPackage = JSON.parse(
      readFileSync(
        new URL('../frontend/package.json', import.meta.url),
        'utf8',
      ),
    )

    for (const name of ['dev', 'build', 'test']) {
      assert.match(
        frontendPackage.scripts[name],
        /node \.\.\/scripts\/product-version\.mjs --print/,
      )
      assert.match(frontendPackage.scripts[name], /test -n/)
    }
  })
  ```

- [ ] **Step 2: Run it to show the missing authority**

  Run: node --test scripts/product-version.test.mjs

  Expected: FAIL because the module and root version field do not exist.

- [ ] **Step 3: Add parser, baseline, and fail-closed frontend value**

  Create scripts/product-version.mjs:

  ```js
  import { readFileSync } from 'node:fs'
  import { resolve } from 'node:path'
  import { fileURLToPath } from 'node:url'

  const stableVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
  const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
  const defaultPackageJsonPath = resolve(repositoryRoot, 'package.json')

  export function parseProductVersion(value) {
    if (typeof value !== 'string' || !stableVersionPattern.test(value)) {
      throw new Error('Product version must be stable SemVer X.Y.Z.')
    }

    return value
  }

  export function readProductVersion(packageJsonPath = defaultPackageJsonPath) {
    let packageJson

    try {
      packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    } catch {
      throw new Error('Could not read root product version.')
    }

    return parseProductVersion(packageJson.version)
  }

  function main(argumentsList) {
    if (argumentsList.length !== 1 || argumentsList[0] !== '--print') {
      throw new Error('Usage: node scripts/product-version.mjs --print')
    }

    process.stdout.write(readProductVersion() + '\n')
  }

  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2))
  }
  ```

  Add this root package content while leaving frontend workspace version unchanged:

  ```json
  {
    "version": "0.1.0",
    "scripts": {
      "test:version": "node --test ./scripts/product-version.test.mjs"
    }
  }
  ```

  Create frontend/src/shared/lib/productVersion.ts:

  ```ts
  const stableProductVersionPattern =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

  const version = import.meta.env.VITE_PRODUCT_VERSION

  if (!stableProductVersionPattern.test(version)) {
    throw new Error('Frontend build did not receive a stable product version.')
  }

  export const productVersion = version
  ```

- [ ] **Step 4: Inject the authority into every frontend entry command**

  Replace only frontend dev, build, and test scripts:

  ```json
  {
    "scripts": {
      "dev": "VITE_PRODUCT_VERSION=\"$(node ../scripts/product-version.mjs --print)\"; test -n \"$VITE_PRODUCT_VERSION\" || exit 1; export VITE_PRODUCT_VERSION; vite",
      "build": "VITE_PRODUCT_VERSION=\"$(node ../scripts/product-version.mjs --print)\"; test -n \"$VITE_PRODUCT_VERSION\" || exit 1; export VITE_PRODUCT_VERSION; NODE_ENV=production tsc -b && NODE_ENV=production vite build && NODE_ENV=production node ./scripts/stamp-service-worker.mjs && NODE_ENV=production node ./scripts/check-production-build.mjs",
      "test": "VITE_PRODUCT_VERSION=\"$(node ../scripts/product-version.mjs --print)\"; test -n \"$VITE_PRODUCT_VERSION\" || exit 1; export VITE_PRODUCT_VERSION; vitest run"
    }
  }
  ```

  Insert this in frontend/Dockerfile before COPY frontend frontend:

  ```dockerfile
  COPY scripts/product-version.mjs scripts/product-version.mjs
  COPY frontend frontend
  RUN pnpm --dir frontend build
  ```

  Docker uses copied root package version; no mutable build argument is introduced.

- [ ] **Step 5: Run focused checks**

  Run:

  ```bash
  pnpm test:version
  pnpm --dir frontend build
  temp_package="$(mktemp)"
  printf '%s\n' '{"name":"portal"}' >"$temp_package"
  node -e "import('./scripts/product-version.mjs').then(({ readProductVersion }) => readProductVersion(process.argv[1]))" "$temp_package" && exit 1 || true
  rm -f -- "$temp_package"
  ```

  Expected: tests/build PASS; missing root version is rejected.

- [ ] **Step 6: Commit**

  ```bash
  git add package.json frontend/package.json frontend/Dockerfile     scripts/product-version.mjs scripts/product-version.test.mjs     frontend/src/shared/lib/productVersion.ts
  git commit -m "feat(release): add product version authority"
  ```

### Task 2: Display the bundled profile version

**Files:**

- Modify: frontend/src/features/profile/pages/UserProfilePage.tsx
- Modify: frontend/src/features/profile/pages/UserProfilePage.test.tsx

**Interfaces:**

- Consumes productVersion from Task 1.
- Produces one read-only dt/dd row in existing authenticated profile card.
- Changes neither profileClient, backend, routes, database, cache, nor network behavior.

- [ ] **Step 1: Add a failing exact-copy assertion**

  In existing first render test after contact fields:

  ```ts
  expect(screen.getByText('версия:')).toBeInTheDocument()
  expect(screen.getByText('0.1.0')).toBeInTheDocument()
  ```

  Do not mock a new request.

- [ ] **Step 2: Run focused test**

  Run:

  ```bash
  VITE_PRODUCT_VERSION="$(node scripts/product-version.mjs --print)"     pnpm --dir frontend exec vitest run     src/features/profile/pages/UserProfilePage.test.tsx
  ```

  Expected: FAIL because no version row exists.

- [ ] **Step 3: Render static value**

  Add import:

  ```ts
  import { productVersion } from '../../../shared/lib/productVersion'
  ```

  Add after Телефон inside current dl:

  ```tsx
  <DetailRow label="версия:" value={productVersion} />
  ```

  Keep current DetailRow styling. Do not add links, endpoint, loading state, or polling.

- [ ] **Step 4: Run UI checks**

  Run:

  ```bash
  VITE_PRODUCT_VERSION="$(node scripts/product-version.mjs --print)"     pnpm --dir frontend exec vitest run     src/features/profile/pages/UserProfilePage.test.tsx
  pnpm --dir frontend build
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/features/profile/pages/UserProfilePage.tsx     frontend/src/features/profile/pages/UserProfilePage.test.tsx
  git commit -m "feat(profile): show product version"
  ```

### Task 3: Reject non-immutable release tags before source promotion

**Files:**

- Modify: scripts/deploy-production-staged.sh
- Modify: scripts/test-production-staged-deploy.sh
- Modify: .github/workflows/deploy-production.yml
- Modify: scripts/test-production-deploy-contracts.sh

**Interfaces:**

- Consumes root version, requested full commit, local main, exact origin refs/tags/vX.Y.Z.
- Produces STAGED_PRODUCT_VERSION and STAGED_RELEASE_TAG for remote prepare/activate.
- GitHub supplies only phase/commit/migration/approval; never version/tag.

- [ ] **Step 1: Add failing fake-origin cases**

  Extend fixture candidate creation with an annotated, non-moving tag:

  ```bash
  tag_fixture_release() {
    local version="$1"
    local tag="v$version"

    git -C "$FIXTURE_REPO" tag -a "$tag" -m "release: $tag" HEAD
    git -C "$FIXTURE_REPO" push -q origin "refs/tags/$tag"
  }
  ```

  Update advance_candidate_commit to bump fixture version before dedicated candidate commit/tag. Add to run_prepare_cases:

  ```bash
  run_case prepare_rejects_missing_invalid_or_lightweight_release_tag_before_transport
  run_case prepare_rejects_tag_for_another_commit_or_origin_replacement_before_transport
  run_case prepare_rejects_reused_version_tag_before_transport
  ```

  Cover no tag, v1.0.0-rc.1, lightweight tag, another commit, local/origin mismatch, and reused old tag. Each refusal must call assert_no_transport and assert_no_docker_records.

- [ ] **Step 2: Run suite to demonstrate gap**

  Run: bash scripts/test-production-staged-deploy.sh prepare

  Expected: FAIL because untagged candidate currently reaches prepare.

- [ ] **Step 3: Implement local exact-tag preflight**

  Add before staged_main and invoke after fresh origin/main equality but before credentials/transport:

  ```bash
  staged_is_product_version() {
    [[ "$1" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]
  }

  staged_require_release_tag() {
    local repo_root="$1"
    local commit="$2"
    local version="$3"
    local tag="v$version"
    local remote_object local_object tag_type tagged_commit

    staged_is_product_version "$version" || return 1
    git -C "$repo_root" fetch --no-tags origin "refs/tags/$tag:refs/tags/$tag" >/dev/null 2>&1 || return 1
    remote_object="$(git -C "$repo_root" ls-remote --refs origin "refs/tags/$tag" | awk 'NR == 1 { print $1 }')" || return 1
    local_object="$(git -C "$repo_root" rev-parse "$tag")" || return 1
    tag_type="$(git -C "$repo_root" cat-file -t "$tag")" || return 1
    tagged_commit="$(git -C "$repo_root" rev-parse "$tag^{}")" || return 1

    [[ "$tag_type" == 'tag' && "$remote_object" == "$local_object" && "$tagged_commit" == "$commit" ]]
  }
  ```

  Set once:

  ```bash
  STAGED_PRODUCT_VERSION="$(node "$repo_root/scripts/product-version.mjs" --print)" ||
    staged_fail 'Root product version is invalid.'
  STAGED_RELEASE_TAG="v$STAGED_PRODUCT_VERSION"
  staged_require_release_tag "$repo_root" "$commit" "$STAGED_PRODUCT_VERSION" ||
    staged_fail 'Origin release tag must be annotated and point to requested commit.'
  ```

  Pass --product-version and --release-tag in existing prepare/activate remote arrays. Do not add CLI overrides, workflow inputs, environment trust, or a tag-creation side effect.

- [ ] **Step 4: Keep GitHub a caller**

  In deployment workflow retain main and fetch-depth: 0, add fetch-tags: true, and keep its one call to scripts/deploy-production-staged.sh.

  Extend deployment-contract test to require fetch-tags: true and reject inputs/environment named product_version, product-version, release_tag, or release-tag.

- [ ] **Step 5: Run authority checks**

  Run:

  ```bash
  bash scripts/test-production-staged-deploy.sh prepare
  bash scripts/test-production-deploy-contracts.sh
  ```

  Expected: PASS. Invalid tags fail before transport, valid annotated origin tag reaches existing prepare checks.

- [ ] **Step 6: Commit**

  ```bash
  git add scripts/deploy-production-staged.sh     scripts/test-production-staged-deploy.sh     .github/workflows/deploy-production.yml     scripts/test-production-deploy-contracts.sh
  git commit -m "feat(release): verify origin release tags"
  ```

### Task 4: Persist and revalidate version provenance in staged evidence

**Files:**

- Modify: scripts/production-release-records.sh
- Modify: scripts/production-staged-release-remote.sh
- Modify: scripts/deploy-production-staged.sh
- Modify: scripts/test-production-release-records.sh
- Modify: scripts/test-production-staged-deploy.sh

**Interfaces:**

- Consumes --product-version=X.Y.Z and --release-tag=vX.Y.Z.
- Prepared manifest and versioned active marker use product_version/release_tag.
- Historic active markers retain only existing commit/checksum; no version is invented.

- [ ] **Step 1: Add failing evidence, activation, and rollback cases**

  Add record checks:

  ```bash
  assert_fails release_record_is_product_version '1.0.0-rc.1'
  assert_fails release_record_is_product_version 'v1.0.0'
  assert_fails release_record_is_release_tag '1.0.0' 'v1.0.0'
  assert_fails release_record_is_release_tag '1.0.0' 'v1.0.1'
  ```

  Add staged cases:

  ```bash
  run_case prepare_rejects_archive_product_version_mismatch_before_candidate_build
  run_case prepare_manifest_records_exact_product_version_and_release_tag
  run_case activate_rejects_tampered_product_version_or_release_tag_before_cutover
  run_case activation_and_rollback_restore_exact_versioned_source_marker
  ```

  The archive case alters only candidate archive package.json after local preflight and proves no build. The activation case tampers each manifest key, expects status=activation_refused_state_changed, and calls assert_no_compose_cutover. The rollback case activates one versioned release, fails later candidate smoke, and checks previous product_version/release_tag restored in DEPLOY_SOURCE.txt.

- [ ] **Step 2: Run failing suites**

  Run:

  ```bash
  bash scripts/test-production-release-records.sh
  bash scripts/test-production-staged-deploy.sh activate-success
  bash scripts/test-production-staged-deploy.sh rollback
  ```

  Expected: FAIL because existing schemas/parser omit version/tag evidence.

- [ ] **Step 3: Add shared bounded validators and marker schemas**

  Add next to release-record validators:

  ```bash
  release_record_is_product_version() {
    [[ "$1" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]
  }

  release_record_is_release_tag() {
    local version="$1"
    local tag="$2"

    release_record_is_product_version "$version" && [[ "$tag" == "v$version" ]]
  }
  ```

  New active marker writer emits after archive_sha256 and before activated_at_utc:

  ```text
  product_version=1.0.0
  release_tag=v1.0.0
  ```

  release_marker_validate_active accepts exactly these shapes:

  ```text
  protocol_version,record_kind,app,source_commit,archive_sha256,activated_at_utc
  protocol_version,record_kind,app,source_commit,archive_sha256,product_version,release_tag,activated_at_utc
  ```

  First shape is read-only historical transition until pre-version current source is replaced. No writer creates it. Second requires release_record_is_release_tag.

- [ ] **Step 4: Extend remote parser, archive validation, manifest, and activation**

  Require --product-version/--release-tag in remote_parse_prepare_options and remote_parse_activate_options. Thread them through remote_locked_prepare, remote_manifest_write_prepared, remote_activation_preflight, remote_locked_activate, and remote_publish_activation_markers.

  After candidate archive extraction and before Compose configuration:

  ```bash
  remote_read_candidate_product_version() {
    local candidate_dir="$1"

    command -v node >/dev/null || return 1
    node "$candidate_dir/source/scripts/product-version.mjs" --print
  }

  candidate_product_version="$(remote_read_candidate_product_version "$candidate_dir")" ||
    remote_prepare_abort 'Candidate source product version is invalid.'
  [[ "$candidate_product_version" == "$product_version" ]] ||
    remote_prepare_abort 'Candidate source product version disagrees with release provenance.'
  ```

  Add fields in manifest writer and exact base set in remote_validate_prepared_manifest:

  ```bash
  "product_version=$product_version"   "release_tag=$release_tag"
  ```

  Python validator uses same stable SemVer regex and requires release_tag equal to v plus product_version. Prepared inspection returns fields; staged_validate_prepared_inspection_record compares them with STAGED_PRODUCT_VERSION/STAGED_RELEASE_TAG before activate. Activation compares explicit input, inspection, manifest before smoke/cutover. remote_stage_active_marker writes the eight-field marker. Retained previous marker remains rollback publication source.

- [ ] **Step 5: Run focused provenance suites**

  Run:

  ```bash
  bash scripts/test-production-release-records.sh
  bash scripts/test-production-staged-deploy.sh prepare
  bash scripts/test-production-staged-deploy.sh activate-success
  bash scripts/test-production-staged-deploy.sh rollback
  ```

  Expected: PASS. Disagreement fails before build/cutover; rollback restores previous evidence.

- [ ] **Step 6: Commit**

  ```bash
  git add scripts/production-release-records.sh     scripts/production-staged-release-remote.sh     scripts/deploy-production-staged.sh     scripts/test-production-release-records.sh     scripts/test-production-staged-deploy.sh
  git commit -m "feat(release): record staged product provenance"
  ```

### Task 5: Document lifecycle and protect its contract

**Files:**

- Modify: docs/operations/production-deployment.md
- Modify: docs/operations/mt-10-deployment-runbooks.md
- Modify: scripts/test-production-deploy-contracts.sh
- Modify: docs/roadmap/work-log.md

**Interfaces:**

- Documents sole lifecycle: version update, dedicated commit, annotated immutable origin tag, separately approved prepare, separately approved activate.
- Documents GitHub tag protection as prerequisite, never a script substitute.

- [ ] **Step 1: Add failing documentation-contract assertions**

  Require canonical guide to contain:

  ```text
  package.json
  release: vX.Y.Z
  git tag -a "v$version"
  v* tag namespace
  force-update
  Failed prepare consumes the version and tag
  ```

  Require MT-10 to point to canonical guide without competing tag/deploy commands.

- [ ] **Step 2: Run documentation contract**

  Run: bash scripts/test-production-deploy-contracts.sh

  Expected: FAIL because current runbook has no version/tag lifecycle.

- [ ] **Step 3: Add canonical sequence and external prerequisite**

  Insert Versioned Release Prerequisites before Routine Staged Release in production-deployment.md. State that commands do not authorize deployment:

  ```bash
  git switch main
  git pull --ff-only origin main
  git status --short
  # Edit root package.json version, run reviewed checks, then:
  git add package.json pnpm-lock.yaml
  git commit -m "release: v1.0.0"
  version="$(node scripts/product-version.mjs --print)"
  commit="$(git rev-parse HEAD)"
  git tag -a "v$version" -m "release: v$version" "$commit"
  git push origin main "v$version"
  git ls-remote --refs --tags origin "refs/tags/v$version"
  ```

  State exact GitHub prerequisite: ruleset targeting v\* blocks deletion and force-updates for normal release credentials. Script independently verifies origin tag; local config cannot replace it. Failed prepare leaves tag immutable, so next candidate gets new SemVer/tag.

  MT-10 receives only a short pointer. After implementation/tests pass, add one stable work-log bullet and replace Recommended Next Step with:

  ```markdown
  - Configure and verify protected v\* GitHub tag ruleset, then obtain explicit
    approval for first real v1.0.0 staged prepare; never activate automatically.
  ```

- [ ] **Step 4: Run document checks**

  Run:

  ```bash
  bash scripts/test-production-deploy-contracts.sh
  pnpm test:docs
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add docs/operations/production-deployment.md     docs/operations/mt-10-deployment-runbooks.md     docs/roadmap/work-log.md scripts/test-production-deploy-contracts.sh
  git commit -m "docs(release): document versioned production releases"
  ```

### Task 6: Review integrated boundary and close feature

**Files:**

- Review only: all files changed by Tasks 1-5.
- Modify only if focused review finds Critical/Important issue in that area.

**Interfaces:**

- Verifies root version → annotated origin tag → exact source archive → immutable prepared manifest → active marker → rollback marker → bundled profile display.

- [ ] **Step 1: Run final gates once**

  Run:

  ```bash
  pnpm test:version
  VITE_PRODUCT_VERSION="$(node scripts/product-version.mjs --print)"     pnpm --dir frontend exec vitest run     src/features/profile/pages/UserProfilePage.test.tsx
  pnpm --dir frontend build
  bash scripts/test-production-release-records.sh
  bash scripts/test-production-staged-deploy.sh prepare
  bash scripts/test-production-staged-deploy.sh activate-success
  bash scripts/test-production-staged-deploy.sh rollback
  bash scripts/test-production-deploy-contracts.sh
  pnpm test:docs
  pnpm lint
  pnpm build
  pnpm test
  git diff --check
  ```

  Expected: all exit 0. Never use real production prepare/activate as verification.

- [ ] **Step 2: Focused review**

  Check: no CLI/environment/workspace/fallback version source; no lightweight/local/moved/mismatched/reused tag reaches transport; archive/manifest/marker rejects duplicate/unknown/mismatched fields; activation cannot cut over after evidence changes; rollback retains evidence; copy remains exact without request; GitHub remains caller.

  Record Critical/Important findings in docs/findings, fix each in scope, delete after targeted regression passes, and rerun affected checks. Report Minor observations without expanding scope.

- [ ] **Step 3: Re-run repository gates**

  Run:

  ```bash
  git diff --check
  git status --short --branch
  git log -8 --oneline --decorate
  ```

  Expected: no whitespace errors, only reviewed versioning changes on feature branch.

- [ ] **Step 4: Commit closure-only fixes if required**

  ```bash
  git add -u
  git commit -m "fix(release): close version provenance review"
  ```

  Do not create release commit or v1.0.0 tag during implementation. Handoff lists commits, gates, Minor observations, and external v\* protection before separately approved first prepare.

## Plan Self-Review

### Specification coverage

| Requirement                                   | Plan task           |
| --------------------------------------------- | ------------------- |
| Root stable SemVer, no pre-release/fallback   | Task 1              |
| First client release v1.0.0                   | Constraints, Task 5 |
| Annotated immutable exact origin tag          | Task 3              |
| Failed prepare consumes version/tag           | Tasks 3, 5          |
| Archive/manifest/activate/rollback provenance | Task 4              |
| Exact profile copy, no request                | Task 2              |
| Build failure without valid value             | Task 1              |
| GitHub/local one authority and protected tags | Tasks 3, 5          |
| Focused review/gates/no production deploy     | Task 6              |

### Placeholder scan

Every task names files, interfaces, failing test, expected failure, implementation boundary, passing command, and commit. GitHub tag protection is intentionally external with exact rule documented; no task silently performs it.

### Interface consistency

product_version and STAGED_PRODUCT_VERSION hold X.Y.Z. release_tag and STAGED_RELEASE_TAG hold vX.Y.Z. Local caller, remote parser, manifest validator, marker, fixtures, and documentation use those names. Frontend consumes only productVersion from VITE_PRODUCT_VERSION injected by root helper.
