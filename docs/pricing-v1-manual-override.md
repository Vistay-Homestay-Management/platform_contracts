# Pricing v1 manual override authorization

Decision source: SCRUM-356, Jira comment 10125  
Decision date: 2026-10-30  
Change policy: prospective and append-only; override history is never rewritten.

## Boundary

SCRUM-356 authorizes and records one controlled manual price reduction. The server first reruns the normative SCRUM-355 calculation from an explicit immutable profile version and the complete normalized quote input. It never trusts a client-supplied before amount, commission, total, explanation, actor, or scope.

SCRUM-356 persists only an immutable manual-override authorization/evidence artifact. It does not:

- create or update `booking_quotes`;
- choose, approve, publish, or activate a profile version;
- create a booking or historical booking snapshot;
- allocate a reduction into monthly Finance installments; or
- consume or attach the artifact to a quote or booking.

Those lifecycle operations remain SCRUM-357. A later consumer must name one exact `overrideId`; no API selects an override implicitly by property, profile, dates, actor, or amount.

## Command input

The command contains only:

- an `idempotencyKey`;
- the exact SCRUM-355 quote input, including `propertyId`, `rateProfileVersionId`, dates, guest count, channel, staff flag, and optional commission basis points;
- the required lowercase hexadecimal `expectedBaseQuoteFingerprint` returned by SCRUM-355;
- a whole-VND `targetLodgingAmount`;
- a trimmed reason from 10 through 1000 characters; and
- a required correlation ID from 1 through 100 characters.

The server recalculates the base quote and compares its fingerprint with `expectedBaseQuoteFingerprint` before authorizing the override. A stale or altered fingerprint fails closed. The actor, authorization evidence, before/after amounts, timestamps, and expiry are server-derived and cannot be supplied by the client.

## Target and calculation

The only v1 override target is the complete stay's `lodgingAmount` after all profile, fixed-rate, discount, and surcharge rules and before staff commission. Individual dates, rules, base/factor values, currency, commission basis points, and commission limits cannot be overridden.

Let:

```text
beforeLodgingAmount = baseQuote.lodgingAmount
targetLodgingAmount = requested whole-VND target
overrideAdjustmentAmount = targetLodgingAmount - beforeLodgingAmount
```

The target is valid only when:

```text
0 <= targetLodgingAmount < beforeLodgingAmount
```

A negative target, no-op, or increase is rejected. A future version may introduce other explicitly authorized override types; v1 must not infer them.

The effective commission basis points are copied unchanged from the recalculated base quote. The after amounts are:

```text
afterCommissionAmount = HALF_UP(targetLodgingAmount * commissionBps / 10000)
afterTotalAmount = targetLodgingAmount + afterCommissionAmount
```

All arithmetic uses overflow-safe whole-VND integers. Commission is recalculated from the target rather than copied from the base quote.

## Large-reduction threshold

Every override requires `pricing:override`. A reduction strictly greater than 20 percent additionally requires `pricing:approve-large-override`. The authorization decision uses lodging before commission and an overflow-safe exact comparison:

```text
(beforeLodgingAmount - targetLodgingAmount) * 10000
    > beforeLodgingAmount * 2000
```

Exactly 20 percent is not a large reduction. A zero target is allowed only when the actor also has `pricing:approve-large-override`. A stored/displayed reduction-basis-point value is explanatory and never replaces the exact threshold comparison.

The same actor may hold both permissions in v1. Maker-checker and four-eyes approval are future explicit workflows and must not be inferred from this contract.

## Authorization and data scope

`pricing:override` must have either `ALL` or a matching `PARTITION(BRANCH, id)` resolved by Property for the requested property. When large approval is required, `pricing:approve-large-override` must independently cover that same property through `ALL` or a matching branch partition.

Missing or mismatched topology is denied. Property dependency unavailability fails closed and is not interpreted as global access.

The durable evidence records server-derived actor account ID, actor profile ID, authorization version, each permission used, and the resolved `ALL` or branch scope. None of these fields is accepted from GraphQL input.

The default v1 grants are:

- `SUPER_ADMIN`: both permissions at `ALL`;
- `MANAGER`: `pricing:override` only when explicitly bound to a matching branch; and
- Receptionist, Staff, CTV, Host Partner, and customer roles: no default override permission.

## Expiry, idempotency, and immutable evidence

The server sets one `createdAt` and:

```text
expiresAt = createdAt + profile.quoteTtlMinutes
```

The client cannot extend the lifetime. An exact idempotent replay returns the original artifact and its original timestamps, including after it has expired. Reusing an idempotency key with a different actor or normalized payload is rejected.

The immutable artifact stores at least:

- override ID and command/idempotency evidence;
- property, immutable profile version, normalized quote-input snapshot, calculation version, and base fingerprint;
- before/after lodging, commission, and total amounts;
- signed override adjustment, explanatory reduction basis points, and the exact large-approval decision;
- actor account/profile, authorization version, permissions, and resolved scope evidence;
- reason and correlation ID;
- unchanged base explanation and final explanation snapshots; and
- creation and expiry timestamps.

Database `UPDATE` and `DELETE` are rejected. Different idempotency keys may create distinct artifacts for the same base quote; this is append-only correction, not replacement. Audit evidence is written in the same transaction as the artifact.

## Explanation and response

The SCRUM-355 base quote and its rule explanation remain byte-for-byte unchanged. The final explanation preserves the base order, appends exactly one highest-precedence `MANUAL_OVERRIDE` decision/component, and then appends the commission recalculated from the target lodging amount.

The response exposes the base quote plus:

- `overrideId`;
- target amount, signed adjustment, and explanatory reduction;
- whether large approval was required and used;
- before/after lodging, commission, and total amounts;
- reason and correlation ID;
- actor and scope evidence; and
- `createdAt` and `expiresAt`.

The monetary result is deterministic from the immutable base quote, target, and unchanged commission policy. The authorization artifact additionally contains durable actor and time evidence; only an exact idempotent replay is required to return the same artifact identity and timestamps.

## Later consumption and failure behavior

SCRUM-357 may consume only an exact, unexpired `overrideId` whose stored property, profile, normalized input, base fingerprint, and calculation version match the quote or booking being persisted. At most one booking consumption is permitted. Consumption creates separate append-only usage/snapshot evidence and never updates or deletes the SCRUM-356 artifact.

Published quote and booking snapshots preserve the exact override artifact ID and its before/after evidence. Monthly allocation remains Finance-owned.

Stale or tampered fingerprints, invalid targets, invalid reason/correlation data, missing permissions, permission-scope mismatch, missing topology, and Property unavailability fail closed with stable machine-readable errors. Expired use is rejected by SCRUM-357. Permission revocation/emergency cancellation and maker-checker are future explicit workflows; history is never rewritten.
