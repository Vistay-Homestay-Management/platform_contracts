# Contract evolution rules

## Protocol Buffers

- Packages and paths end in a major version such as `v1`.
- Never reuse or renumber a field number; reserve removed fields and names.
- Additive fields must be optional or have a safe default.
- Breaking changes require a new package version.
- Reads use a two-second deadline by default. Automatic retries are limited to idempotent reads.
- Production calls use mTLS, an authenticated caller identity, and an explicit deadline. Caller metadata never replaces service-level authorization.

## GraphQL Federation

- Each portal has an independent supergraph contract. Backoffice, Host, and Customer clients do not share one unconstrained schema surface.
- The provider owns its subgraph SDL, entity keys, field semantics, and resolver authorization. Composition success does not prove authorization correctness.
- Add fields and enum values compatibly; deprecate before removal. A breaking field or semantic change requires a coordinated version and consumer migration.
- A retryable mutation accepts a stable idempotency key. A mutation susceptible to concurrent writes accepts an expected/optimistic version.
- Notification subscriptions expose a durable cursor and define reconnect, replay, authorization, and resynchronization behavior.

## Kafka events

- Topics use `vistay.<domain>.events.v1`; the aggregate UUID is the record key.
- `aggregateVersion` is ordering state. It is separate from the schema version in `type` and `dataschema`.
- Producers use a transactional outbox. Consumers validate the envelope and payload before durable inbox deduplication.
- Event IDs are globally unique UUIDs. A repeated ID with a different payload hash is a collision and must be rejected.
- Per-event signatures are intentionally not part of v1. Transport authentication is TLS plus SASL/SCRAM and broker ACLs.
- Product `eventId` and `occurredAt` map to CloudEvents `id` and `time`. `correlationId` follows the originating flow; `causationId` identifies the direct cause when one exists.
- Consumers must define duplicate and out-of-order handling. Arrival time is not aggregate ordering.

## External webhooks

- External callbacks are versioned separately from internal domain events.
- Validate HMAC or mTLS identity, timestamp/nonce replay window, schema, and idempotency before applying a command.
- Persist an inbox record and provide reconciliation; a successful HTTP acknowledgement is not proof that two systems agree.

## Ownership

Providers own their service implementation and GraphQL SDL. This repository owns shared protobuf and Kafka wire contracts only.

No contract authorizes direct access to another service's database. Consumers keep only explicit references, immutable snapshots, or owned projections.
