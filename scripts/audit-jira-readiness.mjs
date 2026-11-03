import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.resolve(process.argv[2] ?? path.join(root, 'docs', 'jira', 'jira-catalog.v1.3.json'));
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8').replace(/^\uFEFF/, ''));
const open = catalog.issues.filter((issue) => issue.specStatus !== 'historical');
const countBy = (items, key) => Object.fromEntries([...Map.groupBy(items, key)].map(([name, values]) => [name, values.length]));
const unsafe = open.filter((issue) => issue.dispatchable && issue.specStatus !== 'executable');
const missingKey = catalog.issues.filter((issue) => !issue.jiraKey);
const executable = open.filter((issue) => issue.specStatus === 'executable');
const report = {
  schemaVersion: catalog.schemaVersion,
  total: catalog.issues.length,
  historical: catalog.issues.length - open.length,
  open: open.length,
  bySpecStatus: countBy(catalog.issues, (issue) => issue.specStatus),
  dispatchable: open.filter((issue) => issue.dispatchable).length,
  executable: executable.length,
  unsafeDispatchable: unsafe.map((issue) => issue.sourceId),
  missingJiraKey: missingKey.map((issue) => issue.sourceId),
};
console.log(JSON.stringify(report, null, 2));
if (unsafe.length || missingKey.length) process.exit(1);
