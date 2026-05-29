# F-OPS-001. Apt Daily Upgrade Can Break Chatwoot Realtime

- `status`: `deferred`
- `found_in`: production realtime incident review, `2026-05-29`
- `risk`: `medium`
- `urgency`: fix before real production users or before relying on Chatwoot realtime for support SLAs
- `area`: production operations, Chatwoot realtime, systemd maintenance
- `evidence`:
  - On `2026-05-29` the production VM ran the standard Ubuntu
    `apt-daily-upgrade.timer`.
  - The timer restarted system services including Redis/PostgreSQL/network
    services, while `chatwoot-web.1` and `chatwoot-worker.1` kept running as old
    processes.
  - After that, Chatwoot messages were persisted and became visible after page
    reload, but realtime delivery in the Chatwoot admin and website widget was
    unreliable.
  - Restarting only `chatwoot-web.1` and `chatwoot-worker.1` restored fresh
    `/cable` subscriptions without touching Redis or Postgres.
- `fix_short`: Move OS package upgrades into a controlled maintenance workflow.
  Decide whether to disable `apt-daily-upgrade.timer` or keep it only with an
  automatic post-upgrade Chatwoot restart/check hook. After Redis or package
  upgrades, restart only `chatwoot-web.1` and `chatwoot-worker.1`, then verify
  `/cable`, Chatwoot admin realtime, website widget realtime and portal webhook
  delivery.
- `acceptance`:
  - Production ops docs describe the chosen policy for `apt-daily.timer` and
    `apt-daily-upgrade.timer`.
  - The policy is applied on the production VM.
  - The runbook includes exact commands for controlled OS upgrade and Chatwoot
    realtime validation.
  - A Redis restart or OS upgrade cannot leave Chatwoot web/worker running with
    a stale realtime connection without an explicit restart/check step.
