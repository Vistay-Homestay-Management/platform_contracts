# Pricing v1 deterministic quote calculation

Decision source: SCRUM-355

Decision date: 2026-10-30

Change policy: prospective and versioned; an existing quote or booking snapshot is never reinterpreted.

## Boundary

SCRUM-355 defines a pure quote calculation and its machine-readable explanation. A request explicitly names both the authoritative `propertyId` and one immutable `rateProfileVersionId`. The profile must belong to that property; the calculator must never substitute the latest authored version.

The calculation performs no database write and has no wall-clock input. In particular, it does not:

- publish or approve a rate-profile version;
- select a published or active version;
- persist a row in `booking_quotes`;
- assign an expiry timestamp or consume the profile's quote TTL;
- apply a manual override; or
- create a booking or historical pricing snapshot.

Those lifecycle responsibilities remain with SCRUM-356 and SCRUM-357. A later booking command must calculate or validate from its authoritative inputs and must not trust a total submitted by a frontend.

An authorized reduction based on this result follows the separate normative
[`pricing-v1-manual-override.md`](pricing-v1-manual-override.md) contract. That artifact preserves this base calculation and does not change the deterministic SCRUM-355 result.

## Normalized input

The calculation input contains:

- `propertyId` and `rateProfileVersionId`;
- ISO local dates `checkInDate` and `checkOutDate`;
- one positive whole-number `guestCount`;
- one source channel: `ADMIN_PORTAL`, `CUSTOMER_WEB`, or `OTA`;
- `staffCreated`, which may be true only for `ADMIN_PORTAL`; and
- an optional whole-number `commissionBps` for an `ADMIN_PORTAL` staff quote.

The stay interval is half-open: `[checkInDate, checkOutDate)`. Each local date in that interval is one charge date. Checkout must be after check-in, there is no hourly or partial-day calculation, and the number of charge dates is the date difference in days.

The complete stay must be covered by the selected profile: `checkInDate` must be on or after `effectiveFrom`, and every charge date must be before `effectiveToExclusive` when that end exists. A property/profile mismatch or incomplete effective coverage fails closed; the calculator does not splice two versions together.

## Stay-product classification

Classification uses the normalized charge-date count and the calendar anniversary of check-in:

1. `SHORT`: 1 through 29 charge dates.
2. `MEDIUM`: at least 30 charge dates and `checkOutDate` is before `checkInDate.plusYears(1)`.
3. `LONG`: `checkOutDate` is on or after `checkInDate.plusYears(1)`.

The anniversary operation uses the platform date library's calendar semantics. For example, adding one year to a leap-day check-in resolves in the same way as `LocalDate.plusYears(1)`. The classification has no gap and no overlap.

`SHORT` begins with the profile's whole-VND `baseDailyRate`. `MEDIUM` and `LONG` begin with that rate multiplied respectively by `mediumDailyFactorBps` and `longDailyFactorBps`, rounded as specified below. Residual days in a medium- or long-term stay use the same adjusted daily rate. Dated promotional rules are not evaluated for `MEDIUM` or `LONG`.

## Rule matching by charge date

Rules are evaluated only for `SHORT`, independently for every charge date. A rule matches a charge date only when all of these conditions hold:

- the charge date is in the rule's half-open effective interval;
- an empty weekday list or the charge date's ISO weekday is allowed;
- an empty channel list or the normalized source channel is allowed;
- the whole stay's charge-date count is inside the optional stay bounds; and
- the total guest count is inside the optional guest bounds.

The explanation includes every evaluated rule. A non-match records exactly one stable first-failure reason rather than disappearing from the result. Predicates are checked in this order: effective date (`RULE_NOT_EFFECTIVE`), weekday (`WEEKDAY_MISMATCH`), channel (`CHANNEL_MISMATCH`), whole-stay duration (`STAY_LENGTH_MISMATCH`), then guest count (`GUEST_COUNT_MISMATCH`). Later predicates are not reported after the first failure.

### Fixed daily-rate winner

Matching `FIXED_DAILY_RATE` rules are ordered by:

1. lower numeric `priority`;
2. lexicographically lower stable `code`; and
3. lexicographically lower rule UUID as the final tie-breaker.

The first rule is the only fixed-rate winner for that charge date. Its `actionValue` replaces the product daily rate and becomes the **selected daily rate**. Every other matching fixed-rate rule has status `SUPERSEDED` and reason `FIXED_RATE_LOWER_PRECEDENCE`. When no fixed rule matches, the product daily rate is the selected daily rate.

### Discounts and surcharges

Every matching non-fixed adjustment is applied sequentially. All percentage action amounts are nevertheless calculated from the selected daily rate, so percentages never compound on the result of an earlier action. Percentage actions use their basis-point value, while fixed actions use their whole-VND value per matched charge date.

For deterministic application and explanation, all adjustment action types are in one sequence ordered by:

1. lower numeric `priority`;
2. lexicographically lower stable `code`; and
3. lexicographically lower rule UUID.

There is no additional action-type precedence between `PERCENT_DISCOUNT`, `FIXED_DISCOUNT`, `PERCENT_SURCHARGE`, and `FIXED_SURCHARGE`. Starting from the selected daily rate, a surcharge increases the running daily amount. Each discount is capped independently at the then-current running amount, so the running daily amount never becomes negative. The explanation records both requested and applied delta for every action. In ordered pseudocode:

