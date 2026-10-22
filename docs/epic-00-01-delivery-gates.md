# Epic 00–01 delivery gates

This document turns the Release 0 roadmap into objective entry and exit evidence. It does not replace the detailed epic context in `ViStay_Epic_Roadmap_2026_Finalized.txt`.

## Epic 00: Business Rules, Compliance & Vendor Readiness

Epic 00 exits only when the following artifacts are versioned, named owners have reviewed them, and unresolved items have a deadline and an explicit effect on downstream work.

### Business and domain gate

- A shared glossary and state diagrams exist for property/supply term, quote, hold, reservation, stay, payment, settlement, work order, and notification.
- Decision tables cover exact-unit inventory, pricing precedence, cancellation, deposit, manual payment verification/reversal, and settlement for `OWNED`, `LEASED_BY_VISTAY`, and `MANAGEMENT`.
- The account and permission matrix identifies who may provision, approve, override, reverse, view sensitive data, and use break-glass access.
- Property, Booking, Operations, Finance, User, Media, Notification, OTA, and Warehouse source-of-truth boundaries are approved.

### Compliance gate

- The guest and occupant data inventory identifies purpose, approved/legal basis, authorized roles, masking, encryption, audit, retention, and purge/anonymization behavior.
- The complete occupant/check-in checklist and exception approval path have Legal/Policy sign-off.
- No implementation team is expected to invent legal retention periods or identity-document policy.

### Vendor gate

- One Channel Manager is selected, or Epic 14 remains blocked by an explicit product decision.
- API and webhook capabilities are proven against vendor documentation or sandbox behavior for property/rate/availability mapping and reservation create/change/cancel.
- Authentication, signature/replay behavior, rate limits, ordering, retry, reconciliation, support, and sandbox/production differences are recorded.
- The unknown external employee system has only a draft contract and source-of-truth boundary; no production adapter is estimated as ready.

### Pilot gate

- The pilot cohort, weekly review cadence, success metrics, support owners, and escalation path are named.
- The minimum cutover dataset is approved: properties, effective contracts/terms, in-house guests, future bookings, deposits, and open balances. Full history is explicitly excluded.

## Epic 01: Platform Baseline & Executable Walking Skeleton

### Required walking sequence

The acceptance test is one correlated, observable sequence—not a collection of isolated service health checks:

1. A privileged operator provisions a bootstrap Backoffice identity through the Authentication facade and Keycloak.
2. The User profile is created idempotently; retrying the provision command returns the same outcome without a duplicate profile or identity.
3. Admin Web and Admin Mobile sign in with Authorization Code plus PKCE against the Backoffice realm.
4. Each client queries `viewer` through Caddy, Backoffice Hive Router, and the User subgraph.
5. The committed account/profile action writes a transactional outbox event.
6. Notification validates and commits a durable inbox record, then creates one welcome or security notification.
7. Each client observes the notification through `notificationStream(afterCursor)` over GraphQL SSE.
8. After a forced disconnect, the client reconnects from its cursor without losing or rendering a second logical notification.

The User authorization snapshot gRPC path is exercised with mTLS, authenticated caller identity, and an explicit deadline during this sequence or its security test suite.

### Acceptance matrix

| Gate | Required evidence |
| --- | --- |
| Edge replacement | Caddy exposes only approved routes; Backoffice traffic uses a digest-pinned Hive Router; private subgraphs are unreachable publicly. |
| Identity | Three realm configurations are isolated; only Backoffice is active for MVP; wrong issuer, audience, signature, disabled account, and expired token tests pass. |
| Defense in depth | Router rejects invalid tokens and each called service independently rejects invalid caller context or insufficient object/operation permission. |
| Contracts | Supergraph composition, protobuf lint/breaking check, event schema validation, and provider/consumer tests run in CI. |
| Kafka | TLS/SASL/ACL configuration is enforced; outbox publication and inbox duplicate/collision/out-of-order tests pass. |
| gRPC | mTLS, caller identity, deadline, and idempotent-read retry rules have automated positive and negative tests. |
| Realtime | SSE authorization, cursor reconnect, duplicate suppression, slow consumer, and resynchronization behavior are tested through the public edge. |
| Observability | One correlation/trace can be followed across Caddy, router, service, gRPC, outbox, Kafka, consumer, and subscription; sensitive values are redacted. |
| Operations | Health/readiness, backup configuration, secret rotation, image rollback, incident, and restore runbooks exist and name an owner. |
| UX | The same walking outcome is demonstrated in Admin Web and Admin Mobile with loading, error, retry, and expired-session behavior. |

### Development database rebaseline gate

Rebaseline is allowed once for the current development databases only. It is not a default migration technique and is forbidden from pilot onward.

The scoped databases are:

- `vistay_authentication_db`
- `vistay_user_db`
- `vistay_property_db`
- `vistay_booking_db`
- `vistay_finance_db`
- `vistay_operations_db`
- `vistay_ota_db`
- `vistay_notification_db`
- `vistay_media_db`
- `vistay_warehouse_db`

Execute the steps in order and stop at the first failed gate:

1. Inventory each database, schema, migration history, table, approximate/exact row count as appropriate, and data owner. This phase is read-only.
2. Have the responsible domain owners confirm that no business or pilot data exists. Framework metadata and synthetic seed data must be distinguished from business data.
3. Create an encrypted backup outside the database host. Record the database, timestamp, tool/version, size, checksum, encryption/key reference, and operator in a manifest; never store a key or password in Git.
4. Restore the backup into isolated databases and run schema, row-count, migration-history, and representative query verification. A backup that has not restored successfully does not satisfy this gate.
5. Record the approved bounded-context schema baseline and the exact reset targets. Use owner/migrator/runtime roles separately.
6. Rebaseline only the approved development targets in a controlled window, apply migrations from an empty database, run constraints/contract/integration tests, and retain rollback evidence.

If business data is found, ownership is unclear, the backup cannot be verified, or the restore test fails, do not drop or reset anything. Preserve the databases and use forward-only migrations.

### Gateway retirement gate

`gateway_api` may be marked deprecated in documentation while replacement work proceeds. Archive it on GitHub only after the edge, identity, authorization, SSE, observability, and rollback gates in this document pass. Preserve history and a pointer to the new edge configuration; do not delete the repository.

### Recovery target placement

Epic 01 prepares backup, WAL, restore, and monitoring mechanics. Epic 15 must prove the pilot target of RPO no greater than five minutes and RTO no greater than four hours with an encrypted off-host restore drill. Automatic high availability is explicitly deferred to Epic 22.
