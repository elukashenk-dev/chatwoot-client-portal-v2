# F-OPS-006: Deploy SSH host authentication

- status: open
- found_in: Full application risk audit 2026-07-13; candidate OPS-006 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Deploy SSH host authentication
- confidence: high
- evidence: `.github/workflows/deploy-production.yml:21-40`; OpenBSD `ssh-keyscan(1)` guidance recorded in `stages/07-operations-supply-chain.md#ops-006-the-ssh-host-key-fallback-is-unauthenticated`
- failure_path: When the known-hosts secret is absent, the job trusts the key returned by the target network connection, enabling host impersonation and false deploy execution/success
- counterevidence: Pre-provisioned secret path is supported; client private key is protected; scan itself receives no application secret
- load_impact: No separate hot-path load increase was established; the primary impact is the failure path above.
- fix_short: Require a pre-verified host-key secret and documented out-of-band fingerprint; fail closed when unavailable
- acceptance: Require a pre-verified host-key secret and documented out-of-band fingerprint; fail closed when unavailable Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
