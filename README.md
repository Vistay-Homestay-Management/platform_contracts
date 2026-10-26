# ViStay Platform Contracts

Versioned contracts shared by ViStay services:

- Protocol Buffers for synchronous gRPC calls.
- CloudEvents-compatible JSON Schemas for Kafka events.
- Compatibility and naming rules used by CI.

Service implementations own their business logic. This repository owns only wire contracts and does not contain credentials, runtime configuration, or generated production data.

## Layout

- `proto/vistay`: protobuf packages, versioned by directory.
- `events`: CloudEvents envelope and event payload schemas.
- `docs/evolution.md`: compatibility and evolution rules.
- `docs/adr-001-edge-identity-and-portal-federation.md`: Nginx, per-portal Hive Router, Keycloak realms, and edge retirement decision.
- `openapi/vietqr-callback.v1.yaml`: provider-facing callback contract owned by ViStay.
- `docs/adr-002-service-communication-and-data-boundaries.md`: GraphQL, gRPC, Kafka, webhook, SSE, Redis, and data ownership boundaries.
- `docs/epic-00-01-delivery-gates.md`: executable walking-skeleton, database rebaseline, and recovery gates.
- `docs/roadmap-traceability.md`: final Epic 00–22 index and mapping from the historical backlog.

Run `buf lint` to validate protobuf contracts and `npm test` to validate JSON Schemas.
