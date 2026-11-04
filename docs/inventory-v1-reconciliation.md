# Inventory v1 reconciliation and repair

Status: normative for SCRUM-361.

## Boundary

Booking owns inventory state and its monotonic per-Property revision. A consumer
that detects an event revision gap pauses that Property and calls the internal
`InventoryReconciliationService.ReconcileInventory` gRPC method. It never reads
Booking's database and never treats Kafka arrival time as aggregate order.

The provider requires an authenticated mTLS workload identity and an explicit
inventory-reconciliation caller allow-list. An absent identity is
`UNAUTHENTICATED`; a non-allow-listed identity is `PERMISSION_DENIED`; malformed
input is `INVALID_ARGUMENT`; storage unavailability is sanitized `UNAVAILABLE`.

## Revision-pinned snapshot

The request contains one canonical lowercase Property UUID and the last
non-negative inventory revision durably applied by the consumer. Booking reads
the head and rows in one repeatable-read transaction.

If the supplied revision equals the head, `notModified` is true and `blocks` is
empty. If it is lower, the response contains the complete current TENTATIVE and
ACTIVE projection ordered by start date, exclusive end date, type, status and
block ID. A consumer revision greater than the Booking head is invalid consumer
state and fails with `FAILED_PRECONDITION`; it is never silently rewound.

A Property with no inventory history has head zero and an empty projection.
The response contains an RFC 3339 UTC `observedAt` assigned inside the same
snapshot. The consumer atomically replaces only its owned projection for the
exact Property and records the returned head before resuming events.

Each block includes only ID, type, status, half-open dates, block version and an
optional channel provider code. It excludes reason, actor, booking/customer/
guest identity, external channel reference, command outcome and audit data.

## V1 SYSTEM repair classifications

Repair transitions state and preserves history. It never deletes a block.

Safe automatic repairs are:

- `EXPIRED_HOLD`: a HELD booking has `hold_expires_at <= now` and owns a
  blocking BOOKING row. Booking becomes EXPIRED and the row becomes RELEASED in
  one transaction.
- `TERMINAL_BOOKING_ORPHAN`: a COMPLETED, CANCELLED, NO_SHOW or EXPIRED booking
  still owns a TENTATIVE/ACTIVE BOOKING row. The row becomes RELEASED.
- `ELAPSED_OPERATOR_BLOCK`: a TENTATIVE/ACTIVE MAINTENANCE, CLEANING, OWNER_USE
  or MANUAL row has `endDateExclusive <= businessDate`. It becomes RELEASED.

Detection-only findings are `STALE_BOOKING_PROJECTION` (live booking Property
or dates disagree), `MISSING_BOOKING_BLOCK`, and `CHANNEL_AUTHORITY_REQUIRED`.
They never open inventory automatically. CHANNEL repair remains disabled until
the Channex ownership/webhook contract is activated.

## Atomicity and replay

Every candidate is re-read under the Property advisory transaction lock. A
repair key is deterministic from classification, block ID and relevant source/
block versions. Exact retry returns the durable original outcome; a source
version change is a new decision.

A successful repair atomically commits the source booking expiry where
applicable, block RELEASED transition and version, exactly one inventory
revision advancement, immutable SYSTEM repair evidence, audit evidence and one
`vistay.booking.inventory-block-changed.v1` outbox fact. The event uses
Property ID as key and the resulting inventory revision as aggregate version.
It carries no reason, actor, guest or external channel identity.

Concurrent owner changes cause a candidate to be skipped and reclassified, not
overwritten. Any failed evidence/audit/outbox write rolls back the entire repair.

## Operational limits

Repair scanning is bounded and restartable. It uses database time for instant
expiry and an explicitly configured business zone for date-only elapsed rows.
Metrics separate scanned, repaired, skipped, detection-only and failed counts
by classification without high-cardinality Property or block labels.
