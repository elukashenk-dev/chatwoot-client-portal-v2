status: deferred
found_in: production realtime incident review, 2026-05-29
risk: medium
urgency: Fix before real production users or before relying on Chatwoot realtime for support SLAs.
area: production operations, Chatwoot realtime, systemd maintenance

# Apt Daily Upgrade Can Break Chatwoot Realtime Until Chatwoot Restarts

## evidence

- On 2026-05-29 the production VM ran the standard Ubuntu
  `apt-daily-upgrade.timer`.
- The timer restarted system services including Redis/PostgreSQL/network
  services, while `chatwoot-web.1` and `chatwoot-worker.1` kept running as old
  processes.
- After that, Chatwoot messages were persisted and became visible after page
  reload, but realtime delivery in the Chatwoot admin and website widget was
  unreliable.
- Restarting only `chatwoot-web.1` and `chatwoot-worker.1` restored fresh
  `/cable` subscriptions without touching Redis or Postgres.

## fix_short

Move OS package upgrades into a controlled maintenance workflow:

- decide whether to disable `apt-daily-upgrade.timer` or keep it only if there
  is an automatic post-upgrade Chatwoot restart hook;
- document a production maintenance runbook for OS upgrades;
- after Redis or package upgrades, restart only `chatwoot-web.1` and
  `chatwoot-worker.1`;
- verify `/cable`, Chatwoot admin realtime, website widget realtime, and portal
  Chatwoot webhook delivery after maintenance.

## acceptance

- Production ops docs describe the chosen policy for `apt-daily.timer` and
  `apt-daily-upgrade.timer`.
- The policy is applied on the production VM.
- The runbook includes exact commands for controlled OS upgrade and Chatwoot
  realtime validation.
- A Redis restart or OS upgrade cannot leave Chatwoot web/worker running with a
  stale realtime connection without an explicit restart/check step.
