# PROVGROUP User Guide PDF Design

## Goal

Create a user-facing PDF guide for the PROVGROUP client portal at
`https://lk.provgroup.ru`.

The guide must explain, in non-technical Russian:

- how to use the correct PROVGROUP communication email without exposing
  internal admin/support-system access rules;
- how to open the client cabinet in a browser;
- how to sign in with email code;
- how passwordless access works;
- how to set and use a password;
- how to install the client cabinet as an app on Android and iPhone, including iOS
  Safari/Chrome manual add-to-home-screen flow;
- how to use chat, profile, password setup and returning sign-in.

## Approved Format

Use the approved "B. Пошаговая инструкция" structure:

- 11 pages;
- one user action per step where possible;
- screenshots without overlay labels that cover the UI;
- short numbered explanations placed next to the screenshot;
- PROVGROUP-specific domain and branding;
- safe demo data only, no real user personal data.

## Page Plan

1. Open `lk.provgroup.ru` in the browser and enter the email used for
   communication with PROVGROUP.
2. First sign-in by email code.
3. Enter the email code.
4. Accept legal terms and personal-data consent.
5. Install on Android through Chrome, including the menu-based path if the user
   dismissed the install banner.
6. Install on iPhone through Safari or Chrome.
7. Main chat and sending a message, with the passwordless access explanation
   and group-chat selection from the left menu when groups are available.
8. Profile and password setup.
9. Returning without password: sign in by email code.
10. Password sign-in for users who already set a password.
11. Support contacts and quick troubleshooting.

## Screenshot Rules

- Use current portal UI, not drawn approximations, for portal screens.
- Capture with Playwright using safe mock API responses where protected screens
  are needed.
- Use realistic but non-sensitive demo values:
  - email: `client@example.com`;
  - phone: `+7 (900) 000-00-00`;
  - name: `Иван Петров`.
- Do not place labels, arrows or notes on top of portal UI screenshots.
- Put explanations in surrounding PDF text or numbered side notes.
- For Android install, show the real portal PWA install banner triggered by the
  Chromium `beforeinstallprompt` flow.
- For iPhone install, show the real portal iOS manual install instruction state
  from `PwaInstallBanner`.
- The iPhone install guide text must describe reading the already opened
  instruction state with the `Понятно` button, not pressing `Установить`.
- The iOS wording must not imply Safari is the only supported browser; Chrome on
  iPhone/iPad can also add websites to the Home Screen through its share menu.
- Do not use drawn browser/device mockups for install steps.

## Installation Wording

- Installation wording must stay generic and user-facing.
- Do not render source/reference lines in the final user-facing PDF.
- Do not imply Safari is the only supported browser for iPhone/iPad install.
- Do not explain internal access preconditions with terms like "known client",
  "admin system" or "contact must be registered"; keep those details only as a
  soft support fallback if sign-in fails.

## Output

Deliver a PDF file in the repository, plus any source HTML/assets needed to
regenerate it.
