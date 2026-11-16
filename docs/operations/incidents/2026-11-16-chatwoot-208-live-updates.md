# Chatwoot conversation 208 requires a reload

- Date: 2026-11-16; portal production baseline `4f83429`.
- Status: bounded recovery completed after explicit user approval; live event
  transport verified; the user subsequently confirmed normal live updates.
- User confirmed that the page requiring reload is Chatwoot, account 1,
  conversation display ID 208.
- No message was sent/replayed, no Chatwoot data or configuration was changed.
  A diagnostic subscription used the existing portal service identity and its
  normal transient presence flow; credentials and message bodies were not logged.

## Evidence

The Chatwoot read API already contains incoming messages 7647, 7648 and 7653,
created at 15:44:07, 15:46:15 and 15:54:51 UTC, respectively, with status `sent`.
Sidekiq started their `message.created` ActionCableBroadcastJob executions at
15:44:08.597, 15:46:15.680 and 15:54:53.942. The sampled worker journal contains
131 completed ActionCableBroadcastJob executions since 15:30 UTC; no webhook
Net::ReadTimeout was found in that sample. This separates successful ingestion
from failed live display; it does not prove receipt by the user's browser.
The three exact broadcast jobs also completed successfully, in 2.41, 2.72 and
2.40 ms respectively; this is not only evidence of their enqueue/start.

Systemd reports Chatwoot web/worker running since 2026-09-28 07:33:30 UTC, and
Redis restarted on 2026-10-07 06:02:18 UTC. Before recovery, Redis had zero pubsub
channels and zero subscriber connections while publishers and Sidekiq are active.

A controlled TLS WebSocket connection to `/cable` used the existing service
user from authenticated `GET /api/v1/profile`, `RoomChannel`, its pubsub token,
account_id and user_id. Over 20 seconds it received HTTP upgrade, one welcome
and six ping frames, but **no subscription confirmation, rejection or event**.
Redis still had zero pubsub channels/subscriber connections while that connection
was open. Recent web logs show the upgrade without authentication/command errors.
The probe closed its socket normally. No chat message was created.

The installed Chatwoot source is `4feb653c44ffb7ad8e608f8f640630ac1c0652c1`
(the existing 4.17.1-based deployment); cable.yml has no reconnect_attempts
configuration. These observations match the disconnected ActionCable subscriber
failure described by [upstream issue 14705](https://github.com/chatwoot/chatwoot/issues/14705)
and the project's prior [F-OPS-001](../../findings/F-OPS-001-apt-daily-chatwoot-realtime.md).
Redis's later restart is a strong candidate trigger, not proof that this specific
failure began on October 7: the exact original disconnection exception has not
been established. No claim is made that the portal deployment restarted Redis
or Chatwoot; both processes predate it.

## Bounded recovery proposal

After authorization for the specific Chatwoot maintenance operation:

```sh
sudo systemctl restart chatwoot-web.1.service
```

Restart only the web service. The worker is processing broadcasts; do not restart
it, Redis, PostgreSQL, Nginx or portal containers. Brief interruption of Chatwoot
HTTP/WebSocket access and portal requests to Chatwoot is expected during startup.
No code/configuration/database migration or rollback is needed for this step.
The web unit has no BindsTo or PropagatesStopTo dependency; PartOf points to
chatwoot.target, so restarting this child does not restart the target or worker.
Its configured stop timeout is 30 seconds.

Required validation: bounded HTTP/API readiness, changed web process start time,
unchanged worker/Redis process start times, and the same authenticated WebSocket
probe now receiving subscription confirmation with live Redis subscriptions.
An ordinary presence event may validate the transport without sending a chat
message. If readiness or subscription still fails, preserve evidence and stop
for diagnosis; do not chain broader service restarts.

The permanent maintenance/reconnection policy remains the separate deferred
F-OPS-001 scope. A successful restart does not close that preventive finding.

## Review

Independent read-only review found no blocker to the single explicitly authorized
web-service restart. The reviewer confirmed the bounded service dependencies and
required post-restart checks above; the original Redis restart remains a suspected
trigger rather than a proven cause. Review ran with unrestricted tool permissions
and a read-only task instruction, not an enforced read-only sandbox.

## Recovery result

The user explicitly authorized restarting only `chatwoot-web.1.service`.
Exactly one restart completed successfully; the web service became active at
2026-11-16 16:13:24 UTC (20:13:24 Europe/Samara), PID 4140365.
The worker remained PID 1250 with its September 28 start time; Redis remained
PID 3303383 with its October 7 start time. No other service was restarted.

Chatwoot public HTTP and authenticated profile API returned 200. The same
20-second authenticated RoomChannel probe now received one welcome, one
`confirm_subscription`, six ping frames and two `presence.update` events after
one normal presence action. While it was open, Redis reported three pubsub
channels and one subscriber connection, versus zero before recovery.
No chat message was sent/replayed and no message status was changed.
The portal public health endpoint also remained healthy.

This validates recovery of the previously failed live-event transport, not an
end-to-end observation of a newly sent message in the user's browser. No app test
suite was repeated for this service-only operation. The preventive F-OPS-001
finding remains deferred; recovery alone does not prevent recurrence.

The user subsequently checked the ordinary browser flow and confirmed that
live updates work (2026-11-16). The incident is resolved; preventive work remains
in F-OPS-001.
