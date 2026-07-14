# F-SEC-019: Production secrets are written before restrictive file permissions are applied

- status: open
- found_in: Full application risk audit 2026-07-13; canonical Codex Security finding SEC-STD-A22-004 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release that changes or expands this security boundary.
- area: security / insecure-file-permissions
- confidence: high
- canonical_security_finding: SEC-STD-A22-004; generated writeup findings/sec-std-a22-004/sec-std-a22-004.md
- evidence: scripts/install-production.sh:689-689; scripts/install-production.sh:691-691. The affected path lacks the bounded authority or resource control described in SEC-STD-A22-004.
- failure_path: On a multi-user host with a permissive umask, another local user can read the new secret file during the write window and gain broad portal authority.
- counterevidence: Canonical validation recorded no additional counterevidence beyond the bounded controls already described in the generated finding.
- load_impact: No separate load effect beyond the security failure path was established.
- fix_short: The required invariant is straightforward: every inode that ever receives production secret bytes must be owner-readable and owner-writable only before the first byte is written. The final path should expose either the previous complete private file or the new complete private file, never a partially written permissive inode.
- acceptance: Reproduce SEC-STD-A22-004, restore the stated invariant, add a targeted regression test, and pass the required lint/build/test and review closure gates.