```text
runningDailyAmount = selectedDailyRate
for action in orderedAdjustments:
    requestedDelta = action is percentage
        ? roundBps(selectedDailyRate, actionValue)
        : actionValue
    if action is PERCENT_DISCOUNT or FIXED_DISCOUNT:
        appliedDelta = min(requestedDelta, runningDailyAmount)
        runningDailyAmount = runningDailyAmount - appliedDelta
    else:
        appliedDelta = requestedDelta
        runningDailyAmount = runningDailyAmount + appliedDelta
adjustedDailyRate = runningDailyAmount
```

## Whole-VND arithmetic

All authored values, components, and totals are whole VND. Floating-point arithmetic is forbidden. A basis-point multiplication uses integer-safe arithmetic and rounds `HALF_UP` to the nearest VND:

```text
roundBps(amount, bps) = HALF_UP(amount * bps / 10000)
```

The multiplication must detect numeric overflow. Each percentage factor, percentage rule, and commission is rounded at its own documented boundary. Fixed values need no rounding. Daily components are summed with checked integer arithmetic.

For the public response, `baseLodgingAmount` is the unadjusted profile base daily rate multiplied by the charge-date count. `lodgingBeforeAdjustments` is the sum of selected daily rates after a fixed-rate winner, where applicable. The aggregate calculation is:

```text
lodgingBeforeAdjustments = sum(selectedDailyRate)
discountAmount = sum(appliedDiscount)
surchargeAmount = sum(surcharges)
lodgingAmount = lodgingBeforeAdjustments - discountAmount + surchargeAmount
commissionBaseAmount = lodgingAmount
commissionAmount = roundBps(commissionBaseAmount, commissionBps)
totalAmount = lodgingAmount + commissionAmount
```

Tax is zero and is not calculated in v1. The commission remains a separately named component; it is never folded into the property base rate or a promotional surcharge.

## Staff commission

Commission markup applies only when `staffCreated` is true, which is valid only for `ADMIN_PORTAL`. When request `commissionBps` is omitted for such a calculation, the profile's `commissionDefaultBps` is used. A supplied value must be a whole number from zero through the profile's `commissionMaxBps`. The commission is calculated from `lodgingAmount`, after daily discounts and surcharges and before commission itself.

Every calculation where `staffCreated` is false uses an effective commission of zero and rejects a non-zero supplied commission. `CUSTOMER_WEB` and `OTA` additionally reject `staffCreated=true`. The response explicitly exposes `requestedCommissionBps`, `commissionDefaultBps`, `commissionMaxBps`, `commissionBaseAmount`, effective `commissionBps`, and `commissionAmount`.

## Result and explanation

The result exposes at least:

- property ID, immutable profile ID and profile version number;
- normalized dates, charge-date count, stay product, source channel, guest count, and currency;
- `baseDailyRate`, `dailyFactorBps`, `productDailyRate`, `baseLodgingAmount`, `lodgingBeforeAdjustments`, `discountAmount`, `surchargeAmount`, `lodgingAmount`, and `totalAmount`;
- `requestedCommissionBps`, `commissionDefaultBps`, `commissionMaxBps`, `commissionBaseAmount`, effective `commissionBps`, and `commissionAmount`;
- dated price components for every `SHORT` charge date; `MEDIUM` and `LONG` may group consecutive identical daily components while preserving their covered start/end dates and charge-date count; and
- one ordered decision for every evaluated rule, including match status, the stable first-failure reason when unmatched, fixed-rate precedence, selected base, requested delta, applied delta, and before/after values.

Repeated calculation from the same normalized input and the same immutable profile produces the same monetary result, explanation order, and calculation fingerprint. The lowercase hexadecimal SHA-256 fingerprint is computed from a canonical UTF-8 representation containing:

- the normalized calculation input;
- all calculation-relevant profile fields; and
- all calculation-relevant rules ordered by priority, code, and UUID.

The canonical form is not serialized from an object with sorted keys. It is a schema-versioned sequence of fields in this fixed order:

1. calculation version;
2. profile ID, property ID, version, effective start/end, base daily rate, medium factor, long factor, currency, commission default, and commission maximum;
3. request property ID, check-in, checkout, guest count, channel, `staffCreated`, and requested commission; then
4. each rule ordered by priority, code, and UUID, with fields ID, code, effective start/end, priority, weekdays, channels, minimum/maximum stay, minimum/maximum guests, action type, and action value.

Every scalar field is encoded as its decimal canonical-text length, a colon, its canonical UTF-8 value, and a semicolon. Numeric values use base-10 integer text, enums use their stable names, ordered lists use their stable bracketed canonical text, and absent optional values use the literal `<null>`. The validated profile ID already represents the equal requested `rateProfileVersionId`; it is not duplicated. This ordered length-prefixed encoding prevents delimiter ambiguity while remaining byte-stable across implementations.

Actor identity, authorization grants, request time, expiry time, tracing data, and generated display text are excluded from the fingerprint.

## Authorization and failure behavior

Calculation requires `pricing:read`. `ALL` grants global calculation access. Otherwise, `PARTITION(BRANCH, id)` is accepted only when Property's authoritative resolver maps the requested property to that same active branch.

Missing or mismatched topology is denied. An unavailable Property resolver fails closed as dependency unavailability. Invalid dates, guests, commission, profile coverage, stored arithmetic overflow, and an inconsistent stored pricing policy return stable machine-readable error codes; they never return a partial total.

Because the operation is pure, it does not use command idempotency storage. Concurrent and repeated identical requests are expected to return identical calculation content and fingerprints. Immutable profile data may be cached by profile UUID in a bounded cache, but authorization and property-partition evaluation remain request scoped.
