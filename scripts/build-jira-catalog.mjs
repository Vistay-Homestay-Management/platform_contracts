import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = path.join(root, 'docs', 'jira', 'v1.3', 'epics');
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
issues.sort((left, right) => left.sourceId.localeCompare(right.sourceId, 'en', { numeric: true }));
fs.writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: '1.3', projectKey: 'SCRUM', issues }, null, 2)}\n`);
console.log(`Built Jira catalog v1.3 with ${issues.length} records from ${files.length} shards at ${outputPath}`);
