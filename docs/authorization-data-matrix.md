# Authorization data matrix

This matrix separates four independent checks. A service must allow the action,
filter or reject the record, protect classified fields, and enforce business
conditions. A database/service boundary identifies the source of truth; it is
not automatically an authorization boundary.

## Record scopes

| Scope | Meaning | Required evidence |
| --- | --- | --- |
| `SELF` | Actor's own profile/preferences | Authenticated account-to-profile mapping |
| `OWN` | Authoritative business ownership/participation | Relationship in the owning domain service; never `created_by` |
| `ASSIGNED` | Active workflow responsibility | Direct assignment or time-bounded assignment row |
| `PARTITION` | Membership of a named organizational/data partition | Exact `partition_type` + opaque UUID `partition_id` grant |
| `ALL` | All records inside the current platform/tenant boundary | Explicit grant; dominates record scopes but not field permissions |

Multiple grants are unioned. `ALL` dominates record filtering only. A caller
still needs the separate sensitive-field permission. Unknown scope or partition
types fail closed.

## Field classes

| Class | Examples | Default handling |
| --- | --- | --- |
| `PUBLIC` | Published property name, public media | May be exposed by public contract |
| `BASIC` | Booking code/status/dates, task title | Requires ordinary resource read |
| `PII` | Guest name, email, phone | Separate sensitive read and lifecycle purpose |
| `SENSITIVE_PII` | Identity document, bank identity | Explicit permission, audit and masking |
| `COMMERCIAL` | Booking totals, rates, discounts, payout | Separate commercial/sensitive read |
| `FINANCIAL_INTERNAL` | Ledger, reconciliation, fees | Finance/payment permission and audit |
| `SECURITY_SECRET` | Tokens, hashes, signing material | Never returned through domain APIs |
| `INTERNAL` | Notes, risk flags, operational evidence | Internal permission; omit/redact otherwise |
| `AUDIT` | Actor, reason, correlation and change diff | Audit permission; append-only source |

## Initial enforcement matrix

| Resource/action | Record predicates | Sensitive field permission | Owning service |
| --- | --- | --- | --- |
| `profile:read/update` | `SELF`, `ALL` | `profile:read_sensitive` for protected PII | User |
| `booking:read` | customer participation (`OWN`), active admin assignment (`ASSIGNED`), property/group `PARTITION`, `ALL` | `booking:read_sensitive` for COMMERCIAL/PII | Booking |
| `booking:update/cancel/check-in/out` | Same record predicate plus lifecycle condition | Field-specific mutation permission where applicable | Booking |
| `property:read/update` | host contract participation (`OWN`), explicit assignment, property/group partition, `ALL` | `property:read_sensitive` for internal/commercial fields | Property |
| `operations:read/update/close` | assignee/team assignment, property partition, `ALL` | `operations:read_sensitive` for evidence/internal notes | Operations |
| `payment:read/reconcile` | charge/reconciliation assignment, property partition, `ALL` | `payment:read_sensitive` for provider/bank data | Payment |
| `finance:read/export` | debtor/payee relation, workflow assignment, property/org partition, `ALL` | `finance:read_sensitive` / export permission | Finance |
| `media:read/delete` | authorization of referenced domain object, not uploader alone | domain-sensitive permission | Media + referenced owner |
| `notification:read/update` | recipient (`SELF`) or support assignment | content purpose permission | Notification |
| `ota:read/update` | channel/property assignment or partition | credential material is never exposed | OTA |
| `warehouse:read/export` | approved dataset/partition and purpose | explicit export plus field masking | Data Warehouse |

## Contract rules

- `PermissionGrant.partitions` is additive and backward compatible. Old clients
  ignore it; services requiring partition enforcement must reject a PARTITION
  scope without at least one valid binding.
- `partition_type` is a stable uppercase code. `partition_id` is opaque; only
  the resource-owning service resolves it.
- User/Authorization distributes grants. It does not query domain databases.
- List APIs apply predicates in the database query. Detail APIs reject an
  out-of-scope identifier. Frontends are never the enforcement layer.
- A missing/expired snapshot or unavailable authorization dependency fails
  closed for protected operations.
