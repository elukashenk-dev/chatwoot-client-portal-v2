# F-OPS-004 Automate Custom Domain Ingress And Certificates

- `status`: open
- `found_in`: MT-10/MT-10A production onboarding of `lk.pronalogi.pro`
- `risk`: medium
- `urgency`: after first customer smoke, before repeated customer onboarding
- `area`: production operations, tenant domain onboarding, MT-10/MT-10A

## Evidence

`lk.pronalogi.pro` onboarding required manual host Nginx site creation,
Let’s Encrypt certificate issuance and verification before `tenant:create`
could be safely run.

This is expected for the first custom client domain, but repeating it manually
for every `lk.<client-domain>` increases the risk of:

- wrong certificate/SNI fallback;
- default Nginx page exposure;
- missed proxy headers or timeout settings;
- untracked differences between customer domain configs;
- operator mistakes during tenant provisioning.

## Fix Short

Add an operator-safe ingress/cert automation path for custom tenant domains.
The automation should create or update a host Nginx site for
`lk.<client-domain>`, issue/renew the Let’s Encrypt certificate, validate
`nginx -t`, reload Nginx and prove `/api/tenant` reaches portal before
`tenant:create`.

## Acceptance

- A documented command or script can prepare `lk.<client-domain>` ingress
  without hand-editing Nginx files.
- The command is idempotent for an existing domain.
- It records a backup of changed Nginx files before writing.
- It verifies DNS points at the production VM before certificate issuance.
- It verifies HTTP reaches the portal and HTTPS has the requested certificate.
- It leaves unknown/unprovisioned tenant hosts returning `TENANT_NOT_FOUND`
  until `tenant:create` is run.
- `docs/operations/mt-10-deployment-runbooks.md` documents the new flow.
