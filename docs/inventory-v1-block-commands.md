# Inventory v1 idempotent block commands

Decision source: SCRUM-359  
Decision date: 2026-10-30  
Change policy: versioned under `inventory-v1`; changes are prospective and must
not reinterpret a committed command outcome or emitted event.

## Boundary and ownership

Booking is the sole writer of inventory blocks. Backoffice callers use the
authenticated GraphQL mutations in this contract through Hive Router; no caller
may write Booking's database or turn Kafka into a synchronous command channel.

This contract creates and releases explicit operator-owned blocks. It does not:

- create a booking, hold, quote, or reservation;
- activate Channex or accept a channel webhook;
- let an operator manufacture a `BOOKING` or `CHANNEL` block;
- update a block's property, type, or date range;
- cancel or hard-delete inventory evidence; or
- define stale, expired, or orphan repair, which belongs to SCRUM-361.

The exact-unit identity, half-open date semantics, block types/statuses, Property
authority, and monotonic per-property revision are inherited from
[`inventory-v1-availability-observation.md`](inventory-v1-availability-observation.md).

## GraphQL contract

The v1 Backoffice surface is:

```graphql
extend type Mutation {
  createInventoryBlock(
    input: CreateInventoryBlockInput!
  ): InventoryBlockCommandResult!

  releaseInventoryBlock(
    input: ReleaseInventoryBlockInput!
  ): InventoryBlockCommandResult!
}

enum OperatorInventoryBlockType {
  MAINTENANCE
  CLEANING
  OWNER_USE
  MANUAL
}

enum InventoryBlockCommandAction {
  CREATED
  RELEASED
}

input CreateInventoryBlockInput {
  idempotencyKey: String!
  propertyId: ID!
  blockType: OperatorInventoryBlockType!
  startDate: String!
  endDateExclusive: String!
  expectedInventoryRevision: String!
  reason: String!
  correlationId: String!
}

input ReleaseInventoryBlockInput {
  idempotencyKey: String!
  propertyId: ID!
  inventoryBlockId: ID!
  expectedInventoryRevision: String!
  reason: String!
  correlationId: String!
}

type InventoryBlockCommandResult {
  commandId: ID!
  idempotencyKey: String!
  requestHash: String!
  inventoryBlockId: ID!
  action: InventoryBlockCommandAction!
  propertyId: ID!
  blockType: InventoryBlockType!
  status: InventoryBlockStatus!
  startDate: String!
  endDateExclusive: String!
  blockVersion: String!
  inventoryRevision: String!
  branchId: ID!
  propertyMembershipVersion: String!
  occurredAt: String!
  releasedAt: String
}
```

`InventoryBlockType` and `InventoryBlockStatus` are the enums defined by the
inventory-v1 availability contract. IDs are canonical UUIDs. Date strings are ISO
`yyyy-MM-dd` local dates and ranges are non-empty half-open intervals
`[startDate, endDateExclusive)`. Timestamps are RFC 3339 UTC strings.

`expectedInventoryRevision`, `blockVersion`, `inventoryRevision`, and
`propertyMembershipVersion` are non-negative base-10 64-bit values encoded as
GraphQL strings. A property with no prior block mutation has revision `0`; a
successful command returns the new positive revision.

An idempotency key is 8 through 160 characters and matches
`^[A-Za-z0-9._:-]+$`. A reason is trimmed and contains 10 through 1000 characters.
The correlation ID is a UUID and is propagated unchanged to audit and event
evidence.

The server derives command ID, block ID, actor, authorization evidence, branch,
membership version, status, versions, timestamps, and event identity. A client
cannot supply or override them.

## State transitions

Create accepts only `MAINTENANCE`, `CLEANING`, `OWNER_USE`, or `MANUAL` and always
creates an `ACTIVE` block. `TENTATIVE` is reserved for controlled Booking/hold
lifecycle behavior. `BOOKING` is written only by the Booking lifecycle, and
`CHANNEL` is written only by a controlled OTA ingestion boundary. Supporting
those internal producers does not authorize them through these GraphQL mutations.

Release verifies that the authoritative stored block belongs to the asserted
`propertyId`. A mismatch is treated as `INVENTORY_BLOCK_NOT_FOUND`, so an opaque
block ID cannot be used as a cross-partition existence oracle. An authorized
release may transition an operator type from `TENTATIVE` or `ACTIVE` to
`RELEASED`. It sets one server timestamp, advances the block version, and leaves
the creation reason and all historical evidence intact.

These mutations never:

- release a `BOOKING` or `CHANNEL` block;
- change `RELEASED` or `CANCELLED` back to a blocking status;
- convert `RELEASED` to `CANCELLED`, or the reverse;
- move a row to another property; or
- update dates or type in place.

An exact release replay returns its original result. A different command key used
after a successful release fails with `INVENTORY_BLOCK_ALREADY_RELEASED` and does
not create a second audit/event fact.

