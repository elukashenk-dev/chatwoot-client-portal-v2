# F-PROD-002. Release Source Remote Drift

- `status`: `open`
- `found_in`: Security & Production Hardening Review
- `risk`: `low`
- `urgency`: before relying on remote git as production recovery/audit source
- `area`: production deploy provenance, release control
- `evidence`:
  - Production `DEPLOY_SOURCE.txt` records clean deployment from `main` commit `7bf94fe9159c9bc7a05fc0ffd79863f3cb01a71a`.
  - Local `main` points to the same deployed commit, but `origin/main` is still at `4e04b99902ada06f93de6a1eae29aa60588955f0`.
  - `git log --left-right --cherry-pick origin/main...main` shows the deployed production commit and many earlier commits exist only on local `main`, not remote `origin/main`.
- `fix_short`: Push the reviewed `main` history to the chosen remote or define another explicit release source of truth, such as signed release tags, before treating the remote as recovery/audit authority.
- `acceptance`:
  - The production `DEPLOY_SOURCE.txt` commit exists in the chosen remote source of truth.
  - `main` and `origin/main` drift is intentional and documented, or eliminated.
  - Future deploys keep recording clean commit, branch and dirty-state provenance.
