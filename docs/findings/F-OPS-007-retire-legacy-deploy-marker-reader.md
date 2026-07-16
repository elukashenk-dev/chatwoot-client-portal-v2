# F-OPS-007: Retire legacy deploy marker reader

- status: deferred
- found_in: Production staged deployment transition 2026-07-16
- risk: low
- urgency: Remove immediately after the first successful real staged production activation establishes `.release-state/current`.
- area: Production deploy source marker transition
- evidence: `scripts/production-release-records.sh` temporarily reads the pre-staged `DEPLOY_SOURCE.txt` fields so the current exact clean runtime can be imported as the first rollback release.
- failure_path: Leaving the reader indefinitely would preserve an obsolete operational compatibility path after staged state is authoritative.
- counterevidence: The reader accepts only the exact clean full-SHA marker, is disabled whenever staged `current` exists, and cannot authorize activation by itself.
- load_impact: None; this is one record read during first staged adoption only.
- fix_short: After the first successful staged production activation, remove legacy marker parsing and its fixtures in a separately approved follow-up.
- acceptance: Production has a verified staged `current` release; the legacy parser, allow-legacy branch and legacy fixtures are removed; focused ops tests, lint/build and review gates pass.
