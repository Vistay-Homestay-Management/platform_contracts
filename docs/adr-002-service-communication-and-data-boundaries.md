# ADR-002: Service communication and data boundaries

- Status: Accepted
- Date: 2026-10-23
- Decision owners: Architecture and domain service owners

## Context

ViStay keeps ten logical services but activates them in phases. Without explicit protocol and ownership rules, a feature could bypass a service through its database, turn Kafka into synchronous RPC, or place authorization and retry behavior in inconsistent layers. The pilot needs a small number of repeatable patterns that preserve correctness for inventory, money, identity, and guest data.

## Decision

### Protocol selection

| Interaction | Protocol | Required behavior |
| --- | --- | --- |
| Portal query, mutation, subscription | GraphQL Federation through the portal's Hive Router | Service-level authorization; idempotency key for retryable commands; optimistic version for concurrent updates. |
| Internal synchronous read or command | gRPC | mTLS, authenticated caller identity, explicit deadline, bounded retries only for idempotent operations. |
| Domain fact and asynchronous workflow | Kafka | TLS plus SASL and ACLs, transactional outbox, durable inbox deduplication, partition key by aggregate ID. |
| External callback/webhook | HTTPS via Caddy | HMAC signature or mTLS, timestamp/nonce replay check, inbox deduplication, rate limit and reconciliation. |
| Client realtime notification | GraphQL subscription over SSE | Durable cursor, authorization per recipient, reconnect and resynchronization behavior. |

Kafka is not used as a request/reply substitute for a user waiting on a synchronous answer. gRPC is not used to distribute domain facts. An external webhook is never trusted merely because its source IP looks familiar.

### Event envelope

The canonical wire envelope is the ViStay v1 common event envelope. It is deliberately a single contract rather than a ViStay envelope nested inside CloudEvents:

| Product term | Canonical field |
| --- | --- |
| event identity | `eventId` |
| occurrence time | `occurredAt` |
| event name and schema version | `type`, `version` |
| source aggregate | `aggregateId`, `aggregateVersion` |
| request/workflow trace | `correlationId`, nullable `causationId` |
| payload | `data` |

The Kafka topic is derived as `<type>.v<version>` and the record key is `aggregateId`. The deprecated `cloudevent-envelope.schema.json` filename is only a compatibility alias to this same schema; it does not define a second wire shape.

The producer writes its state and outbox record in one local transaction. A consumer validates the envelope and payload before committing a durable inbox/deduplication record with its local effects. A repeated event ID with a different payload hash is a collision and is rejected and alerted. Out-of-order behavior is decided using the aggregate version, not arrival time.

Internal Kafka events have no per-event application signature. Broker transport authentication is TLS plus SASL and ACLs. External webhooks use HMAC or mTLS because they cross a different trust boundary.

### Data ownership

Each service has its own PostgreSQL database and migration/runtime identities. No service reads or writes another service's database. A consumer stores only the reference, immutable snapshot, or explicitly owned projection needed for its behavior.

Key invariants are:

- Property owns the exact-unit and asset master plus supply contracts and effective terms.
- Operations owns inspections, incidents, condition history, work orders, and readiness.
- Booking is the sole writer of inventory blocks and owns quote, hold, reservation, and stay state. Other services request block or unblock; they do not mutate availability tables.
- Finance owns charges, deposits, payments, allocation, reversals, settlements, and the financial audit trail.
- Authentication/Keycloak owns credential and session concerns; User owns profile and contact data.
- Media owns object metadata and lifecycle; the relevant domain owns the purpose, business reference, and access decision.
- Notification owns notification inbox, delivery attempts, read state, and subscription cursors. It consumes facts; it does not become the fact owner.
- OTA owns Channel Manager mappings, webhook inbox, synchronization state, and reconciliation, while Booking remains the reservation and inventory authority.
- Data Warehouse owns analytical copies and models and never becomes the transactional source of truth.

Contract terms are effective-dated. A property's `OWNED`, `LEASED_BY_VISTAY`, or `MANAGEMENT` model is derived from the active term, not stored as an unchanging property attribute.

### Redis boundary

Redis is limited to short-lived security and coordination data: token/session denylist, nonce, replay window, and rate-limit counters. Business entities, prices, availability, balances, and contract state are not cached in Redis during the MVP.

## Failure and consistency rules

- A local commit does not wait for email, push, analytics, or another asynchronous consumer to succeed.
- Every retried externally visible command has a stable idempotency key and a stored outcome.
- Inventory, money, and effective-dated terms have database constraints in addition to application checks.
- Compensation is explicit; a distributed transaction is not simulated with unbounded synchronous calls.
- Reconciliation is a first-class capability for OTA, notification delivery, financial projections, inventory blocks, and cutover imports.

## Security and observability

- Propagate correlation and trace context across GraphQL, gRPC, outbox events, and webhook processing.
- Do not place secrets, access tokens, raw guest identifiers, or document contents in logs or domain events.
- Apply least-privilege database roles, Kafka ACLs, service identities, and object-level authorization.
- Audit privileged state changes with actor, time, reason, before/after values, and correlation ID.

## Consequences

This design accepts eventual consistency for projections and downstream effects. Product flows must display pending and reconciliation states rather than pretending every service changed atomically. Cross-service features require provider/consumer contract tests and end-to-end tests for duplicates, ordering, timeouts, and authorization.
