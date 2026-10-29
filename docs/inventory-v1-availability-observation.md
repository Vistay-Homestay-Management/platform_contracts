# Inventory v1 exact-unit availability observation

Decision source: SCRUM-358, Jira comment 10143  
Decision date: 2026-10-30  
Change policy: versioned under `inventory-v1`; changes are prospective and must
not reinterpret a prior observation.

## Boundary and ownership

Booking owns inventory blocks and this authenticated Backoffice read. Property
owns property existence and the effective Property-to-Branch membership. In v1,
one `propertyId` identifies one exact physical, bookable unit; callers and Booking
must not invent a second `unitId` or treat a property group as an exact unit.

The operation is a read-only observation. It does not create or extend a hold,
reserve inventory, publish an event, write an audit command, or promise that the
unit will remain available. The immediate pricing/quote consumer is in Booking,
so this slice adds no service-to-service gRPC API. Backoffice clients use GraphQL
through Hive Router.

## Date and overlap semantics

Input dates are ISO `yyyy-MM-dd` local dates. A requested stay is the half-open
interval `[checkInDate, checkOutDate)`, and `checkOutDate` must be later than
`checkInDate`. Timestamps, time zones, and hourly or partial-day stays are invalid.

A block overlaps the requested stay exactly when:

```text
block.startDate < request.checkOutDate
and request.checkInDate < block.endDateExclusive
```

Consequently, a block ending on check-in or starting on checkout is adjacent and
does not overlap. A block itself must also have a non-empty half-open range.

## Inventory block model

Every v1 block has an exact `propertyId`, half-open date range, type, and status.

| Type | Meaning |
| --- | --- |
| `BOOKING` | Booking/hold lifecycle occupancy owned by Booking |
| `MAINTENANCE` | Unit cannot be sold because of maintenance |
| `CLEANING` | Explicit operational cleaning block |
| `OWNER_USE` | Contractual owner occupancy |
| `MANUAL` | Authorized operator-created block |
| `CHANNEL` | Availability imported from an external channel provider |

`TENTATIVE` and `ACTIVE` are blocking statuses for every type. `RELEASED` and
`CANCELLED` remain historical evidence and never block availability. The result is
available if and only if no overlapping row has a blocking status.

A `CHANNEL` block requires a non-blank stable provider code and non-blank external
block reference. The normalized provider plus external reference is an idempotent
unique source identity; retries update/replay the same source fact rather than
creating a second block. The external reference is stored for ingestion and
reconciliation but is never returned by this GraphQL read. Non-channel blocks do
not carry channel identity.

The database exclusion invariant for blocking rows remains the final concurrency
authority. Application-level availability checks alone must never be used to
permit two conflicting holds or reservations.

## GraphQL contract

The v1 Backoffice surface is:

```graphql
extend type Query {
  propertyAvailability(
    input: PropertyAvailabilityInput!
  ): PropertyAvailabilityObservation!
}

input PropertyAvailabilityInput {
  propertyId: ID!
  checkInDate: String!
  checkOutDate: String!
}

type PropertyAvailabilityObservation {
  propertyId: ID!
  checkInDate: String!
  checkOutDate: String!
  available: Boolean!
  inventoryRevision: String!
  branchId: ID!
  propertyMembershipVersion: String!
  observedAt: String!
  overlaps: [InventoryAvailabilityOverlap!]!
}

type InventoryAvailabilityOverlap {
  type: InventoryBlockType!
  status: InventoryBlockStatus!
  startDate: String!
  endDateExclusive: String!
  channelProvider: String
}

enum InventoryBlockType {
  BOOKING
  MAINTENANCE
  CLEANING
  OWNER_USE
  MANUAL
  CHANNEL
}

enum InventoryBlockStatus {
  TENTATIVE
  ACTIVE
  RELEASED
  CANCELLED
}
```

`inventoryRevision` and `propertyMembershipVersion` are base-10 64-bit values
encoded as GraphQL strings to avoid the 32-bit GraphQL `Int` limit. `observedAt` is
an RFC 3339 UTC timestamp assigned by the server. `overlaps` contains every
overlapping row, including non-blocking history, ordered by start date, exclusive
end date, type, status, and provider. `channelProvider` is non-null only for a
`CHANNEL` row.

The response deliberately excludes inventory-block ID, booking/hold ID, external
channel reference, reason, notes, actor identity, guest/customer/host data,
commercial amounts, credentials, and raw authorization evidence. GraphQL errors
must likewise omit dependency addresses, SQL text, tokens, and those excluded
fields.

## Revision and observation consistency

Booking maintains one non-negative, monotonically increasing
`inventoryRevision` per property. Every committed inventory-block insert, update,
or delete increments the affected property's revision in the same transaction,
including changes to a non-blocking row. A revision never decreases or gets reused;
consumers treat it as opaque evidence and must tolerate gaps. If moving a row
between properties is supported, both the old and new property revisions increment
atomically; prohibiting a property move is also conformant.

The query reads the revision and overlapping rows from one database
repeatable-read snapshot. A concurrent mutation cannot produce a result that mixes
the old revision with new overlaps, or the reverse. A mutation committed after the
snapshot does not retroactively change the observation; the next query sees a newer
revision.

