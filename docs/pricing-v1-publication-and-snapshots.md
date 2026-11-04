# Pricing v1 publication, active selection, and immutable snapshots

Decision source: SCRUM-357, Jira comment 10135  
Decision date: 2026-10-30  
Change policy: prospective, append-only, and versioned; a persisted quote or booking
snapshot is never recalculated from current pricing.

## Boundary

SCRUM-357 owns the lifecycle between immutable pricing authoring and the later
customer/inventory/booking journey:

- preview an authored profile without publishing it;
- approve and publish exactly one immutable profile version;
- select the effective published version for a complete stay;
- preview a deterministic quote from that published version;
- persist the pricing-backed immutable primitive in `booking_quotes`; and
- consume an optional SCRUM-356 manual override exactly once.

SCRUM-366 consumes this primitive when it builds the full operator quote journey.
Customer identity, inventory availability, holds, reservation confirmation, and
booking state transitions are outside this contract. Those later commands must not
duplicate active-version selection, reinterpret a pricing snapshot, or trust a
frontend-submitted total.

The normative inputs are the immutable profile and rule versions defined by
[`pricing-v1-policy.md`](pricing-v1-policy.md), the deterministic calculator defined
by [`pricing-v1-quote-calculation.md`](pricing-v1-quote-calculation.md), and the
optional reduction artifact defined by
[`pricing-v1-manual-override.md`](pricing-v1-manual-override.md).

## Publication preview

Publication preview is a read-only operation over one explicit
`rateProfileVersionId`. It returns the complete immutable profile and ordered rules,
the `PRICING_PUBLICATION_V1` fingerprint, any publication already attached to that
profile, and the latest publication command for the property.

The latest property publication is the concurrency head, not the profile selected
for every stay. Preview performs no write and requires no idempotency key. It requires
`pricing:read` with `ALL` or a matching `PARTITION(BRANCH, id)` scope.

## Canonical `PRICING_PUBLICATION_V1` fingerprint

The publication fingerprint is lowercase hexadecimal SHA-256 over a canonical UTF-8
sequence. It is not a hash of JSON serialization and must not depend on object-field
order, a JSON library, database row order, locale, or process time.

Each scalar in the sequence is encoded as its canonical-text byte length, a colon,
its UTF-8 text, and a semicolon:

```text
append(value) = utf8ByteLength(canonicalText(value)) + ":" + canonicalText(value) + ";"
```

Canonical UUIDs are lowercase hyphenated UUID text. Integers use base-10 text with
no sign for non-negative values. Dates use ISO `yyyy-MM-dd`; local times use ISO
local-time text; timestamps are RFC 3339 UTC text. An absent optional value is the
literal `<null>`. Ordered integer and enum-name lists use bracketed comma-and-space
text, for example `[]`, `[1, 2, 3]`, and `[ADMIN_PORTAL, OTA]`.

The sequence begins with the literal `PRICING_PUBLICATION_V1`, followed by these
profile fields in order:

1. profile ID;
2. property ID;
3. profile version;
4. effective start and optional exclusive end;
5. base daily rate, medium factor, and long factor;
6. currency;
7. check-in time, checkout time, and turnover minutes;
8. quote TTL minutes;
9. commission default and maximum basis points;
10. authoring reason, author administrator account ID, authoring correlation ID,
    and authored timestamp.

Rules are then ordered by ascending priority, lexicographic code, and lexicographic
UUID. Each rule appends these fields in order:

1. rule ID, code, and name;
2. effective start and optional exclusive end;
3. priority;
4. weekdays and channels;
5. optional minimum/maximum stay days;
6. optional minimum/maximum guests;
7. action type and action value.

Publication actor, approval scope, publication reason, idempotency key, publication
time, and publication revision are excluded. The same authored version therefore
has the same fingerprint before and after approval.

