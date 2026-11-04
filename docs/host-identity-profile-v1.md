# Host identity and profile contract v1

Status: `PUBLISHED` after validation of the immutable v1 artifact.

This document is the contract boundary for Epic 16. It describes the Host
identity population without implementing authentication, profile persistence,
property membership, or media storage. Runtime behavior remains owned by the
service named in each operation.

## Ownership and identity boundary

| Concern | Owner | Contract rule |
| --- | --- | --- |
| Credential, issuer, audience, invitation activation and session state | Keycloak through Authentication | No local password, refresh token, session secret, or parallel JWT model. |
| Account identity and lifecycle policy | Authentication | `accountId` is unique inside the `HOST` realm; lifecycle transitions are versioned. |
| Host profile and contact data | User | `profileId` is distinct from the Keycloak subject and account ID. |
| Property/branch binding | Property | A Host scope comes only from the active Property-owned `OWNED` term and branch membership; missing or ambiguous membership fails closed. |
| Media reference and object lifecycle | Media | Profile stores an opaque media reference, never a presigned URL or document bytes. |
| Wire contract and compatibility catalogue | Platform Contracts | Versioned REST/GraphQL/Kafka schemas and deterministic fixtures only. |

The Host realm is represented by the logical identifiers `HOST`,
`KEYCLOAK_HOST_ISSUER`, `host-portal`, and `host-api`. They are contract
aliases, not deployment URLs or production configuration. Equal email or phone
values across realms never merge subjects. A same-realm duplicate normalized
contact or subject is rejected with `HOST_SUBJECT_COLLISION`.

## Aggregate and state model

The contract has four references: `invitationId`, `accountId`, `profileId`, and
`sessionId`. They are opaque UUIDs. Keycloak owns credential and session
material; the contract exposes only IDs, state, version, and safe projections.

Invitation states are `PENDING -> ACTIVATED`, with terminal `EXPIRED` and
`REVOKED` states. Account lifecycle states are `INVITED -> ACTIVE -> SUSPENDED
-> ACTIVE` and `ACTIVE -> DEACTIVATED`; a deactivated account cannot be
reactivated by a Host self-service operation. Session states are `ACTIVE`,
`EXPIRED`, and `REVOKED`.

The published artifact lifecycle is `DRAFT -> VALIDATED -> PUBLISHED`.
Validation failure leaves the candidate unpublished. Rollback selects the last
validated immutable artifact; it does not edit that artifact in place.

## Interfaces

The machine-readable source is under `schemas/host-identity/`.

- REST OpenAPI v1 covers invitation issue/activation, viewer projection,
  profile update, lifecycle commands, and session revocation. Admin-only
  commands use the logical Backoffice realm; Host self-service uses the Host
  realm.
- GraphQL v1 exposes the Host `hostViewer` query and self profile update. The
  Host graph is independent from Backoffice and Customer graphs.
- Kafka events use the shared ViStay envelope and are under
  `events/host-account/v1/`. The topic is `<type>.v<version>` and the record
  key is the aggregate ID.

Every externally consumed operation declares its owner, caller, timeout,
authorization action, data partition, field groups, idempotency rule, and
stable errors in `host-identity-contract.v1.json`.

## Authorization and field groups

The default field group is `SUMMARY`. `PII`, `DOCUMENT`, and
`INTERNAL_AUDIT` require an explicit grant and are never inferred from a
parent-object permission.

| Action | Caller boundary | Partition | Default fields |
| --- | --- | --- | --- |
| `host-contract:publish` | Release operator | `SYSTEM` contract catalogue | `SUMMARY` |
| `host:invite` | Backoffice administrator | Explicit `ADMIN:SITE` or `ADMIN:BRANCH` | `SUMMARY`, explicit `PII` |
| `host:activate` | Invited Host | Invitation subject only | `SUMMARY` |
| `host:read` | Host self or authorized administrator | `SELF`, `PROPERTY:OWN`, or explicit admin partition | `SUMMARY` |
| `host:profile:update` | Host self or authorized administrator | `SELF` or explicit admin partition | `SUMMARY`, explicit `PII` |
| `host:lifecycle:manage` | Backoffice administrator | Explicit `ADMIN:SITE` or `ADMIN:BRANCH` | `SUMMARY`, explicit `INTERNAL_AUDIT` |
| `host:session:revoke` | Host self or authorized administrator | `SELF` or explicit admin partition | `SUMMARY` |

`PROPERTY:OWN` is a source-backed binding, not a caller-supplied claim. The
Property service resolves the active property term and non-overlapping branch
membership. The contract never infers ownership from an email, role name,
property ID in a request, or a missing dependency. If Property or Media is
unavailable, the operation fails closed with `HOST_PARTIAL_DEPENDENCY`.

## Stable errors and compatibility

Stable error codes include `HOST_WRONG_REALM_OR_TYPE`,
`HOST_SUBJECT_COLLISION`, `HOST_INVITATION_REPLAY`, `HOST_STALE_VERSION`,
`HOST_RESTRICTED_FIELD`, `HOST_PARTIAL_DEPENDENCY`,
`HOST_REDACTION_REQUIRED`, `HOST_CREDENTIAL_OWNER_VIOLATION`,
`HOST_INVALID_STATE_TRANSITION`, and `HOST_IDEMPOTENCY_CONFLICT`.

Clients may add fields and enum values only when they are optional or safely
ignored. Removing or changing the meaning of a required field creates a new
major contract version. A repeated idempotency key with the same canonical
request returns the original effect; the same key with a different request is
an explicit conflict. Event consumers use `aggregateVersion` for ordering and
reject a repeated event ID with a different payload hash.

No test fixture contains a token, password, presigned URL, private document,
or production/customer value. Diagnostics contain the fixture name, stable
error code, and correlation ID only.
