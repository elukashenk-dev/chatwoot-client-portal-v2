# Portal Contact Group Type Clean Rename

## Decision

`portal_contact_type` uses only two supported values:

- `person` - individual customer contact that can log in to the portal;
- `group` - shared customer-side chat target for several portal users.

The old `company` value is retired completely. The portal does not keep
backward compatibility for `company` values, `company:*` thread ids, DB
`thread_type = 'company'`, or company-named custom attributes.

## Contract

Chatwoot custom attributes:

- `portal_contact_type`: `person` or `group`;
- `portal_enabled`: boolean;
- `portal_client_group_contact_ids`: comma-separated Chatwoot contact IDs of
  group contacts available to a person contact.

Portal thread IDs:

- `private:me` - personal support chat;
- `group:<chatwoot_contact_id>` - shared group support chat.

Portal DB:

- `portal_chat_threads.thread_type` supports only `private` and `group`;
- the unique group target index is tenant + Chatwoot contact ID where
  `thread_type = 'group'`;
- no legacy `company` rows are valid in the clean schema.

## Product Language

The product describes these chats as group/shared chats. A company is only one
possible group example. UI and docs should avoid using `company` for the portal
thread model unless they discuss B2B tenants or business customers in general.

## Security And Access

The backend remains the only authority for chat access:

- browser sends only `threadId`;
- backend validates `group:<id>` through current tenant, linked person contact,
  `portal_client_group_contact_ids`, and the target group contact attributes;
- realtime fanout revalidates group access before delivery;
- Chatwoot conversation IDs stay internal backend mappings.

## Testing

Required regression coverage:

- contact attribute parsing accepts `group` and rejects `company`;
- group thread listing/send/recovery uses `group:<id>`;
- forged or revoked group access fails closed;
- frontend thread types and menu/header render group threads correctly;
- old `company:*` thread ids are invalid.
