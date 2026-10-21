# Contract evolution rules

## Protocol Buffers

- Packages and paths end in a major version such as `v1`.
- Never reuse or renumber a field number; reserve removed fields and names.
- Additive fields must be optional or have a safe default.
- Breaking changes require a new package version.
- Reads use a two-second deadline by default. Automatic retries are limited to idempotent reads.

## Kafka events

- Topics use `vistay.<domain>.events.v1`; the aggregate UUID is the record key.
- `aggregateVersion` is ordering state. It is separate from the schema version in `type` and `dataschema`.
- Producers use a transactional outbox. Consumers validate the envelope and payload before durable inbox deduplication.
- Event IDs are globally unique UUIDs. A repeated ID with a different payload hash is a collision and must be rejected.
- Per-event signatures are intentionally not part of v1. Transport authentication is TLS plus SASL/SCRAM and broker ACLs.

## Ownership

Providers own their service implementation and GraphQL SDL. This repository owns shared protobuf and Kafka wire contracts only.
