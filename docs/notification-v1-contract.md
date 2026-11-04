# Notification contract boundary

This document defines the shared contract for Epic 13 (`SCRUM-304`) and the
first executable contract task (`SCRUM-781`). Runtime behavior remains owned by
`service_notification`; this repository owns the wire shape, compatibility
rules, authorization vocabulary, and deterministic fixtures.

## Ownership and route registry

Notification intake accepts only routes registered by the Notification service.
Each route has an exact `routeKey`, a positive `routeVersion`, a source event
type, an owning service, and a recipient resolver. The initial registry is
partitioned by the owning domain:

| Domain | Owner | Resolver boundary | Required route properties |
| --- | --- | --- | --- |
| auth | `service_authentication` | User/authorization boundary | account reference and source aggregate revision |
| booking | `service_booking` | User/authorization boundary | booking party or assigned role, partition, and source revision |
| operations | `service_operations` | User/authorization boundary | site/branch partition and role subscription |
| finance | `service_finance` | User/authorization boundary | authorized finance recipient and policy revision |
| system | platform owner | User/authorization boundary | explicit system recipient and repair authorization |

An unknown route, unsupported route version, invalid envelope, or schema
mismatch is rejected before a notification or delivery intent is created.
Consumers store the source event ID, route key/version, recipient-resolution
revision, and source aggregate revision; they do not copy unrestricted source
payloads or query another service's database.

## Channels, templates, and contacts

`IN_APP` and `EMAIL` are required channels. `PUSH` is optional and is created
only when all of the following are true:

- the global push feature flag is enabled;
- the notification type allows push;
- the recipient preference allows push; and
- a valid device-token reference exists.

Required channels cannot be disabled by a recipient preference. A published
template revision and notification policy revision are frozen into every
delivery intent. Published revisions are immutable; edits create a new
revision and retirement preserves historical records.

The recipient resolver returns an account/type, a contact snapshot revision,
and a masked display value. Delivery workers may store an encrypted destination
snapshot owned by Notification, but events, GraphQL responses, logs, and test
evidence must never contain a raw destination, provider credential, or raw
provider payload.

## Authorization and field groups

GraphQL operations declare the narrowest scope available:

| Capability | Scope |
| --- | --- |
| inbox, stream, read state | `notifications:read` |
| preference update | `notifications:preferences:manage` |
| template listing | `notifications:template:read` |
| template publication/retirement | `notifications:template:publish` |
| delivery/provider operations | `notifications:operations:read` |
| delivery retry | `notifications:delivery:retry` |
| recipient exception listing | `notifications:recipient-exception:read` |
| recipient exception repair | `notifications:recipient-exception:repair` |

Response fields are grouped as `SUMMARY`, `DOCUMENT`, `PII`, `TRUST_DETAIL`,
and `INTERNAL_AUDIT`. A caller's permission to read an object does not grant
all of its field groups. Recipient operations remain account/partition bound;
cross-recipient and cross-partition requests fail closed without confirming
the other recipient's data.

Mutations that can be retried require an idempotency key. Mutations that can
race require an expected version. A changed request under an existing
idempotency key is rejected rather than replayed with a different effect.

## Event versioning

The existing `vistay.notification.notification-created` v1 contract remains
available for current consumers. The additive v2 contract carries route,
recipient-account type, source revision, template/policy revisions, channel
policy, inbox revision, and the decimal cursor. New consumers should use v2.

The following v1 event contracts are also defined:

- `vistay.notification.delivery-state-changed` for bounded delivery state and
  provider error classification;
- `vistay.notification.recipient-exception-recorded` for auditable recipient
  resolution failures and repair state.

Event `version` is the schema version and `aggregateVersion` is ordering state;
they are never interchangeable. A breaking change creates a new event version
or a new GraphQL contract. Legacy consumers are not forced to understand new
fields.

## Provider boundary and error classification

Provider requests include a scoped idempotency key, timeout, template/policy
revision, and encrypted destination snapshot reference. Provider responses are
normalized to stable classes: `TRANSIENT`, `PERMANENT`, `RATE_LIMITED`,
`PROVIDER_OUTAGE`, `INVALID_CONTACT`, `BOUNCED`, or `UNKNOWN`. Retry policy is
bounded by maximum attempts and maximum age; exhausted work enters a visible
dead-letter/repair state. Provider-specific payloads and secrets do not cross
the contract boundary.

## SSE cursor and retention

The Backoffice subscription uses an account-bound, non-negative decimal cursor
with exclusive resume semantics. Frames are `AT_LEAST_ONCE`; duplicate frames
are valid. Clients deduplicate using `(notificationId, notificationRevision)`
and persist the last durably processed cursor before reconnecting.

The transport contract specifies bounded connection duration, heartbeat,
batch/backpressure limits, cursor retention, and `RESYNC_REQUIRED` behavior
when a cursor expires. An expired cursor must trigger inbox reconciliation from
the retained watermark; it must not silently skip entries or claim exactly-once
display.

## Fixtures and verification

`fixtures/notifications/` contains valid list/stream/read/retry/contact/push
cases and negative cases for cross-recipient access, mandatory-channel disable,
raw provider data, unbounded retry, exactly-once claims, and incompatible v1
changes. Run:

```text
npm run validate:notifications
npm run validate:graphql
npm test
```

The event examples are validated by `npm run validate:events` against the
versioned JSON Schemas.
