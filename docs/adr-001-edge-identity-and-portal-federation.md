# ADR-001: Edge, identity, and portal federation

- Artifact-ID: ADR-001
- Version: 1.0.0
- Status: Accepted
- Date: 2026-10-26
- Last reviewed: 2026-10-29
- Review due: 2027-04-29
- Decision owners: Platform, Security, and Product
- Threat model: TM-001
- Supersedes: the planned Apollo Router plus Spring Cloud Gateway stack

## Context

ViStay needs one understandable public boundary for browser, mobile, identity, media, and external webhook traffic. Running both a Java gateway and a GraphQL router would duplicate routing, authentication, telemetry, failure handling, and deployment concerns without adding a product capability needed by the pilot.

The Backoffice portal is the first release target. Host and Customer portals have different identity populations and data scopes, and will be activated after the pilot. Coupling all three portals to one supergraph and one identity realm would make authorization mistakes harder to contain.

## Decision

### Public edge

Nginx is the only HTTP(S) ingress. It performs explicit host/path routing and basic transport controls and terminates TLS when public exposure is enabled. It does not contain business logic or make final authorization decisions. The Tailscale pilot may run tailnet-only HTTP until a trusted public certificate/domain gate is satisfied; provider callbacks remain disabled in that mode.

The permitted public route classes are:

| Route class | Destination | Notes |
| --- | --- | --- |
| Portal GraphQL | The portal's Hive Router | Backoffice only in the MVP; Host and Customer are activated later. |
| OIDC/OAuth2 | Keycloak | Only the endpoints required by the supported identity flows are exposed. Administrative access stays on the protected management network. |
| Presigned media object path | Object storage or the Media boundary | The application authorizes issuance of a short-lived URL; binary content does not traverse GraphQL. |
| Channel Manager webhook | OTA service | Enabled only after vendor proof, with signature or mTLS validation and replay protection. |
| VietQR callback | Payment service | Enabled only after merchant onboarding, UAT, public HTTPS, bearer-token authentication, replay protection and reconciliation tests. |

Subgraphs, gRPC servers, Kafka, Redis, databases, Keycloak administration, and infrastructure administration are not public routes.

### GraphQL federation

ViStay uses the Docker image `ghcr.io/graphql-hive/router` as the sole GraphQL federation edge. Deployments must pin both an approved version tag and immutable digest; `latest` is forbidden. Every upgrade needs compatibility, authorization, subscription, and rollback regression tests, with the previous known-good image retained.

Each portal has an independent router instance and supergraph contract:

- Backoffice Router: active for the MVP.
- Host Router: inactive until Epic 16–17 entry gates pass.
- Customer Router: inactive until Epic 18–19 entry gates pass.

This is deployment and contract isolation, not permission to duplicate domain ownership. Subgraphs continue to expose domain-owned fields and entities.

### Identity

Keycloak is the identity provider. It has separate `backoffice`, `host`, and `customer` realms. The realms have distinct issuers, audiences, clients, policies, and account lifecycles. An equal email address or phone number does not merge identities between realms.

Browser and mobile clients use Authorization Code with PKCE. Public Backoffice registration is disabled. Host accounts are invited/provisioned after the pilot; Customer self-registration is introduced with the Customer portal.

The Authentication service remains an application facade for provisioning, lifecycle policy, identity links, and security events. It does not store a second custom password or issue a parallel shared-secret JWT.

### Authorization chain

Hive Router validates token signature through JWKS and checks the expected issuer and audience before forwarding a GraphQL operation. Every subgraph then validates the caller context again and enforces operation- and object-level authorization. UI visibility is never the enforcement boundary.

Internal service calls carry caller identity over mTLS-protected gRPC. A trusted network location alone does not grant a business permission.

### Realtime delivery

Client realtime notification delivery uses GraphQL subscription over SSE through the applicable Hive Router. The subscription accepts a durable cursor (for example, `notificationStream(afterCursor)`) so a reconnect can resume or explicitly resynchronize. A separate public REST SSE endpoint is not part of the target architecture.

## Consequences

- Spring Cloud Gateway is removed from the target runtime, and Apollo Router is not part of the target runtime. `gateway_api` is permanently deleted after a verified git bundle and the replacement gate.
- Edge configuration, portal router configuration, supergraph artifacts, and image pins belong in `platform_infrastructure`.
- Service-owned GraphQL SDL stays with its provider; shared protobuf and event wire contracts stay in this repository.
- There is a small operational cost for separate portal routers, accepted in exchange for smaller security and schema blast radii.
- Hive Router is pre-1.0 at the time of this decision, so its regression and rollback gates are mandatory rather than advisory.

## Replacement and rollback gate

The existing `gateway_api` repository is deprecated and deleted only after a complete `git bundle --all` plus checksum is verified and all of the following pass:

1. Nginx routes only the approved public surfaces and cannot reach private subgraphs directly.
2. Backoffice PKCE login and `viewer` query work through Hive Router.
3. Wrong issuer, audience, signature, role, and object scope are rejected at the expected layer.
4. Subscription reconnect from a cursor is tested through Nginx and Hive Router.
5. Trace/correlation context reaches the responsible service.
6. A pinned previous Nginx/Hive Router image set can be restored using the documented rollback procedure.
7. The gateway bundle restores into an isolated repository and its default-branch head checksum matches the deletion manifest.

Until that gate passes, the old gateway repository is retained only as a rollback artifact; it is not present in runtime topology and receives no new business capability.

## Change history

| Version | Date | Change |
| --- | --- | --- |
| 1.0.0 | 2026-10-29 | Accepted baseline registered with TM-001 and a scheduled review. |
