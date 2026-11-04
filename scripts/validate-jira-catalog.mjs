import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, 'docs', 'jira', 'jira-catalog.v1.3.json');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const catalog = readJson(catalogPath);
const schemaName = catalog.schemaVersion === '1.3' ? 'jira-catalog.v1.3.schema.json' : 'jira-catalog.schema.json';
const schema = readJson(path.join(root, 'docs', 'jira', 'schema', schemaName));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

if (!validate(catalog)) {
  console.error(JSON.stringify(validate.errors, null, 2));
  process.exit(1);
}

const errors = [];
const byId = new Map();
const byJiraKey = new Map();
const genericPatterns = [
  /is delivered as a deterministic, authorized, observable capability/i,
  /implement and verify:/i,
  /version contract, persistence, authorization, failure, audit/i,
  /model legal states and transitions for/i,
  /unit tests cover rule boundaries/i,
  /integration tests cover persistence constraints/i,
  /postman\/newman flow covers happy path/i,
];
const unresolvedPattern = /\b(TBD|TODO|FIXME|unknown|decide later|to be decided)\b/i;
const repositoryPattern = /^(service_|frontend_|platform_|data_warehouse|cross-service)/;
const dispatchableTypes = new Set(['Task', 'Subtask', 'Bug', 'Spike', 'Tech Debt']);
const managedReadinessLabels = new Set(['agent-ready', 'agent-ready-after-dependencies', 'decision-required', 'externally-blocked', 'needs-refinement', 'refined-parent', 'historical', 'agent-not-ready']);

