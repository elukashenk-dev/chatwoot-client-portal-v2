# F-AUTH-002. Password Reset Password Policy Drift

- `status`: `open`
- `found_in`: `MT-8R-3 Code Smells Review`
- `risk`: `medium`
- `urgency`: fix before adding new admin password/challenge flows in `MT-9`
- `area`: backend password reset, registration, frontend auth validation
- `evidence`:
  - `backend/src/modules/registration/routes.ts` and
    `backend/src/modules/registration/service.ts` require a new password to have at
    least 8 characters, a letter and a digit.
  - `frontend/src/features/auth/lib/passwordResetSetPasswordValidation.ts` applies
    the same 8 characters + letter + digit rule for password reset.
  - `backend/src/modules/password-reset/routes.ts` and
    `backend/src/modules/password-reset/service.ts` currently require only 8
    characters for password reset.
  - This means the browser UI rejects weak reset passwords, but the backend reset
    endpoint can still accept them when called directly.
- `fix_short`: Extract or duplicate the same backend password policy for
  registration and password reset, update the password reset route schema/service
  error copy, and add backend tests that reject reset passwords missing a letter or
  digit.
- `acceptance`:
  - Registration and password reset enforce the same backend password rule.
  - Password reset route validation rejects passwords without a letter or without a
    digit.
  - Password reset service tests cover both missing-letter and missing-digit cases.
  - Existing frontend validation remains aligned with backend behavior.
