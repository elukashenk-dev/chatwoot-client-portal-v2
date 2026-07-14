# F-SUPPLY-002: Mutable build and CI inputs

- status: open
- found_in: Full application risk audit 2026-07-13; candidate OPS-008 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Mutable build and CI inputs
- confidence: high
- evidence: `.github/workflows/ci.yml:15-23`; `backend/Dockerfile:1,17`; `frontend/Dockerfile:1,15`; `infra/production/compose.yaml:5,27,47`; GitHub/Docker primary guidance in `stages/07-operations-supply-chain.md#ops-008-build-and-ci-inputs-are-not-immutable`
- failure_path: Moving Actions/image tags can change executable build/runtime inputs for the same portal commit and a compromised upstream tag can enter CI or production rebuilds
- counterevidence: Trusted upstreams, frozen JS lockfile, dated MinIO tags, non-root backend and narrow network exposure reduce likelihood
- load_impact: Moving Actions/image tags can change executable build/runtime inputs for the same portal commit and a compromised upstream tag can enter CI or production rebuilds
- fix_short: Pin verified Action SHAs and image digests with version comments; automate reviewed refresh PRs and retain tested artifact provenance
- acceptance: Pin verified Action SHAs and image digests with version comments; automate reviewed refresh PRs and retain tested artifact provenance Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