The durable JSON snapshot carries `snapshotSchemaVersion` equal to
`PRICING_PUBLICATION_V1`. A future incompatible snapshot or fingerprint layout uses
a new schema version and never reinterprets an old row.

## Publish command and expected-head compare-and-set

Publication input contains only:

- idempotency key;
- `rateProfileVersionId`;
- `expectedProfileFingerprint` from preview;
- nullable `expectedCurrentPublicationId` from preview, where null means that the
  caller expects no previous publication for the property;
- a trimmed reason from 10 through 1000 characters; and
- a UUID correlation ID.

The server derives property identity, actor account/profile identity, authorization
version, permission, resolved scope, timestamp, and publication revision. The client
cannot supply those fields.

Publication requires `pricing:approve`. `ALL` covers every property. Otherwise,
Property's authoritative resolver must map the profile property to the same active
branch as the caller's `PARTITION(BRANCH, id)` grant. Missing/mismatched topology is
denied, and dependency unavailability fails closed. Manager approval is branch-bound;
`SUPER_ADMIN` may use `ALL`.

Within one database transaction, the producer:

1. reserves or replays the actor-bound idempotency command;
2. acquires the property-scoped transaction advisory lock shared with quote snapshot
   creation;
3. reloads the immutable profile and recomputes its fingerprint;
4. reads the property's latest publication by monotonically increasing publication
   revision and compares its ID with `expectedCurrentPublicationId`;
5. inserts one immutable publication row and the next per-property publication
   revision;
6. writes audit evidence and the transactional outbox event; and
7. marks the command successful.

Publication, audit, outbox, and idempotency completion commit or roll back together.
The new publication records the previous publication ID so the compare-and-set chain
can be audited and reconciled.

An exact replay returns the original publication even when the property head has
since advanced. Reusing the key with another actor or normalized payload is rejected.
Two concurrent commands carrying the same expected head cannot both advance it: one
succeeds and the other fails with `STALE_PRICING_PUBLICATION_HEAD`. Publishing the
same profile through another key fails with `PRICING_VERSION_ALREADY_PUBLISHED`.

The generic command record may have a finite retention period, so the immutable
publication also stores its idempotency key, request hash, and actor. Durable
cross-command key reservation and deep historical snapshot verification are the
separate SCRUM-532 hardening scope.

## Effective active-version selection

A published profile covers a requested half-open stay only when:

```text
profile.effectiveFrom <= checkInDate
and (profile.effectiveToExclusive is null
     or profile.effectiveToExclusive >= checkOutDate)
```

Among every published profile that covers the complete stay, selection orders by:

1. later `effectiveFrom` first; then
2. higher immutable profile version first.

The first result is the active profile for that stay. Selection never uses the latest
authored-but-unpublished version and never splices multiple profiles. No match fails
with `ACTIVE_PRICING_NOT_FOUND`. A later overlapping publication affects only new
published previews and new snapshots; it never changes an existing persisted result.

Publication revision orders approval commands and Kafka events. It is deliberately
not an alternative pricing-precedence rule.

## Published quote preview

Published preview accepts normalized pricing input without a profile ID: property,
check-in and checkout dates, guest count, channel, staff-created flag, and optional
commission basis points. The server selects the active publication and invokes the
SCRUM-355 calculator with that immutable profile.

The response returns both publication identity and the complete base quote. It is a
read-only operation, has no wall-clock or expiry output, and does not consume an
override. It requires `pricing:read` with property scope.

## Immutable pricing quote snapshot

Snapshot creation accepts:

- an idempotency key;
- the complete normalized published-preview input;
- `expectedRateProfileVersionId` returned by preview;
- `expectedBaseQuoteFingerprint` returned by preview;
- an optional exact `manualOverrideId`;
- a trimmed reason from 10 through 1000 characters; and
- a UUID correlation ID.

The client never supplies amounts, explanation components, publication identity,
actor/scope evidence, timestamps, or expiry.

Within one database transaction, the server:

