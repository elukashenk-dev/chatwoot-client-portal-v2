# Unified Email-Code Access Design

Status: implemented locally on `feature/auth-email-code-primary`; pending user
acceptance, checkpoint commit, merge and production deployment.

This spec supersedes the future implementation direction from
`docs/superpowers/specs/2026-06-26-passwordless-registration-design.md`.
The old document remains historical context; the active implementation removes
the separate registration flow.

## Goal

Remove customer-facing registration as a separate product concept.

The customer should have one primary access path:

1. enter email;
2. confirm email with a code;
3. if legal consent is required, accept the current tenant legal documents;
4. enter chats.

If the email already belongs to an active portal user, the user is admitted
after code verification. If the email is not in portal users but matches a
Chatwoot contact in the current tenant account, the portal creates the user only
after the email code and legal consent are complete.

Passwords remain optional. Password login stays as a secondary path only for
users who already set a password.

## Product Model

There is no visible `Регистрация` or `Активировать доступ` route.

The primary auth screen is `Вход для клиентов` with email-code access. It should
not ask the customer to decide whether they are new or returning. The backend
decides eligibility:

- existing active portal user: send code and allow login;
- no portal user, matching Chatwoot contact: send code and continue to legal
  consent before provisioning;
- no portal user and no Chatwoot contact: return the same generic request
  response, send no email, create no portal user.

The separate legal step appears only after a successful email-code verification
when the current customer has no recorded acceptance for the required active
legal versions.

## User Flow

### Email Request

Screen: `Вход для клиентов`.

The customer enters email and requests a code. The response is always generic:
if the email is allowed for this portal, a code is sent.

The UI must not show separate links for registration or activation. A secondary
password-login link may remain for users who already set a password.

### Code Verification

Screen: email-code verification.

After a valid code:

- if the backend can complete access immediately, it issues the customer
  session and returns `nextStep: "chat"`;
- if legal consent is required, it does not issue a customer session yet and
  returns `nextStep: "accept_legal"` with a short-lived continuation token;
- if the code is invalid, expired or invalidated, the UI shows the same code
  error family as today.

The continuation token is not a browser auth token. It cannot open chat or
access protected APIs. It only allows the next legal-consent submission for the
verified email-code attempt and expires quickly.

### Legal Consent

Screen: `Принять условия`.

The screen shows two explicit checkboxes with links to the current tenant legal
documents:

- пользовательское соглашение;
- согласие на обработку персональных данных.

The customer cannot continue until both checkboxes are checked. The submit
button should be direct: `Продолжить в чат`.

After successful submission:

- if the portal user already exists, record the acceptance for that user and
  issue a session;
- if this is a first access from a Chatwoot contact, create the portal user
  with `password_hash = null`, create the contact link, record the legal
  acceptance and issue a session in one transaction.

If the customer leaves this screen, no first-time portal user is created.

## Backend Design

The product contract becomes unified email-code access. The public endpoints
should live under the code-login auth boundary, for example:

- `POST /api/auth/code-login/request`;
- `POST /api/auth/code-login/verify`;
- `POST /api/auth/code-login/accept-legal`.

Separate registration endpoints are removed from the active contract:

- `POST /api/auth/register/request`;
- `POST /api/auth/register/verify`;
- `POST /api/auth/register/set-password`;
- `POST /api/auth/register/skip-password`.

Implementation may reuse existing verification-record fields and repository
helpers, but the final active model should not keep a parallel registration
service or route surface.

### Request Algorithm

For a normalized email inside the current tenant:

1. Apply endpoint and email-scoped rate limits.
2. Look up any portal user by `tenant_id + email`.
3. If found, create or replace a pending email-code record tied to the portal
   user and send the code only when that user is active.
4. If the portal user exists but is inactive, return the generic accepted
   response without Chatwoot lookup, email delivery or first-access
   provisioning.
5. If not found, call `ChatwootClient.findContactByEmail()` for the current
   tenant Chatwoot account.
6. If an eligible contact is found, create or replace a pending email-code
   record tied to the Chatwoot contact snapshot and send the code.
7. If no eligible contact is found, return the same generic accepted response
   without sending email and without creating portal-owned user data.

Chatwoot lookup happens only for emails that do not have any portal user in the
current tenant. It happens outside DB transactions/advisory locks; the write
path repeats portal-user and pending record validation under lock before
creating/replacing the verification record.
Verification and legal acceptance use the stored pending record instead of
calling Chatwoot again.

### Verify Algorithm

For a valid pending code:

