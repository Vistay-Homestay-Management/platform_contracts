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
- `docs/architecture-artifacts.json`: machine-checked ADR and threat-model version registry.
- `docs/architecture-artifact-versioning.md`: lifecycle, versioning, review, and supersession rules.
- `docs/pricing-v1-policy.md`: approved ownership, stay-product, rate-version, and collection-accountability baseline.
- `docs/pricing-v1-quote-calculation.md`: deterministic SCRUM-355 quote-calculation and explanation contract.
- `docs/pricing-v1-manual-override.md`: immutable SCRUM-356 manual-reduction authorization and evidence contract.
- `docs/pricing-v1-publication-and-snapshots.md`: SCRUM-357 publication CAS, effective active selection, and immutable pricing-backed quote snapshot contract.
- `docs/pricing-v1-rate-profile-published-event.md`: Booking publication event topic, ordering, delivery, and reconciliation contract.
- `fixtures/pricing-v1-publication-fingerprint.v1.json`: cross-language canonical `PRICING_PUBLICATION_V1` fingerprint test vector.
- `docs/adr-001-edge-identity-and-portal-federation.md`: Nginx, per-portal Hive Router, Keycloak realms, and edge retirement decision.
- `openapi/vietqr-callback.v1.yaml`: provider-facing callback contract owned by ViStay.
- `docs/adr-002-service-communication-and-data-boundaries.md`: GraphQL, gRPC, Kafka, webhook, SSE, Redis, and data ownership boundaries.
- `docs/epic-00-01-delivery-gates.md`: executable walking-skeleton, database rebaseline, and recovery gates.
- `docs/roadmap-traceability.md`: final Epic 00–22 index and mapping from the historical backlog.

Run `buf lint` to validate protobuf contracts and `npm test` to validate JSON Schemas, GraphQL contracts, and architecture artifacts.
