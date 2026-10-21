# ViStay Platform Contracts

Versioned contracts shared by ViStay services:

- Protocol Buffers for synchronous gRPC calls.
- CloudEvents-compatible JSON Schemas for Kafka events.
- Compatibility and naming rules used by CI.

Service implementations own their business logic. This repository owns only wire contracts and does not contain credentials, runtime configuration, or generated production data.

## Layout

- `proto/vistay`: protobuf packages, versioned by directory.
- `events`: CloudEvents envelope and event payload schemas.
- `docs`: compatibility and evolution rules.

Run `buf lint` to validate protobuf contracts and `npm test` to validate JSON Schemas.
