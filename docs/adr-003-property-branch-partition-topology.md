# ADR-003: Property Service owns Property-to-Branch partition topology

- Artifact-ID: ADR-003
- Version: 1.0.0
- Status: Accepted
- Date: 2026-10-29
- Last reviewed: 2026-10-29
- Review due: 2027-04-29
- Decision owners: Property, User, Booking, Payment, Finance, and Security
- Threat model: TM-003
- Decision: SCRUM-528

## Context

Authorization grants use a `BRANCH` partition, while Booking owns only a `property_id` relationship. Treating a Property UUID as a Branch UUID or reading another service database would create an unverifiable authorization boundary.

## Decision

Property Service is the system of record for operating branches and effective-dated Property-to-Branch memberships.

- `operating_branches` owns branch identity and lifecycle.
- `property_branch_memberships` owns one non-overlapping membership history per property.
- Reassignment closes the current membership and inserts a new monotonically versioned membership in one transaction.
- A missing active membership is a valid fail-closed state, not an inferred default.
- Property exposes `vistay.property.v1.PropertyPartitionService` over mTLS. Consumers never read the Property database.
- Booking resolves the property membership and publishes the exact `BRANCH` ID and resolution status in its authorization record.
- Finance resolves Property membership directly for Settlement records, because Settlement already owns `property_id` and has no Booking relationship to proxy through.
- Payment consumes only the Booking authorization record. It never trusts a client-provided branch or a local payment projection as the partition authority.

## Failure semantics

- Unknown Property: Property gRPC returns `NOT_FOUND`.
- Known Property without an active membership: `MISSING`; partition access is denied with HTTP 403.
- Property dependency unavailable: Booking reports `UNAVAILABLE`; consumers fail closed with HTTP 503 when `PARTITION` is required.
- Reassignment: new authorization reads resolve only the newly active membership; the closed membership remains historical evidence.

## Security boundary

Property gRPC requires an explicit bounded deadline and a client certificate whose URI SAN is either `spiffe://vistay/service/booking` or `spiffe://vistay/service/finance`. Payment consumes the Booking projection; Finance calls Property only for Property-owned Settlement records.

## Change history

| Version | Date | Change |
| --- | --- | --- |
| 1.0.0 | 2026-10-29 | Accepted topology baseline registered with TM-003. |
