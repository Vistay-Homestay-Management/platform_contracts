# TM-001: Edge, identity, and portal federation

- Artifact-ID: TM-001
- Version: 1.0.0
- Status: Accepted
- Date: 2026-10-29
- Last reviewed: 2026-10-29
- Review due: 2027-04-29
- Security owners: Platform and Security
- Related ADRs: ADR-001

## Scope, assets, and trust boundaries

This model covers Internet or tailnet clients, Nginx, the Backoffice Hive Router, Keycloak, GraphQL subgraphs, GraphQL SSE, and the private management plane. Assets are credentials, authorization codes, access/refresh tokens, sessions, profile/notification data, administrative operations, and trace/audit evidence.

Trust boundaries are client-to-Nginx, Nginx-to-Router/Keycloak, Router-to-subgraph, client reconnect-to-SSE cursor, and operator-to-management plane. Host and Customer realms and external provider callbacks are inactive until their ADR-001 entry gates pass.

## Threats and required controls

| ID | STRIDE | Threat | Required control and verification |
| --- | --- | --- | --- |
| E-01 | Spoofing | Forged or wrong-realm token reaches a subgraph. | Router and service independently validate signature, issuer, audience, expiry, and caller context; negative contract tests cover each rejection. |
| E-02 | Tampering | Redirect URI, PKCE exchange, forwarded identity, or GraphQL operation is altered. | Exact redirect allowlist, S256 PKCE, TLS, trusted-header stripping at Nginx, and persisted/approved operation policy where enabled. |
| E-03 | Repudiation | Privileged action cannot be attributed. | Propagate actor, correlation/trace ID, outcome, and reason into append-only audit evidence without tokens or raw PII. |
| E-04 | Information disclosure | Admin, token, introspection, subgraph, or cross-portal data becomes public. | Explicit Nginx allowlist, protected Keycloak administration, separate realms/routers, response masking, and external route probes in CI/smoke tests. |
| E-05 | Denial of service | Login, GraphQL, or SSE reconnect storms exhaust services. | Edge limits, query limits, bounded SSE buffers, reconnect backoff, readiness signals, and load/slow-consumer tests. |
| E-06 | Elevation of privilege | UI-hidden action, confused deputy, or stale session bypasses authorization. | Service-level action/object checks, short token lifetime, session revocation path, no trust based only on router/network, and denial tests. |
| E-07 | Replay | Authorization code, nonce, mutation, or SSE cursor is reused maliciously. | One-time code/nonce behavior, idempotency keys for retryable mutations, recipient-bound cursor authorization, duplicate suppression, and replay tests. |

## Residual risk and response

The pre-1.0 Hive Router and tailnet-only pilot are accepted temporary risks. Upgrades require authorization/subscription rollback regression; public provider callbacks remain disabled without trusted HTTPS and provider proof. Suspected token leakage triggers Keycloak session revocation, credential rotation, audit correlation, and the identity incident runbook.

## Change history

| Version | Date | Change |
| --- | --- | --- |
| 1.0.0 | 2026-10-29 | Initial STRIDE model for ADR-001. |