1. If the pending record has an active portal user and the user has the required
   current legal acceptance, consume the code and issue a customer session.
2. If legal consent is missing, mark the verified attempt with a short-lived
   continuation token and return `nextStep: "accept_legal"`.
3. If the pending record has only a Chatwoot contact, return
   `nextStep: "accept_legal"` with the same short-lived continuation token.
4. Expired, invalidated or over-attempted records are not extended.

The code must be consumed or advanced in a way that prevents replay. A second
submit from another tab should either use the same still-valid legal
continuation or receive a controlled invalidated response.

### Legal Acceptance Algorithm

For a valid legal continuation:

1. Verify both legal checkboxes are true.
2. Load current active tenant terms and privacy/personal-data document versions.
3. If active documents are missing, fail closed with a controlled support
   message and create no first-time portal user.
4. In one tenant-scoped transaction:
   - create the portal user if needed;
   - create the portal user to Chatwoot contact link if needed;
   - record legal acceptance with document versions, IP and user-agent;
   - consume the continuation;
   - issue the customer session with fresh email proof.

Unique constraints on `tenant_id + email` and contact links remain the race
protection. If two legal submissions race, only one should create the user; the
other should resolve to the created user or fail with a controlled consumed
attempt response.

## Frontend Design

The active auth routes become:

- `/auth/login` - email-code request;
- `/auth/login/verify` - code verification;
- `/auth/login/legal` - legal consent after verified code;
- `/auth/login/password` - secondary password login;
- password reset routes remain unchanged.

Registration routes and registration-specific components are removed from the
active app routing.

The primary login copy should describe the actual user action, not account
creation. A good baseline:

- title: `Вход для клиентов`;
- field helper: `Введите email, который вы используете для общения с поддержкой.`;
- action: `Получить код`;
- secondary link: `Войти по паролю`.

The legal consent screen should be short and task-focused. It should not ask
for password creation and should not mention registration.

## Security And Privacy

- Browser never receives Chatwoot authority.
- Browser receives no reusable auth token before the customer session cookie.
- The legal continuation token is short-lived, one-flow, and cannot read
  protected APIs.
- Unknown emails get the same request response as eligible emails.
- Portal users are not created until email proof and legal consent are complete.
- Chatwoot contact existence is not revealed through request responses.
- Existing password login must keep generic invalid-credentials behavior for
  null-password users.
- All rows are tenant-scoped.

## Load And Abuse Controls

The flow must avoid adding high-volume writes or Chatwoot calls to ordinary
session checks.

- `/api/auth/me` behavior is unchanged.
- Existing portal users do not trigger Chatwoot lookup during code request.
- Verification does not call Chatwoot.
- Unknown emails do not create portal users.
- Endpoint rate limits and email-scoped resend cooldown stay mandatory.
- The request path is the only place where first-time eligibility may call
  Chatwoot, and only after the portal-user lookup misses.

If production traffic later shows abusive many-unique-email probing, add a
tenant/IP-scoped abuse control before increasing Chatwoot lookup volume. Do not
solve that by creating placeholder portal users.

## Testing Scope

Backend tests:

- existing portal user can request code, verify code and get session;
- Chatwoot contact without portal user can request code, verify code, accept
  legal, create portal user/contact link and get session;
- unknown email gets generic request response, sends no email and cannot verify;
- first-time verified user cannot skip legal consent;
- existing users with stale legal acceptance are routed to legal consent before
  receiving a session;
- inactive portal users do not enter first-access Chatwoot provisioning;
- request cooldown does not repeat Chatwoot lookup;
- missing active legal documents fail closed before first-time user creation;
- expired/invalidated code and continuation records are not extended;
- tenant A cannot use tenant B user/contact/code records.

Frontend tests:

- login page has no registration or activation link;
- code verify routes to chat or legal based on backend `nextStep`;
- legal screen requires both checkboxes and submits the continuation;
- password login remains reachable as a secondary path;
- branding preview no longer renders registration/activation actions.

Browser smoke after implementation:

- first-time Chatwoot contact: email -> code -> legal -> chat;
- returning passwordless user after logout: email -> code -> chat;
- user with password: password route still works.

## Documentation Updates After Implementation

After implementation closes, update stable docs:

- `docs/architecture/overview.md`;
- `docs/architecture/decisions.md`;
- `docs/roadmap/work-log.md`;
- local and production auth runbooks that still mention registration endpoints.

The update should state that customer registration is no longer a separate
portal flow. Portal account provisioning happens through verified email-code
access for eligible Chatwoot contacts.
