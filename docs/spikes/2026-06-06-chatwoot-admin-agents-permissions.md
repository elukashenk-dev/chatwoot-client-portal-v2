# Chatwoot Admin Agents Permissions Spike

## Статус

Статус: completed source/runtime-boundary spike для `F-MT-004`.

Дата сверки: `2026-06-06`.

Цель: проверить, как безопасно использовать Chatwoot Agents API для будущего
tenant admin login, не превращая runtime Chatwoot token в implicit admin
authority.

## Проверенные Источники

Официальные источники:

- Chatwoot API introduction:
  `https://developers.chatwoot.com/api-reference/introduction`
- Agents endpoint:
  `https://developers.chatwoot.com/api-reference/agents/list-agents-in-account`
- OpenAPI tag `v4.13.0`:
  `https://raw.githubusercontent.com/chatwoot/chatwoot/v4.13.0/swagger/tag_groups/application_swagger.json`
- OpenAPI branch `develop`:
  `https://raw.githubusercontent.com/chatwoot/chatwoot/develop/swagger/tag_groups/application_swagger.json`

Локальный source Chatwoot CE:

- version: `v4.13.0-1-g38c6b79b4`
- `../chatwoot-ce-stable/app/controllers/api/v1/accounts/agents_controller.rb`
- `../chatwoot-ce-stable/app/controllers/api/v1/accounts/base_controller.rb`
- `../chatwoot-ce-stable/app/controllers/concerns/access_token_auth_helper.rb`
- `../chatwoot-ce-stable/app/controllers/concerns/ensure_current_account_helper.rb`
- `../chatwoot-ce-stable/app/policies/user_policy.rb`
- `../chatwoot-ce-stable/app/views/api/v1/models/_agent.json.jbuilder`
- `../chatwoot-ce-stable/app/models/account_user.rb`

## Endpoint

```text
GET /api/v1/accounts/{account_id}/agents
Header: api_access_token=<user access token>
```

Официальная docs/OpenAPI модель:

- auth scheme: `userApiKey`;
- success: `200`, array of active agents;
- access denied: `403`;
- response fields include `id`, `account_id`, `email`, `role`, `confirmed`,
  `availability_status`, `auto_offline`, `available_name`, `name`, `thumbnail`,
  `custom_role_id`.

## Source Findings

Local Chatwoot CE `v4.13.0-1-g38c6b79b4`:

- `AgentsController#index` returns
  `Current.account.users.order_by_full_name.includes(...)`.
- `UserPolicy#index?` returns `true`.
- `EnsureCurrentAccountHelper` sets `Current.account_user` through
  `account.account_users.find_by(user_id: current_user.id)` and rejects account
  access when the token owner is not a user in that account.
- `AccessTokenAuthHelper` accepts user access tokens for Application API
  requests.
- Agent bot tokens are limited by `BOT_ACCESSIBLE_ENDPOINTS`; `agents#index` is
  not in that allowlist.

Implication:

- a confirmed account user token can reach `agents#index` if that user belongs
  to the account;
- source does not make `agents#index` administrator-only;
- a user token from another account is rejected by current-account guard;
- a bot token is rejected for this endpoint;
- portal admin eligibility must be checked by portal code, not inferred from
  endpoint access.

## Response Drift

`availability_status` is not relevant for admin eligibility.

Known drift:

- current official docs/develop OpenAPI and local runtime source use
  `online`, `busy`, `offline`;
- official `v4.13.0` OpenAPI tag and bundled local swagger describe
  `available`, `busy`, `offline`.

Decision:

- admin verification parser must ignore `availability_status`, `auto_offline`
  and extra response fields;
- eligibility uses only normalized `email`, `account_id`, `role` and
  `confirmed`.

## Operational Token Policy

Selected policy:

- runtime Chatwoot token remains only for customer portal runtime:
  contact/profile/chat/send/webhook helpers;
- tenant admin verification uses a separate nullable encrypted per-tenant token:
  `portal_tenants.chatwoot_admin_verification_token_ciphertext`;
- browser never receives runtime token, admin-verification token or platform
  token;
- platform/provisioning token is not accepted as tenant admin login authority;
- missing, invalid or insufficient admin-verification token fails closed.

## Implemented Verification Boundary

Implemented in this slice:

- schema/migration adds nullable
  `portal_tenants.chatwoot_admin_verification_token_ciphertext`;
- tenant runtime context does not expose this token;
- repository exposes a dedicated admin verification config lookup;
- admin verification service decrypts the admin-verification token only inside
  tenant admin boundary;
- Chatwoot Agents parser tolerates extra fields and ignores availability status;
- service requires:
  - normalized email match;
  - `account_id === current tenant.chatwoot_account_id`;
  - `role === "administrator"`;
  - `confirmed === true`.

## Runtime Matrix

| Token owner                          | Source result / implemented behavior                                |
| ------------------------------------ | ------------------------------------------------------------------- |
| confirmed administrator in account A | endpoint can list; portal accepts only matching administrator row   |
| confirmed agent in account A         | endpoint may list; portal denies because role is not administrator  |
| user from another account            | Chatwoot current-account guard rejects access                       |
| agent bot token                      | Chatwoot bot endpoint allowlist rejects access                      |
| invalid token                        | Chatwoot request fails; portal returns controlled fail-closed state |
| runtime token candidate              | not used by tenant admin verification service                       |
| separate admin-verification token    | selected operational token boundary                                 |

Non-destructive live curls were not run in this repository session because the
working environment does not provide live admin-verification credentials. The
implemented tests cover the portal-owned security invariants and permission
failure behavior; live token issuance can be checked operationally when MT-9B
admin login is wired.

## Closure

`F-MT-004` can be closed by this implementation because:

- schema stores a separate encrypted tenant admin-verification token;
- code path defines the token boundary explicitly;
- tenant admin verification never accepts runtime token as implicit admin
  authority;
- insufficient Chatwoot permission is fail-closed;
- cross-tenant admin attempts are rejected unless the current tenant account has
  a confirmed administrator row for the email.
