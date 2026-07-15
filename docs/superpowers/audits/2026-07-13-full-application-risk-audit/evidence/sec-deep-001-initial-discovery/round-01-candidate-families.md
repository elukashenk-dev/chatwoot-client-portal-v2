# Initial Deep Candidate-Family Merge

Target: `a61b4975ae7b59e244c0b5bbc4efd02466aa075c`

Scope: `backend/`

This is a coordinator merge of the complete initial discovery evidence set. It
is not a canonical validation result and must not be used as a Deep Security
Scan report. The 53 deduplicated worker candidates reduce to the 20
remediation-subsumption families below.

| Family | Source candidates | Relationship to completed Standard Scan | Coordinator status |
| --- | --- | --- | --- |
| Active attachment content on portal origin | `W01R-C001`, `CAND-R01-W02-001`, `W04-CAND-006`, `CAND-R01-W06-007` | Conflicts with the suppression evidence for `SEC-STD-A12-001` | Needs canonical revalidation against the pinned Chatwoot response headers and browser behavior |
| Mark-read CSRF origin enforcement | `W01R-C002` | No direct Standard finding | Needs canonical validation of cookie policy, method semantics, and exploitability |
| Unsigned delivery identifier replay/dedupe bypass | `W01R-C003`, `CAND-R01-W02-009` | No direct Standard finding; adjacent to `SEC-STD-A13-001` | Needs canonical validation of the signed envelope and replay prerequisites |
| Recipient expansion before webhook dedupe | `W01R-C004`, `R01-W03R-C002`, `R01-W05-C006`, `CAND-R01-W06-005` | Subsumed by `SEC-STD-A13-001` | Covered by Standard finding |
| Per-subscription realtime snapshot work and backpressure | `W01R-C005`, `CAND-R01-W02-005`, `R01-W03R-C006`, `W04-CAND-011`, `R01-W05-C004`, `CAND-R01-W06-006` | Subsumed by `SEC-STD-A13-003` | Covered by Standard finding; slow-client facet belongs to the same bounded-delivery remediation |
| Unqueued push recipient/subscription fan-out | `W01R-C006`, `CAND-R01-W02-004`, `R01-W03R-C002`, `R01-W03R-C003`, `W04-CAND-005`, `R01-W05-C005` | Subsumed by `SEC-STD-A13-004` and `SEC-STD-A10-004` | Covered by Standard findings |
| DOCX expansion/parser work | `W01R-C007`, `CAND-R01-W02-007`, `R01-W03R-C004`, `W04-CAND-008`, `R01-W05-C001`, `CAND-R01-W06-003` | Subsumed by `SEC-STD-A14-001` | Covered by Standard finding |
| PDF parser work | `W01R-C008`, `CAND-R01-W02-008`, `R01-W03R-C004`, `W04-CAND-009`, `R01-W05-C002`, `CAND-R01-W06-004` | Subsumed by `SEC-STD-A14-002` | Covered by Standard finding |
| Admin challenge eligibility recheck | `W01R-C009`, `CAND-R01-W02-003`, `W04-CAND-001` | Subsumed by `SEC-STD-A04-002` | Covered by Standard finding |
| Existing portal-admin authority after Chatwoot revocation | `W01R-C010`, `CAND-R01-W02-002`, `CAND-R01-W06-008` | Expands the authority-lifecycle theme beyond `SEC-STD-A04-002` and `SEC-STD-A09-001` | Needs canonical validation and attack-path calibration |
| Tenant-wide group-info Chatwoot lookups | `CAND-R01-W02-006`, `R01-W03R-C001`, `W04-CAND-004`, `R01-W05-C003`, `CAND-R01-W06-001` | Subsumed by `SEC-STD-A09-003` | Covered by Standard finding |
| Non-evicting presence throttle maps | `R01-W03R-C005` | No direct Standard finding | Needs canonical validation of key lifetime and reachable cardinality |
| Attachment limiter evasion with rotating thread identifiers | `W04-CAND-002` | Shares root and remediation with `SEC-STD-A11-001` and key-cardinality controls in `SEC-STD-A11-002` | Covered by Standard findings unless validation proves a distinct post-admission bypass |
| Text-send limiter cardinality through unauthorized thread identifiers | `W04-CAND-003` | Subsumed by `SEC-STD-A11-002` | Covered by Standard finding |
| Admin membership enumeration through challenge behavior | `W04-CAND-007` | Same low-impact enumeration class as attack-path-ignored `SEC-STD-A07-002` | Needs canonical validation only if evidence shows additional authority or impact |
| Unthrottled repeated profile-avatar upstream writes | `W04-CAND-010` | No direct Standard finding | Needs canonical validation and load calibration |
| Database transaction/advisory-lock convoy across Chatwoot calls | `R01-W05-C007` | No direct Standard finding | Needs canonical validation of lock scope, contention, and attacker control |
| Cross-origin redirect forwarding of `api_access_token` | `R01-W05-C008` | Same root as attack-path-ignored `SEC-STD-A18-001` | Existing reproduction confirmed; requires policy-level attack-path recalibration, not rediscovery |
| Process-local authentication throttling | `R01-W05-C009` | Related to a Standard coverage proof gap | Needs distributed-runtime policy and canonical validation before reporting |
| Chat search history-call amplification | `CAND-R01-W06-002` | No direct Standard finding | Needs canonical validation of the 183-call bound, caching, and attacker-controlled frequency |

## Merge outcome

- Nine families are already covered by the 19 canonical Standard findings.
- Two families repeat Standard candidates that were suppressed or ignored after
  validation/attack-path analysis.
- Nine families or expanded facets remain plausible follow-up candidates.
- No entry in this file is a new validated finding.