## Authorization and Property evidence

Every command requires an active authenticated Backoffice administrator and an
explicit `inventory:block` permission grant. A role name alone never grants the
operation, and `inventory:update` is not a substitute.

| Active role | Required accepted scope | Record condition |
| --- | --- | --- |
| `SUPER_ADMIN` | explicit `ALL` | Any existing property with an active Property-owned branch membership |
| `MANAGER` | `PARTITION(BRANCH, currentBranchId)` | Property branch equals the administrator's current active branch |

`RECEPTIONIST`, `STAFF`, `CTV`, customer, and host roles cannot use this command
in v1. `OWN`, `SELF`, or `ASSIGNED` without the exact branch partition is rejected.
An `ALL` grant must not elevate a branch-bound Manager. A revoked/inactive role,
missing or foreign branch, unknown scope/partition type, inactive authorization
snapshot, or missing permission fails closed.

Booking resolves Property authority even for `SUPER_ADMIN`. The authoritative
active `branchId` and `propertyMembershipVersion` are captured in the command
outcome. Unknown, unmapped, unavailable, malformed, or mismatched Property
evidence never permits a write. User/Authorization unavailability likewise fails
closed.

Authorization is checked on every call, including an idempotent replay. A caller
whose permission or branch access was revoked cannot use a stored outcome to read
command evidence.

## Expected revision and concurrency

The caller supplies the `inventoryRevision` returned by a recent
`propertyAvailability` observation. Within the write transaction, Booking:

1. reserves or replays the actor-bound idempotency command;
2. acquires the property-scoped transaction advisory lock shared by controlled
   inventory writers;
3. reloads the current property revision, using zero when no revision row exists;
4. compares it with `expectedInventoryRevision`;
5. performs the insert or status transition;
6. reads the new trigger-produced revision; and
7. commits the command outcome, audit fact, and outbox event atomically.

An exact successful replay returns before comparing the now-current revision. A
new command with a stale expected revision fails with `STALE_INVENTORY_REVISION`
and writes no domain state.

The PostgreSQL exclusion constraint over blocking half-open ranges remains the
final concurrency authority. An application availability check or advisory lock
never replaces it. Two commands based on the same expected revision cannot both
advance the property: one may commit and the other fails stale. If a competing
writer does not participate in the advisory-lock protocol, an overlapping insert
still fails with `INVENTORY_BLOCK_CONFLICT`. Adjacent ranges remain valid.

Moving a row between properties is prohibited. Every successful insert or release
increments exactly that property's revision. Replays and failed commands do not
advance it.

## Durable idempotency and request hash

The generic command record is not sufficient historical evidence. Booking stores
an append-only inventory command outcome containing at least:

- command action, key, request hash, command/block/property IDs, and immutable
  response snapshot;
- resulting block status/version and property inventory revision;
- actor account/profile, authorization version, permission, resolved scope,
  branch, and Property membership version; and
- reason, correlation ID, and server occurrence timestamp.

The lowercase hexadecimal SHA-256 request hash uses a domain-separated canonical
sequence. Each value is encoded as:

```text
append(value) = utf8ByteLength(canonicalText(value)) + ":" + canonicalText(value) + ";"
```

The sequence starts with `INVENTORY_BLOCK_COMMAND_V1`, followed by the action. A
create appends, in order: property UUID, block type, start date, exclusive end
date, expected inventory revision, trimmed reason, and correlation UUID. A release
appends: property UUID, block UUID, expected inventory revision, trimmed reason,
and correlation UUID. UUID text is lowercase and hyphenated; revisions use
unsigned base-10 text. The idempotency key and server-derived evidence are excluded.

After current authorization succeeds:

- the same actor, key, action, and normalized payload returns the byte-equivalent
  stored outcome, even if later state changed;
- using the key with another actor, action, or payload fails with
  `IDEMPOTENCY_KEY_REUSED`;
- a committed command without a trustworthy completed outcome fails with
  `IDEMPOTENCY_COMMAND_INCOMPLETE`; and
- a different key represents a new command and is never deduplicated merely
  because its payload resembles an earlier command.

Create/release state, durable outcome, audit, outbox, revision, and generic
idempotency completion commit or roll back together. A replay emits no new audit
or event.

## Stable failures

Failures expose a stable `extensions.code` and sanitized message:

