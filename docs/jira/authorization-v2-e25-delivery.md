# VS-E25 — Authorization v2 and GraphQL Data Access Hardening

This file is the checked-in Jira delivery payload for environments where Jira
write access is not available to CI. Apply it to the project backlog without
rewriting completed issue history.

Labels for the Epic and every child: `authorization-v2`, `graphql`,
`redis-policy-cache`, `n-plus-one`, `security-remediation`. Set the component to
the owning repository/module named below.

## Stories and repository subtasks

1. **Permission registry, JWT and role-policy contracts**
   - `platform_contracts`: version `GetRolePolicies`, role-policy changed event,
     canonical permission catalog and compatibility aliases.
   - `service_user`: migrate catalog/version/partition-type policy data.
   - `platform_infrastructure`: emit only identity plus API client roles; enforce
     five-minute access tokens and remove permission-like OAuth scopes.
   - Evidence: schema validation, realm contract test and migration contract.
2. **Dynamic role lifecycle and maker-checker**
   - `service_user`: role catalog/detail, create/change/deactivate requests,
     approval/rejection, CAS, idempotency, audit and outbox.
   - `frontend_admin`: Web/Mobile API workspace for role-policy requests.
   - Failure codes: `MAKER_CHECKER_VIOLATION`, `ROLE_VERSION_CONFLICT`,
     `IDEMPOTENCY_CONFLICT`, `PROTECTED_ROLE_INVARIANT`, `SYSTEM_ROLE_PROTECTED`.
   - Rollback: disable mutations while retaining role and audit history; custom
     roles are never hard-deleted.
3. **User → Keycloak role projection, expiry and reconciliation**
   - `service_authentication`: exact client-role reconciliation, profile claim,
     event-driven logout and scheduled drift repair.
   - `service_user`: expire assignments into an explicit versioned revocation.
   - Evidence: Keycloak mock tests, realm claim contract and expiry integration.
4. **Shared Redis cache and resolver-bound authorization**
   - `service_user`: sole cache writer at
     `vistay:authz:role-policy:v2:{accountType}:{roleCode}` with TTL jitter.
   - Service subtasks: request-scoped MGET, one batch fallback, fail-closed
     `AUTHORIZATION_UNAVAILABLE`, exact invalidation and resolver annotations.
   - Rollback: retain snapshot v1 dual-read until comparison is clean.
5. **Scope-specific projections, batching and N+1 remediation**
   - `service_booking`: SELF/OWN/ASSIGNED/PARTITION/ALL entry points, SQL-first
     predicates, cursor pages, source masking and query-count gates.
   - `service_property`: batch property-partition contract.
   - `platform_contracts`: batch booking authorization contract.
   - Evidence: 1/10/100 query-count, cross-actor/branch isolation and sensitive
     field tests.
6. **Admin Web/Mobile, Postman/Newman and migration rollout**
   - `frontend_admin`: role catalog, permission diff and checker queue parity.
   - `platform_infrastructure`: login → request → approve → refresh → allow/deny
     → revoke → five-minute-window Newman flow.
   - Rollout: contracts → User/DB → Auth/Keycloak → Redis/guard → services → UI.
   - Rollback: feature flags and snapshot-v1 dual-read; remove compatibility
     tables/RPCs only after reconciliation mismatch is zero.

Every subtask must attach its API/schema version, migration, stable failure
codes, exact test command, dependency, rollback and machine-readable evidence.

## Existing backlog remediation

- `SCRUM-533`, `SCRUM-694`, `SCRUM-714`, `SCRUM-836`: replace snapshot/action
  authorization and notification scope vocabulary with the VS-E25 contracts;
  link the appropriate Story above.
- Do not edit completed acceptance history for `SCRUM-779`, `SCRUM-807`, or
  `SCRUM-816`. Add a review finding that router `@requiresScopes`, legacy
  permission names and per-node authorization calls are remediated by VS-E25.
- Review all 14 In Review issues against merged code and evidence. Thirteen may
  move to Done when their repository checks pass. Keep `SCRUM-815` In Review
  until the live Host Newman run is attached using a short-lived credential.

Promotion remains `dev` PR + green CI → `test` → Compose smoke. Local changes
in Booking, Infrastructure and Admin must be merged manually rather than reset.
