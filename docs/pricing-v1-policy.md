# Pricing v1 policy

Decision source: SCRUM-314 / SCRUM-354  
Decision date: 2026-10-29  
Change policy: versioned; never reinterpret an existing quote or booking snapshot.

## Ownership

Booking is the system of record for commercial unit pricing. A rate profile is keyed by the authoritative Property `unit_id` and carries the `property_id` needed for authorization. Property remains the owner of unit identity and physical attributes; Booking may keep only the explicitly versioned attributes needed to evaluate pricing.

Booking owns the bookable check-in, check-out, and turnover policy because those values define the inventory interval. Finance owns receivables, installments, collections, employee commission earnings, and collection-accountability reporting. Neither service reads the other's database.

## Stay products

| Product | Duration | Daily price basis | Customer due schedule |
| --- | --- | --- | --- |
| `SHORT` | 1–29 days | 100% base daily rate before applicable short-stay rules | checkout |
| `MEDIUM` | at least one calendar month and less than one year | 70% base daily rate | monthly; residual days use the same adjusted daily rate |
| `LONG` | at least one year | 55% base daily rate | monthly; residual days use the same adjusted daily rate |

There is no hourly product. Calendar-month boundaries are not converted to a fixed 30-day duration. Promotional, seasonal, weekday, holiday, channel, guest-count, and minimum-stay adjustments apply only to `SHORT` in v1. The MEDIUM and LONG percentages are versioned rate-profile factors, not promotions.

## Versioned defaults

- Currency is VND and authored monetary values are whole đồng; floating-point arithmetic is forbidden.
- Default check-in is 14:00, checkout is 12:00, and turnover is 120 minutes.
- Default quote lifetime is 15 minutes.
- A staff-created booking may include a separately identified commission markup. The default is 5% and the maximum is 20% of the room charge before commission.
- Published rules and profiles are immutable. A change creates a new effective-dated version; historical quote and booking snapshots are never recalculated.

These are product defaults rather than source-code assumptions: every value is stored in a version and can be changed prospectively by an authorized future version.

## Authoring and authorization

- Reading requires `pricing:read`; authoring a version requires `pricing:update`; publication later requires `pricing:approve`.
- `ALL` grants access globally. A `PARTITION(BRANCH, id)` grant is accepted only when Property's authoritative resolver maps the profile's property to the same branch.
- Missing/mismatched topology is denied. An unavailable topology dependency fails closed and is not treated as global access.
- Every authoring command uses an idempotency key, immutable actor identity, reason, and correlation/audit evidence.

## Dated rule semantics

Rules use inclusive start and exclusive end dates. Empty weekday/channel conditions mean all values. Supported v1 actions are fixed daily price, percentage/fixed discount, and percentage/fixed surcharge. Percentage values use basis points.

The authoring boundary rejects invalid ranges, a discount over 100%, duplicate rule codes, and ambiguous same-priority fixed-price rules whose conditions can overlap. Detailed calculation/explanation, manual override, and publication belong to SCRUM-355, SCRUM-356, and SCRUM-357 respectively.

## Receivable and employee accountability

An unpaid customer amount remains a customer receivable. Booking snapshots the creator and collection owner; Finance records the customer receivable and a separate employee collection-accountability entry. Employee personal liability is created only by an explicit, authorized recovery decision and never replaces or hides the original customer receivable.