The revision is not a lease, lock, hold token, or authorization version. Any later
hold, quote-to-booking, or reservation command must revalidate availability in its
own write transaction and rely on the blocking-row exclusion constraint to resolve
races.

## Property resolution and fail-closed behavior

Before returning an observation, Booking resolves the exact property with
`vistay.property.v1.PropertyPartitionService`. A successful response includes the
authoritative active `branchId` and `membershipVersion`, which are copied into the
observation as authorization evidence.

- An unknown property fails with `PROPERTY_NOT_FOUND`.
- A known property without an active membership fails with
  `PROPERTY_PARTITION_UNMAPPED` and never reports `available: true`.
- A timeout, unavailable Property service, malformed response, or property-ID
  mismatch fails with `PROPERTY_PARTITION_UNAVAILABLE`.
- No locally cached or caller-supplied branch may replace authoritative resolution.

## Authorization matrix

Every call requires an active authenticated Backoffice account and an
`inventory:read` permission grant. Roles define a maximum scope; a role name alone
never grants access.

| Active role | Required accepted scope | Record condition |
| --- | --- | --- |
| `SUPER_ADMIN` | explicit `ALL` | Any mapped property |
| `CTV` | explicit `ALL` | Any mapped property |
| `MANAGER` | `PARTITION(BRANCH, currentBranchId)` | Property branch equals the account's current active branch |
| `RECEPTIONIST` | `PARTITION(BRANCH, currentBranchId)` | Property branch equals the account's current active branch |
| `STAFF` | `PARTITION(BRANCH, currentBranchId)` | Property branch equals the account's current active branch |

For a branch-bound role, the authorization snapshot's exact `BRANCH` partition,
the account's current active branch assignment, and Property's resolved branch must
all match. An `ALL` grant must not elevate a branch-bound role. `OWN`, `SELF`, or
`ASSIGNED` without the exact partition is rejected; combining one of those scopes
with an unrelated partition also fails. A revoked/inactive assignment, missing or
foreign branch, unknown scope/partition type, stale or inactive authorization
snapshot, or missing `inventory:read` permission fails closed. User/Authorization
unavailability fails closed and is never treated as an empty or global grant.

List filtering is not applicable to this exact-identifier read. A foreign property
identifier is rejected; the frontend is not an enforcement layer.

## Stable failures

Failures expose a stable `extensions.code` and a sanitized message:

| Code | Condition |
| --- | --- |
| `INVALID_INVENTORY_RANGE` | Malformed UUID/date, timestamp input, or checkout not after check-in |
| `UNAUTHENTICATED` | Missing, invalid, or expired caller identity |
| `INVENTORY_READ_FORBIDDEN` | Missing permission, disallowed role/scope, revoked assignment, or foreign branch |
| `PROPERTY_NOT_FOUND` | Authoritative Property service reports no such exact unit |
| `PROPERTY_PARTITION_UNMAPPED` | Property exists but has no active branch membership |
| `PROPERTY_PARTITION_UNAVAILABLE` | Property partition authority cannot return trustworthy evidence |
| `AUTHORIZATION_UNAVAILABLE` | User/Authorization cannot return a trustworthy current snapshot |
| `INVENTORY_OBSERVATION_FAILED` | Stored inventory evidence violates this contract or the snapshot cannot be read |

Dependency failures must not be converted into an available result. Logs and traces
include a correlation ID and stable code, but never the excluded private fields.

## Acceptance and Postman scenarios

Contract, integration, and Postman evidence must cover:

1. no overlap returns available with the mapped branch, membership version, and
   current inventory revision;
2. each of the six block types in both `TENTATIVE` and `ACTIVE` makes the unit
   unavailable;
3. `RELEASED` and `CANCELLED` overlaps remain sanitized evidence but do not block;
4. blocks ending at check-in or beginning at checkout are non-overlapping;
5. multiple overlaps are deterministically ordered and expose only the documented
   fields; a channel provider is visible while its external reference is absent;
6. equal/reversed dates, timestamp/hour input, and malformed property IDs fail with
   `INVALID_INVENTORY_RANGE`;
7. unknown, unmapped, foreign-branch, and revoked-assignment cases fail closed;
8. `OWN`, `SELF`, or `ASSIGNED` without the exact branch partition is denied for
   every Backoffice role;
9. Property and User/Authorization timeouts/unavailability produce the stable
   dependency error and never a false available result;
10. insert, update, and delete each advance the affected property revision, while
    a read performs no write and repeated reads remain unchanged without a mutation;
11. a controlled concurrent mutation proves revision and overlaps come from one
    repeatable-read snapshot, and a subsequent read observes the newer revision;
12. two readers can observe availability simultaneously without creating a hold;
    the later write path still revalidates and enforces the exclusion constraint.

Read-only retries are safe and need no idempotency key. Duplicate external-channel
delivery and reconciliation belong to the future ingestion command, not this query.

## Future Channex boundary

`CHANNEL` and its opaque provider/external identity make future Channex ingestion
possible without changing availability semantics. SCRUM-358 does not activate a
vendor account, configure credentials, call Channex, accept a webhook, poll a feed,
or define vendor-specific payloads. A later versioned channel-integration story owns
authentication, mapping, delivery deduplication, replay, reconciliation, and repair,
then writes normalized `CHANNEL` blocks through Booking's controlled internal
command. Channex secrets and raw payloads must never enter this GraphQL response.

