# TM-002: Service communication and data boundaries

- Artifact-ID: TM-002
- Version: 1.0.0
- Status: Accepted
- Date: 2026-10-29
- Last reviewed: 2026-10-29
- Review due: 2027-04-29
- Security owners: Architecture, Platform, and domain service owners
- Related ADRs: ADR-002

## Scope, assets, and trust boundaries

This model covers portal GraphQL, internal gRPC, Kafka/outbox/inbox delivery, external webhooks, Redis coordination data, and per-service PostgreSQL ownership. Assets include inventory, money, identity/profile, guest data, effective terms, domain events, idempotency outcomes, and audit/reconciliation evidence.

Each protocol crossing and every service/database boundary is a trust boundary. A service identity proves the caller workload, not the end user's business permission. A database, Kafka topic, Redis keyspace, or event consumer is never implicitly trusted because it is inside the deployment network.

## Threats and required controls

| ID | STRIDE | Threat | Required control and verification |
| --- | --- | --- | --- |
| S-01 | Spoofing | Unauthorized workload calls gRPC or Kafka. | mTLS workload identity, Kafka TLS/SASL and per-topic ACLs, caller allowlists, explicit deadlines, and negative identity tests. |
| S-02 | Tampering | Event, webhook, or cross-service request is altered. | Schema validation, TLS, provider HMAC/mTLS where external, payload-hash collision detection, and malformed/tampered input tests. |
| S-03 | Repudiation | Sensitive domain change lacks reliable attribution. | Actor/service identity, reason, correlation/causation ID, before/after audit, outbox/inbox evidence, and clock-aware timestamps. |
| S-04 | Information disclosure | Service reads another database or emits secrets/PII. | Separate DB roles/databases, contract-only access, least-privilege projections, event/log redaction, and repository/topology checks. |
| S-05 | Denial of service | Retry amplification, poison events, or slow dependency exhausts a flow. | Bounded retry/backoff, deadlines, dead-letter/operator repair, circuit/readiness signals, and dependency-unavailable tests. |
| S-06 | Elevation of privilege | Workload identity or client-supplied scope becomes a business grant. | Provider-side action/object/partition authorization and authoritative owner resolution; denial and mismatch tests. |
| S-07 | Replay | Duplicate webhook/event/command repeats money or inventory effects. | Durable idempotency outcome, transactional outbox, inbox deduplication, nonce/timestamp window, aggregate ordering, and replay/collision tests. |
| S-08 | Consistency abuse | Concurrent or out-of-order changes corrupt inventory, money, or terms. | Optimistic versions, database invariants, aggregate versions, explicit compensation/reconciliation, and concurrency tests. |

## Residual risk and response

Eventual consistency can expose a bounded stale projection. User flows must show pending/reconciliation state and operators must have repair evidence. A suspected boundary breach freezes the affected consumer/credential, preserves inbox/outbox/audit evidence, rotates identity material, and reconciles from the owning service rather than editing another database.

## Change history

| Version | Date | Change |
| --- | --- | --- |
| 1.0.0 | 2026-10-29 | Initial STRIDE model for ADR-002. |