| Code | Condition |
| --- | --- |
| `INVALID_INVENTORY_BLOCK_INPUT` | Invalid/missing UUID, type, reason, or correlation ID |
| `INVALID_INVENTORY_RANGE` | Malformed date, timestamp/hour input, or non-increasing range |
| `INVALID_IDEMPOTENCY_KEY` | Key does not meet the v1 syntax/length rule |
| `UNAUTHENTICATED` | Missing, invalid, or expired caller identity |
| `INVENTORY_BLOCK_FORBIDDEN` | Missing permission, disallowed role/scope, revoked assignment, or foreign branch |
| `AUTHORIZATION_UNAVAILABLE` | User/Authorization cannot provide a trustworthy current snapshot |
| `PROPERTY_NOT_FOUND` | Property authority reports no such exact unit |
| `PROPERTY_PARTITION_UNMAPPED` | Property exists without an active branch membership |
| `PROPERTY_PARTITION_UNAVAILABLE` | Property authority cannot provide trustworthy evidence |
| `INVENTORY_BLOCK_NOT_FOUND` | Block is absent or does not belong to the asserted property |
| `INVENTORY_BLOCK_TYPE_FORBIDDEN` | GraphQL release targets a `BOOKING` or `CHANNEL` lifecycle block |
| `STALE_INVENTORY_REVISION` | Expected property revision no longer equals the current revision |
| `INVENTORY_BLOCK_CONFLICT` | Blocking range violates the authoritative overlap invariant |
| `INVENTORY_BLOCK_ALREADY_RELEASED` | A different command already released the block |
| `INVENTORY_BLOCK_NOT_RELEASABLE` | Block is cancelled or otherwise outside an allowed source state |
| `IDEMPOTENCY_KEY_REUSED` | Actor, action, or normalized payload differs for an existing key |
| `IDEMPOTENCY_COMMAND_INCOMPLETE` | Stored command evidence has no trustworthy completed outcome |
| `INVENTORY_BLOCK_COMMAND_FAILED` | Transaction or stored evidence cannot satisfy this contract |

Conflict and failure responses never expose another block ID, booking ID, channel
external reference, reason, actor, SQL text, token, or dependency address.

## Audit, event, and privacy

Every successful new command records actor account/profile, authorization version,
permission and scope, branch and membership evidence, before/after status, block
type/range, reason, correlation ID, command ID, and resulting inventory revision.
Credentials and customer/guest PII are never stored in command, audit, or event
payloads.

Every successful new create or release also inserts the transactional-outbox event
defined by:

- [`booking.inventory-block-changed.payload.schema.json`](../events/v1/booking.inventory-block-changed.payload.schema.json)
- [`booking.inventory-block-changed.event.schema.json`](../events/v1/booking.inventory-block-changed.event.schema.json)

Wire identity:

- type: `vistay.booking.inventory-block-changed`;
- topic: `vistay.booking.inventory-block-changed.v1`;
- producer: Booking;
- aggregate ID and Kafka key: authoritative `propertyId`;
- aggregate version: resulting `inventoryRevision`;
- envelope `causationId`: command ID; and
- envelope `correlationId`: command input correlation ID.

Envelope `aggregateId` equals payload `propertyId`; envelope `aggregateVersion`
equals payload `inventoryRevision`; and envelope `occurredAt` equals payload
`occurredAt`. The event is emitted at least once after the local commit. API success
does not imply Kafka delivery, and an exact command replay emits no second event.

Consumers validate the complete envelope and payload, deduplicate durably by event
ID, reject an event-ID collision with a different payload hash, partition by
property ID, and apply only revisions newer than their projection. Arrival time is
not ordering evidence. Internal events use Kafka TLS, SASL, and ACLs; inventory-v1
does not add an application-level event signature.

The event deliberately excludes creation/release reason, actor identity,
authorization evidence, booking/hold ID, external channel reference, notes,
commercial amounts, guest/customer/host data, credentials, and raw provider
payloads.

## Reconciliation boundary

A revision gap is not evidence that an event may be skipped. The consumer pauses
that property projection and uses the future SCRUM-361 Booking-owned, mTLS-protected
reconciliation API to replace it from a revision-pinned current inventory snapshot.
It never reads Booking's database.

Stale, expired, or orphan repair runs as an explicit `SYSTEM` command through the
same revision, audit, and outbox path. Repair transitions state instead of deleting
historical rows. Defining and implementing that repair API is outside SCRUM-359.

## Required acceptance evidence

Automated contract, integration, concurrency, and Postman evidence covers:

1. create each of the four operator types as `ACTIVE`, with exact branch and
   revision evidence;
2. exact create replay returns the same IDs, versions, timestamps, response hash,
   audit count, and event count;
3. key reuse by another actor/action/payload is rejected;
4. release and exact release replay, plus different-key second release rejection;
5. half-open adjacency succeeds while overlap fails without leaking the conflicting
   block;
6. two commands using one expected revision produce at most one commit;
7. controlled concurrent database inserts prove the exclusion constraint remains
   authoritative even without application serialization;
8. Super Admin `ALL` and Manager current-branch success, plus every disallowed
   role/scope/foreign/revoked case;
9. unknown, unmapped, malformed, and unavailable Property/User dependencies fail
   closed;
10. invalid UUID/date/range/revision/reason/key/correlation inputs;
11. injected rollback leaves no partial block, revision, command, audit, or outbox
   row; and
12. event schema, aggregate equality, ordering, duplicate delivery, privacy, and
   gap-reconciliation behavior.

