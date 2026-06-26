---
status: open
found_in: Task 12 Playwright E2E for passwordless registration completion
risk: medium
urgency: before relying on full local auth-registration e2e as a release gate
area: e2e/auth-registration
---

# E2E Chatwoot Registration Fixture Env Missing

## Evidence

`tests/e2e/auth-email-flows.spec.ts` and registration cases in
`tests/e2e/auth-guard-negative.spec.ts` create a real eligible Chatwoot contact
through `tests/e2e/support/chatwoot.ts` before exercising registration.

The targeted Task 12 run failed for registration flows before browser
registration started because the local environment did not provide
`E2E_CHATWOOT_ACCOUNT_ID` and the related Chatwoot E2E variables required by
`createChatwootContactForE2e`.

Mailpit/password-reset e2e paths did run, and isolated registration guard tests
that do not need Chatwoot passed.

## Risk

Full local Playwright coverage for known-contact registration cannot be used as
a reliable release gate unless the local/CI environment provides a configured
Chatwoot E2E fixture.

## Fix Short

Document and provision the required local/CI `E2E_CHATWOOT_*` variables, or add
a first-class isolated Chatwoot contact fixture for registration e2e that does
not depend on a developer-local external Chatwoot setup.

## Acceptance

- `pnpm test:e2e tests/e2e/auth-email-flows.spec.ts` can run registration
  flows locally/CI without missing-env failures.
- The registration e2e path still validates backend registration authority,
  email-code verification, authenticated session cookie, and chat route access.
