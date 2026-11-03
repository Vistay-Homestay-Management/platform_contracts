# ViStay Jira catalog v1.2

This directory is the canonical source for the managed delivery specification in Jira. Jira remains canonical for workflow status, comments, attachments, sprint membership, worklogs, and delivery evidence.

## Contract

- `jira-catalog.v1.2.json` contains every managed open issue plus referenced historical dependencies.
- `schema/jira-catalog.schema.json` validates structure; `npm run validate:jira` adds semantic checks.
- `Source-ID` is the stable identity. Jira keys may change; automation must never match by summary alone.
- English is used for implementation specifications and acceptance tests. Vietnamese is used for product-decision comments.
- Synchronization may create or update managed fields, labels, parents, and links. It must not delete issues/comments or change workflow status unless an explicit transition phase is requested.

## Readiness labels

The sync computes exactly one readiness label:

- `agent-ready`: decision complete and no unresolved dependency or external blocker.
- `agent-ready-after-dependencies`: specification complete but linked prerequisites remain open.
- `decision-required`: a product or architecture decision is missing.
- `externally-blocked`: credentials, vendor approval, production endpoint, or another external input is missing.

Legacy `needs-refinement` and `agent-not-ready` labels are removed only after the record passes schema and semantic validation.

## Workflow

1. Edit the catalog and run `npm run validate:jira`.
2. Run infrastructure sync in `Validate`, then `DryRun` mode.
3. Review the JSON plan and backup path.
4. Run `Apply`, then run `DryRun` again; the second plan must report zero changes.

Never place Jira tokens or customer/provider secrets in this repository.
