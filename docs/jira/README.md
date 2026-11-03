# ViStay Jira delivery catalog

`jira-catalog.v1.3.json` is the compiled, canonical implementation specification. Jira is canonical only for workflow status, assignee, sprint, comments, worklogs, attachments, and delivery evidence. The immutable `jira-catalog.v1.2.json` is retained as a migration snapshot; do not regenerate or edit it.

## Source layout

- `v1.3/epics/*.json`: reviewable source shards, one per epic plus `project.json`.
- `jira-catalog.v1.3.json`: deterministic compiler output; never edit it directly.
- `schema/jira-catalog.v1.3.schema.json`: structural contract.
- `scripts/build-jira-catalog.mjs`: compiler with duplicate identity protection.
- `scripts/validate-jira-catalog.mjs`: structural and semantic Definition-of-Ready gate.
- `scripts/audit-jira-readiness.mjs`: dispatch-safety and Jira-key coverage report.

The files under `service context/jira` and `service context/ViStay_Jira_Backlog_2026.txt` are historical inputs only. They are not authoritative and must not update Jira.

## Identity and specification states

`Source-ID` is stable; Jira keys are a backfilled transport identity and summaries are never used as the sole match key.

- `needs-refinement`: not safe to implement.
- `decision-required`: a named product or architecture decision is unresolved.
- `externally-blocked`: implementation requires an external input.
- `refined-parent`: non-dispatchable hierarchy record whose child boundary is complete.
- `executable`: a dispatchable leaf with concrete repository paths, artifacts, contracts, authorization, AC IDs, commands, and evidence mapping.
- `historical`: completed Jira history; the sync does not rewrite its description.

Only `Task`, `Subtask`, `Bug`, `Spike`, and `Tech Debt` may be dispatchable. `Epic` and `Story` describe outcomes and boundaries; they are never handed directly to an implementation agent.

The sync computes exactly one managed readiness label:

- `agent-ready`: executable and all prerequisites are Done.
- `agent-ready-after-dependencies`: executable but a prerequisite remains open.
- `needs-refinement`, `decision-required`, `externally-blocked`, `refined-parent`, or `historical`: mirrors the non-dispatch state.

An activation dependency such as production credentials does not block internal implementation. Put it in `activationBlockers`. Put only inputs required to write or test the implementation in `implementationBlockers`.

## Required workflow

From `platform_contracts`:

```powershell
npm run build:jira
npm run validate:jira
npm run audit:jira-readiness
```

From `platform_infrastructure`:

```powershell
.\scripts\jira\Sync-JiraCatalog.ps1 -Mode Validate
.\scripts\jira\Sync-JiraCatalog.ps1 -Mode DryRun
```

Review both the backup and plan. Apply at most five Source-IDs as a canary, read Jira back, then repeat the same selected DryRun and require zero changes:

```powershell
.\scripts\jira\Sync-JiraCatalog.ps1 -Mode Apply -SourceId VS-E00-T01,VS-E00-T02
.\scripts\jira\Sync-JiraCatalog.ps1 -Mode DryRun -SourceId VS-E00-T01,VS-E00-T02
```

Full apply is intentionally disabled unless `-ConfirmFullApply` is explicit. Issue creation is separately disabled unless `-AllowCreates` is explicit. The sync never transitions workflow status.

Promote an executable leaf only through the readiness gate:

```powershell
.\scripts\jira\Promote-JiraIssue.ps1 -IssueKey SCRUM-123 -TargetStatus Ready -Mode DryRun
.\scripts\jira\Promote-JiraIssue.ps1 -IssueKey SCRUM-123 -TargetStatus Ready -Mode Apply
```

## Weak-agent delivery contract

1. Branch from current `dev` using `agent/<source-id>-<slug>`.
2. Change only the repositories and paths listed by the issue.
3. Run every exact `testCases[].command`; attach the named evidence to Jira.
4. Open a PR to `dev`. Direct weak-agent pushes to `dev` are forbidden.
5. The repository ServiceOwner reviews and approves. CI, owner approval, merge to `dev`, and required smoke evidence are mandatory before Done.

English is used for technical specifications and acceptance tests. Vietnamese is used for product-decision notes. Never commit Jira tokens, provider credentials, customer data, or production policy values.
