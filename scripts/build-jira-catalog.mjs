import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = path.join(root, 'docs', 'jira', 'v1.3', 'epics');
const refinementDirectory = path.join(root, 'docs', 'jira', 'v1.3', 'refinements');
const outputPath = path.join(root, 'docs', 'jira', 'jira-catalog.v1.3.json');
const files = fs.readdirSync(sourceDirectory).filter((name) => name.endsWith('.json')).sort();
if (!files.length) throw new Error(`No Jira v1.3 shards found in ${sourceDirectory}`);

const issues = [];
const sourceFileById = new Map();
for (const file of files) {
  const document = JSON.parse(fs.readFileSync(path.join(sourceDirectory, file), 'utf8').replace(/^\uFEFF/, ''));
  if (!document.shard || !Array.isArray(document.issues)) throw new Error(`${file}: expected { shard, issues[] }`);
  for (const issue of document.issues) {
    if (sourceFileById.has(issue.sourceId)) {
      throw new Error(`Duplicate Source-ID ${issue.sourceId} in ${file} and ${sourceFileById.get(issue.sourceId)}`);
    }
    sourceFileById.set(issue.sourceId, file);
    issues.push(issue);
  }
}
const issueBySource = new Map(issues.map((issue) => [issue.sourceId, issue]));
const deepMerge = (target, override) => {
  if (Array.isArray(override) || override === null || typeof override !== 'object') return structuredClone(override);
  const result = { ...(target ?? {}) };
  for (const [key, value] of Object.entries(override)) result[key] = deepMerge(result[key], value);
  return result;
};
const refinementFiles = fs.existsSync(refinementDirectory)
  ? fs.readdirSync(refinementDirectory).filter((name) => name.endsWith('.json')).sort()
  : [];
for (const file of refinementFiles) {
  const document = JSON.parse(fs.readFileSync(path.join(refinementDirectory, file), 'utf8').replace(/^\uFEFF/, ''));
  for (const addition of document.additions ?? []) {
    if (!addition.templateSourceId) throw new Error(`${file}: addition ${addition.sourceId ?? '<missing>'} needs templateSourceId`);
    const template = issueBySource.get(addition.templateSourceId);
    if (!template) throw new Error(`${file}: addition ${addition.sourceId ?? '<missing>'} references unknown template ${addition.templateSourceId}`);
    if (!addition.sourceId) throw new Error(`${file}: addition needs sourceId`);
    if (issueBySource.has(addition.sourceId)) throw new Error(`${file}: duplicate addition Source-ID ${addition.sourceId}`);
    const issue = deepMerge(template, addition);
    // A new Jira issue must never reuse the template's physical Jira key.
    // It stays keyless until the corresponding issue is created and bound.
    if (!Object.hasOwn(addition, 'jiraKey')) delete issue.jiraKey;
    delete issue.templateSourceId;
    issues.push(issue);
    issueBySource.set(issue.sourceId, issue);
    sourceFileById.set(issue.sourceId, file);
  }
}
for (const file of refinementFiles) {
  const document = JSON.parse(fs.readFileSync(path.join(refinementDirectory, file), 'utf8').replace(/^\uFEFF/, ''));
  if (!Array.isArray(document.refinements)) throw new Error(`${file}: expected { refinements[], additions?[] }`);
  for (const refinement of document.refinements) {
    const current = issueBySource.get(refinement.sourceId);
    if (!current) throw new Error(`${file}: refinement references unknown Source-ID ${refinement.sourceId}`);
    const merged = deepMerge(current, refinement);
    Object.keys(current).forEach((key) => delete current[key]);
    Object.assign(current, merged);
  }
}
issues.sort((left, right) => left.sourceId.localeCompare(right.sourceId, 'en', { numeric: true }));
fs.writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: '1.3', projectKey: 'SCRUM', issues }, null, 2)}\n`);
console.log(`Built Jira catalog v1.3 with ${issues.length} records from ${files.length} shards and ${refinementFiles.length} refinement files at ${outputPath}`);
