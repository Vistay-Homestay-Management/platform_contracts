# TM-003: Property-to-Branch partition topology

- Artifact-ID: TM-003
- Version: 1.0.0
- Status: Accepted
- Date: 2026-10-29
- Last reviewed: 2026-10-29
- Review due: 2027-04-29
- Security owners: Property, User, Booking, Payment, Finance, and Security
- Related ADRs: ADR-003

## Scope, assets, and trust boundaries

This model covers Property's effective-dated branch topology, its mTLS gRPC resolver, Booking's authorization projection, Payment's consumption of that projection, Finance's direct resolution for Settlement, and User authorization snapshots. Assets are branch identities, membership history/version, property references, projected resolution state, grants, settlement/booking visibility, and authorization audit evidence.

Trust boundaries are User-to-domain authorization snapshot, Booking/Finance-to-Property gRPC, Booking-to-Payment projection, and client-to-service resource identifiers. Client-provided branch IDs, a matching UUID, and local database projections are untrusted unless the ADR-defined owner validates them.

## Threats and required controls

| ID | STRIDE | Threat | Required control and verification |
| --- | --- | --- | --- |
| P-01 | Spoofing | Unapproved service invokes the partition resolver. | Property requires mTLS URI SAN allowlist for Booking and Finance; unknown identity tests must fail. |
| P-02 | Tampering | Caller supplies a branch or changes a projected membership. | Property is authoritative; Booking signs/owns its projection boundary; Payment ignores client/local inferred branch; mismatch tests return 403. |
| P-03 | Repudiation | Reassignment or authorization decision lacks history. | Effective-dated immutable membership history, monotonic version, actor/reason/correlation audit, and projection version retention. |
| P-04 | Information disclosure | User with booking access sees protected finance fields or another branch. | Resource action and field policy are checked independently from the partition; exact branch match or ALL is required before response. |
| P-05 | Denial of service | Property resolver outage bypasses or stalls authorization. | Bounded deadline, no permissive cache/default, `UNAVAILABLE` projection where defined, 503 fail-closed response, and outage tests. |
| P-06 | Elevation of privilege | Property UUID is treated as branch UUID, stale branch remains accepted, or scopes overlap. | No identity inference, non-overlapping memberships, only current effective membership resolves, and DB/integration constraints test reassignments. |
| P-07 | Replay | Old authorization projection is reused after reassignment. | Membership version/state is carried in owned records; new reads resolve current authority where required; reconciliation detects stale projections. |

## Residual risk and response

Historical Booking and Payment records intentionally retain the branch projection used for their recorded decision, while new authorization decisions follow the active topology defined by the owning service. Any mismatch is denied and sent to reconciliation; operators do not repair it through cross-database edits. Field-level controls, such as booking amount visibility, remain separate from branch partition authorization.

## Change history

| Version | Date | Change |
| --- | --- | --- |
| 1.0.0 | 2026-10-29 | Initial STRIDE model for ADR-003 and SCRUM-528 topology. |