1. returns an exact durable replay before evaluating current publication or expiry;
2. reserves the actor-bound idempotency command;
3. acquires the same property transaction lock used by publication;
4. selects the effective publication again and compares its profile ID with the
   expected ID;
5. reruns SCRUM-355 and compares the base fingerprint;
6. validates and, when present, consumes the exact manual override;
7. inserts the `booking_quotes` pricing snapshot and audit evidence; and
8. completes the idempotency command.

This ordering closes the preview/publish race. A snapshot either commits against the
publication that was active while it held the property lock, or fails stale after a
competing publication commits.

The server derives one `createdAt` instant and:

```text
expiresAt = createdAt + selectedProfile.quoteTtlMinutes
```

An exact idempotent replay returns the same quote ID, evidence, and timestamps even
after quote or override expiry. A different actor or payload with the same key is
rejected.

The persisted evidence includes at least:

- quote ID, command key/hash, status, creation time, and expiry;
- publication ID, profile ID/version, publication fingerprint/schema version, and
  property ID;
- normalized calculation input;
- byte-stable base calculation, precedence, components, rule evaluations, calculation
  version, and base fingerprint;
- optional override artifact ID and its immutable before/after authorization evidence;
- final precedence, components, lodging, commission, total, and currency;
- actor account/profile, authorization version, permission, and resolved scope; and
- reason and correlation ID.

Every monetary value is whole VND. Relational summary amounts must agree numerically
with the snapshots regardless of database decimal scale (for example, `800` and
`800.0000` represent the same whole-VND amount). Snapshot evidence cannot be updated
or deleted. A controlled lifecycle may update quote status, but status changes never
alter pricing evidence and require their own authorization/audit contract.

Reads return stored evidence and must not invoke the current calculator. A later
booking references or copies this exact snapshot; it never reconstructs historical
pricing from current profile rows.

## Exact manual-override consumption

When `manualOverrideId` is present, the server loads the immutable SCRUM-356 artifact
and requires all of the following at the snapshot transaction's server time:

- `expiresAt` is strictly later than the consumption time;
- property and profile IDs match the selected publication;
- normalized dates, guests, channel, staff flag, and requested commission match;
- base calculation fingerprint and calculation version match;
- the stored base quote equals the server recalculation; and
- no prior pricing quote/booking lineage has consumed the override.

The final result is copied from the stored applied-override evidence; the server does
not accept or reconstruct a client total. A unique database constraint on non-null
`manualOverrideId`, plus property serialization, permits at most one lineage.
Consumption creates a separate immutable reference and never updates or deletes the
manual-override artifact.

Missing, expired, mismatched, or already consumed artifacts fail respectively with
stable `PRICING_OVERRIDE_NOT_FOUND`, `PRICING_OVERRIDE_EXPIRED`,
`PRICING_OVERRIDE_MISMATCH`, or `PRICING_OVERRIDE_ALREADY_CONSUMED` errors. Monthly
allocation remains Finance-owned.

## Event, audit, and recovery

Every successful new publication emits the transactional-outbox fact defined by
[`pricing-v1-rate-profile-published-event.md`](pricing-v1-rate-profile-published-event.md).
Quote snapshot creation is audited but emits no pricing publication event.

Required audit evidence includes actor account/profile, authorization version,
permission and scope, property/profile/publication IDs, expected and previous head,
fingerprint, reason, correlation ID, and resulting snapshot/quote ID where applicable.
Credentials and customer PII are never included.

Stable failures include invalid input, missing permission, scope denial, Property
dependency unavailability, stale profile fingerprint, stale publication head, no
effective publication, stale published preview, stale base fingerprint, override
failures, idempotency reuse/incomplete state, numeric overflow, and invalid stored
evidence. No failure may leave only a publication, audit, outbox, override consumption,
or quote row committed.

Operators reconcile publication history by property revision and outbox event ID.
Consumers deduplicate by event ID and use aggregate version rather than arrival time.
