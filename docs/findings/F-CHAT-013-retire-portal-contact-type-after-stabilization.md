# F-CHAT-013: Retire legacy contact-type definition after stabilization

- `status`: `deferred`
- `found_in`: safe two-stage production rollout of `F-CHAT-012` on 2026-07-16
- `risk`: `low`
- `urgency`: review no earlier than 2026-07-23 and remove only after explicit
  operator approval; the current portal runtime does not read this definition
- `area`: production Chatwoot contact custom-attribute governance and rollback
  readiness
- `evidence`: the reviewed portal runtime and provisioning contract use only
  `portal_enabled` plus the boolean `portal_is_group`, but the retired
  `portal_contact_type` Chatwoot definition was intentionally retained during
  the stabilization window so the prepared pre-cutover runtime can still be
  used as an emergency rollback
- `fix_short`: after the stabilization window, replace the old-runtime rollback
  dependency with a forward-fix decision, delete only the retired
  `portal_contact_type` definition through the approved Chatwoot operator UI,
  then recheck one ordinary and one group chat
- `acceptance`: explicit removal approval is recorded, the operator confirms
  that rollback no longer depends on the old definition, the definition is
  absent in Chatwoot, and a bounded ordinary/group production smoke passes

## Boundaries

- Do not add a runtime compatibility reader or writer for
  `portal_contact_type`; current portal code must continue to ignore it.
- Do not scan or rewrite all contacts. Removing a custom-attribute definition
  is a separate bounded operator action.
- Do not remove the definition automatically when this finding is reviewed.
  A fresh explicit production approval is required.
- If rollback is required before retirement, restore the prepared old runtime
  while the definition is still present. After retirement, use a forward fix
  unless an operator explicitly restores the old definition first.
