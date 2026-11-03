import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, 'docs', 'jira', 'jira-catalog.v1.2.json');
const schemaPath = path.join(root, 'docs', 'jira', 'schema', 'jira-catalog.schema.json');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const catalog = readJson(catalogPath);
const schema = readJson(schemaPath);
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

if (!validate(catalog)) {
  console.error(JSON.stringify(validate.errors, null, 2));
  process.exit(1);
}

const errors = [];
const byId = new Map();
for (const issue of catalog.issues) {
  if (byId.has(issue.sourceId)) errors.push(`duplicate Source-ID ${issue.sourceId}`);
  byId.set(issue.sourceId, issue);
  if (issue.sourceId !== 'PROJECT-GUIDE' && !issue.summary.startsWith(`[${issue.sourceId}]`)) {
    errors.push(`${issue.sourceId}: summary must begin with [Source-ID]`);
  }
  if (issue.issueType === 'Subtask' && !issue.parentSourceId) errors.push(`${issue.sourceId}: Subtask needs parentSourceId`);
  if (issue.parentSourceId === issue.sourceId) errors.push(`${issue.sourceId}: cannot parent itself`);
  if (issue.decisionStatus === 'approved' && issue.businessRules.some((rule) => /\b(TBD|TODO|decide later)\b/i.test(rule))) {
    errors.push(`${issue.sourceId}: approved rules contain an unresolved placeholder`);
  }
  if (issue.repositories.some((repo) => !/^(service_|frontend_|platform_|data_warehouse|cross-service)/.test(repo))) {
    errors.push(`${issue.sourceId}: repository names must be explicit or cross-service`);
  }
}
for (const issue of catalog.issues) {
  if (issue.parentSourceId && !byId.has(issue.parentSourceId)) errors.push(`${issue.sourceId}: missing parent ${issue.parentSourceId}`);
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