for (const issue of catalog.issues) {
  if (byId.has(issue.sourceId)) errors.push(`duplicate Source-ID ${issue.sourceId}`);
  byId.set(issue.sourceId, issue);
  if (issue.jiraKey) {
    if (byJiraKey.has(issue.jiraKey)) errors.push(`duplicate jiraKey ${issue.jiraKey}`);
    byJiraKey.set(issue.jiraKey, issue.sourceId);
  }
  if (issue.sourceId !== 'PROJECT-GUIDE' && !issue.summary.startsWith(`[${issue.sourceId}]`)) {
    errors.push(`${issue.sourceId}: summary must begin with [Source-ID]`);
  }
  if (issue.issueType === 'Subtask' && !issue.parentSourceId) errors.push(`${issue.sourceId}: Subtask needs parentSourceId`);
  if (issue.parentSourceId === issue.sourceId) errors.push(`${issue.sourceId}: cannot parent itself`);
  if (issue.repositories.some((repo) => !repositoryPattern.test(repo))) {
    errors.push(`${issue.sourceId}: repository names must be explicit or cross-service`);
  }
  if (catalog.schemaVersion !== '1.3') {
    if (issue.decisionStatus === 'approved' && issue.businessRules.some((rule) => unresolvedPattern.test(rule))) {
      errors.push(`${issue.sourceId}: approved rules contain an unresolved placeholder`);
    }
    continue;
  }

  if (!issue.jiraKey) errors.push(`${issue.sourceId}: v1.3 record needs a backfilled jiraKey`);
  if ((issue.labels ?? []).some((label) => managedReadinessLabels.has(label))) {
    errors.push(`${issue.sourceId}: readiness labels are computed and cannot be declared in catalog labels`);
  }

  const allText = JSON.stringify(issue);
  const acceptanceIds = issue.acceptanceCriteria.map((criterion) => criterion.id);
  if (new Set(acceptanceIds).size !== acceptanceIds.length) errors.push(`${issue.sourceId}: duplicate acceptance criterion ID`);
  if (issue.dispatchable && !dispatchableTypes.has(issue.issueType)) {
    errors.push(`${issue.sourceId}: ${issue.issueType} cannot be dispatched directly`);
  }
  if (issue.dispatchable !== (issue.specStatus === 'executable')) {
    errors.push(`${issue.sourceId}: dispatchable must be true exactly when specStatus is executable`);
  }
  if (issue.specStatus === 'historical' && issue.manageDescription) {
    errors.push(`${issue.sourceId}: historical issue descriptions are immutable`);
  }
  if (issue.specStatus === 'decision-required' && !issue.decisions.some((decision) => decision.status === 'required')) {
    errors.push(`${issue.sourceId}: decision-required needs an unresolved decision with a named owner`);
  }
  if (issue.specStatus === 'externally-blocked' && !issue.externalBlockers.length) {
    errors.push(`${issue.sourceId}: externally-blocked needs an explicit external blocker`);
  }
  if (issue.specStatus !== 'needs-refinement' && issue.specStatus !== 'historical' && unresolvedPattern.test(allText)) {
    errors.push(`${issue.sourceId}: refined specification contains an unresolved placeholder`);
  }

  if (issue.specStatus === 'executable') {
    if (!issue.primaryRepository || !issue.repositories.includes(issue.primaryRepository)) {
      errors.push(`${issue.sourceId}: executable issue needs a primaryRepository present in repositories`);
    }
    if (!issue.repositorySlices?.length || issue.repositorySlices.some((slice) => !slice.paths.length || !slice.artifacts.length)) {
      errors.push(`${issue.sourceId}: executable issue needs repository paths and named artifacts`);
    }
    if (genericPatterns.some((pattern) => pattern.test(allText))) {
      errors.push(`${issue.sourceId}: executable issue still contains generator boilerplate`);
    }
    if (issue.authorization.actions.some((action) => action.startsWith(issue.sourceId.toLowerCase()))) {
      errors.push(`${issue.sourceId}: executable issue uses synthetic Source-ID authorization actions`);
    }
    if (!issue.testCases.length) errors.push(`${issue.sourceId}: executable issue needs structured test cases`);
    const covered = new Set(issue.testCases.flatMap((testCase) => testCase.verifies));
    for (const id of acceptanceIds) {
      if (!covered.has(id)) errors.push(`${issue.sourceId}: ${id} has no test/evidence mapping`);
    }
    for (const testCase of issue.testCases) {
      if (/^(run|execute|verify|test)\b/i.test(testCase.command) || !/[\\/]|npm|pnpm|mvn|gradle|dotnet|newman|docker|curl|manual:/i.test(testCase.command)) {
        errors.push(`${issue.sourceId}: ${testCase.id} command is not reproducible enough`);
      }
      for (const id of testCase.verifies) {
        if (!acceptanceIds.includes(id)) errors.push(`${issue.sourceId}: ${testCase.id} references unknown ${id}`);
      }
    }
  }
}

const parentIds = new Set(catalog.issues.map((issue) => issue.parentSourceId).filter(Boolean));
for (const issue of catalog.issues) {
  if (issue.specStatus === 'refined-parent' && !parentIds.has(issue.sourceId)) {
    errors.push(`${issue.sourceId}: refined-parent needs at least one child issue`);
  }
  if (issue.parentSourceId && !byId.has(issue.parentSourceId)) errors.push(`${issue.sourceId}: missing parent ${issue.parentSourceId}`);
  if (catalog.schemaVersion === '1.3' && issue.specStatus === 'executable' && issue.parentSourceId) {
    const parent = byId.get(issue.parentSourceId);
    if (parent && !['refined-parent', 'executable', 'historical'].includes(parent.specStatus)) {
      errors.push(`${issue.sourceId}: executable child has unrefined parent ${issue.parentSourceId}`);
    }
  }
  for (const dependency of issue.dependencies ?? []) {
    if (!byId.has(dependency.sourceId)) errors.push(`${issue.sourceId}: missing dependency ${dependency.sourceId}`);
    if (dependency.sourceId === issue.sourceId) errors.push(`${issue.sourceId}: self dependency`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const counts = catalog.issues.reduce((result, issue) => {
  result[issue.issueType] = (result[issue.issueType] ?? 0) + 1;
  return result;
}, {});
console.log(`Jira catalog ${catalog.schemaVersion} valid: ${catalog.issues.length} issues ${JSON.stringify(counts)}`);
