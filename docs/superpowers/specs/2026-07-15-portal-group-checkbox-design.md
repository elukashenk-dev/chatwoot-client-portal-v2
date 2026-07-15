# F-CHAT-012 Portal Group Checkbox Design

Date: 2026-07-15

Status: approved

Finding: `F-CHAT-012`

## Problem

An eligible customer completed email-code login but could not open the chat.
The customer's Chatwoot contact had `portal_enabled=true`, but the required
`portal_contact_type=person` value was missing. The backend rejected the
contact configuration, while the frontend presented the failure as a generic
Chatwoot outage.

The current `person`/`group` list makes the ordinary customer path depend on an
extra manual selection. This is error-prone because most portal-enabled
contacts are ordinary customers.

## Goals

- Treat a portal-enabled contact as an ordinary person by default.
- Require an explicit checkbox only for group contacts.
- Keep `portal_enabled` as the mandatory portal-access control.
- Preserve the current group-membership and curator attributes unchanged.
- Distinguish contact-configuration failures from real Chatwoot outages.
- Roll out without a portal database migration or an unbounded Chatwoot scan.

## Non-Goals

- Do not change email-code authentication, session issuance, legal acceptance,
  or password setup.
- Do not change `portal_enabled`, `portal_client_group_contact_ids`, or
  `curator_name`.
- Do not infer groups by scanning contacts, memberships, conversations, or
  portal database rows at request time.
- Do not retain a runtime reader or fallback for `portal_contact_type`.
- Do not start the Deep audit as part of this finding fix.

## Attribute Model

Add one Chatwoot contact custom attribute definition:

| Key               | Chatwoot control | Meaning                                 |
| ----------------- | ---------------- | --------------------------------------- |
| `portal_is_group` | checkbox         | `true` only when the contact is a group |

The runtime rules are:

| Contact state                                              | Runtime type | Result                               |
| ---------------------------------------------------------- | ------------ | ------------------------------------ |
| `portal_enabled=true`, `portal_is_group` absent or `false` | `person`     | Eligible ordinary customer contact   |
| `portal_enabled=true`, `portal_is_group=true`              | `group`      | Eligible group contact               |
| `portal_enabled=false` or missing                          | none         | Portal access remains disabled       |
| `portal_is_group` has a non-boolean value                  | none         | Fail closed as invalid configuration |

The non-boolean case is defensive validation for API, import, script, or
database mistakes. The normal Chatwoot checkbox UI produces only booleans.

`portal_contact_type` is retired. New runtime code, tests, fixtures, operator
documentation, and provisioning reconciliation must not read or write it.

## Runtime Flow

Email-code discovery and login remain unchanged. After authentication:

1. The portal backend resolves the tenant-scoped Chatwoot contact link.
2. The backend still requires `portal_enabled=true`.
3. The backend derives the contact type from `portal_is_group`:
   absent or `false` means `person`; `true` means `group`.
4. Person contacts continue to read
   `portal_client_group_contact_ids` for their bounded list of accessible
   group contacts.
5. Every referenced group contact must have `portal_enabled=true` and
   `portal_is_group=true` before it is exposed as a group thread.

This changes no browser API shape and adds no request-time reads, writes, or
external calls.

## Error Handling And Diagnostics

Contact configuration and upstream availability are separate failure classes:

- a real Chatwoot configuration/request failure remains retryable and is shown
  as `Чат временно недоступен`;
- an invalid portal contact configuration is preserved as a specific
  machine-readable code and is shown with neutral copy such as
  `Чат не подключён. Настройка профиля клиента не завершена. Обратитесь в поддержку.`;
- ordinary contacts with an absent `portal_is_group` value are valid and do not
  enter an error state.

The frontend bootstrap state must retain the backend error code instead of
replacing every non-auth failure with `chatwoot_unavailable`. Diagnostic logs
and responses must not contain email addresses, names, message contents, or
other customer-identifying data.

## Production Rollout

Use a bounded operator cutover for each active tenant:

1. Reconcile the new `portal_is_group` checkbox definition in Chatwoot.
2. Identify the known group contacts from the existing controlled group
   configuration; do not scan every contact from a request path.
3. Set `portal_is_group=true` only on those group contacts.
4. Verify that ordinary customer contacts require no new value and retain
   `portal_enabled=true` where access is intended.
5. Deploy the backend/frontend fix that reads only `portal_is_group`.
6. Verify an ordinary email-code login, private chat bootstrap, and the known
   group threads for both active tenants as applicable.
7. Remove the retired `portal_contact_type` definition only after the new
   runtime checks pass.

No portal-owned user, contact-link, thread, conversation, message, session, or
legal-acceptance rows are migrated or recreated.

## Testing

Required automated coverage:

- contact-attribute unit tests:
  - absent `portal_is_group` resolves to `person`;
  - `false` resolves to `person`;
  - `true` resolves to `group`;
  - non-boolean values fail closed;
  - `portal_enabled` remains mandatory;
- Chatwoot custom-attribute reconciliation tests create or repair
  `portal_is_group` as a checkbox and no longer require
  `portal_contact_type`;
- backend service/integration tests prove:
  - an enabled ordinary contact without the new attribute can list threads and
    open the supported private-chat state;
  - an enabled group with the checkbox can be opened as a group;
  - a referenced contact without the checkbox cannot be exposed as a group;
- frontend tests prove that a configuration error is not rendered as a
  Chatwoot outage and that a real upstream failure remains retryable;
- one end-to-end regression covers email code, authenticated session handoff,
  thread list, and private chat bootstrap for an ordinary contact without a
  group flag.

Before closure, run the targeted tests, required broader backend/frontend
checks for the shared chat bootstrap boundary, lint, build, and
`git diff --check`.

## Load And Security Properties

- No additional per-login, per-request, per-thread, or per-message operation is
  introduced.
- Group membership remains bounded by the existing maximum group-contact ID
  count.
- No tenant-wide or account-wide contact scan is added to runtime.
- `portal_enabled` remains the explicit access gate, so an arbitrary Chatwoot
  contact does not become portal-eligible merely because
  `portal_is_group` defaults to `false`.
- Invalid non-boolean values fail closed.

## Acceptance

- An eligible ordinary customer with `portal_enabled=true` and no
  `portal_is_group` value can complete email-code login and open the private
  chat.
- A group is recognized only when both `portal_enabled=true` and
  `portal_is_group=true`.
- The remaining portal contact attributes behave exactly as before.
- Contact-configuration errors are distinguishable from Chatwoot outages.
- The retired `portal_contact_type` has no runtime reader, writer, test fixture,
  provisioning requirement, or active operator documentation.
- The rollout adds no unbounded work and does not modify Chatwoot core.
