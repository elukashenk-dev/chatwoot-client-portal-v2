# F-AUTH-001 Password Reset Generic Copy

- `status`: `deferred`
- `found_in`: production sanity check after `F-PROD-001`
- `risk`: `low`
- `urgency`: non-urgent UX polish; fix in a future auth/password-reset copy pass
- `area`: frontend password reset UX, account enumeration-safe copy
- `evidence`:
  - Backend password reset intentionally returns a generic accepted response for missing accounts and does not send email.
  - `frontend/src/features/auth/pages/PasswordResetVerifyPage.tsx` currently says "Мы отправили 6-значный код на ..." after any accepted reset request.
  - For an unregistered email this is security-correct backend behavior but confusing UI copy, because no email should be sent.
- `fix_short`: Change password reset request/verify/resend copy to account-enumeration-safe wording such as "Если доступ для этого email активен, мы отправили код восстановления."
- `acceptance`:
  - Missing-account reset request still does not disclose account existence.
  - UI no longer promises that an email definitely was sent for every accepted reset request.
  - Existing registered-account password reset flow copy remains clear enough for users to continue.
