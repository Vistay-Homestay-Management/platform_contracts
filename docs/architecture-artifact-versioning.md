# Architecture artifact versioning

ADRs and threat models are versioned security and architecture contracts. Their registry is `architecture-artifacts.json`; CI rejects an unregistered artifact, duplicate ID/path, invalid semantic version, missing relationship, or metadata drift between the registry and Markdown.

## Lifecycle

Allowed states are `Proposed`, `Accepted`, `Deprecated`, and `Superseded`.

- `Proposed` records an option being evaluated and cannot authorize production implementation.
- `Accepted` is the current approved decision or threat model.
- `Deprecated` remains valid only during a named migration window.
- `Superseded` is historical evidence and must link to its replacement in the registry.

Accepted artifacts have an owner, last-reviewed date, and review-due date. Review is also mandatory when a trust boundary, public route, identity population, sensitive data class, protocol, external provider, or authorization topology changes.

## Versioning

Versions use semantic versioning:

- PATCH: editorial clarification with no changed decision, threat, control, or consumer obligation.
- MINOR: backward-compatible addition such as a new flow, threat, or verification control.
- MAJOR: replaced decision, changed trust boundary, removed control, or incompatible consumer obligation.

Every version change updates the artifact's change-history table and registry entry in the same commit. Git commit SHA is the immutable evidence for that version; version numbers describe compatibility and review intent, not mutable releases.

## Change workflow

1. Update the ADR before implementing a changed architecture boundary.
2. Update its related threat model and verification evidence in the same change.
3. Update the registry and change history, then run `npm test` and `buf lint`.
4. Obtain the named owner/security review required by the affected boundary.
5. Attach the immutable commit and green CI run to the Jira decision or delivery ticket.

Credentials, tokens, raw PII, exploit secrets, and production topology secrets do not belong in these artifacts. Record a secret-manager reference or restricted evidence location instead.
