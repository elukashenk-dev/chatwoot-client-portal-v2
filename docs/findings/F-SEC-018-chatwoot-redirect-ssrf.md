# F-SEC-018: Automatic Chatwoot redirects can pivot outbound requests into internal network destinations

- status: open
- found_in: Full application risk audit 2026-07-13; canonical Codex Security finding SEC-STD-A18-002 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release that changes or expands this security boundary.
- area: security / server-side-request-forgery
- confidence: high
- canonical_security_finding: SEC-STD-A18-002; generated writeup findings/sec-std-a18-002/sec-std-a18-002.md
- evidence: backend/src/integrations/chatwoot/request.ts:72-72; backend/src/integrations/chatwoot/client.ts:472-472; backend/src/integrations/chatwoot/client.ts:695-695. The affected path lacks the bounded authority or resource control described in SEC-STD-A18-002.
- failure_path: A compromised or redirect-misconfigured tenant Chatwoot boundary can make the shared portal backend issue GETs or method-preserving requests to HTTP(S) services reachable from the portal network, potentially reading responses into the client pipeline or triggering internal state changes beyond that tenant's external-service authority.
- counterevidence: Canonical validation recorded no additional counterevidence beyond the bounded controls already described in the generated finding.
- load_impact: No separate load effect beyond the security failure path was established.
- fix_short: The invariant to restore is simple: a Chatwoot request must never follow a response-selected destination automatically. Because Chatwoot API base URLs are configured and should be canonical, the safest minimal behavior is to reject redirects entirely:
- acceptance: Reproduce SEC-STD-A18-002, restore the stated invariant, add a targeted regression test, and pass the required lint/build/test and review closure gates.
