import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const validator = path.join(root, 'scripts', 'validate-jira-catalog.mjs');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'jira', 'jira-catalog.v1.3.json'), 'utf8'));
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'vistay-jira-validation-'));

const run = (name, mutate, expectedFragment) => {
  const candidate = structuredClone(catalog);
  mutate(candidate);
  const file = path.join(tempDirectory, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(candidate));
  const result = spawnSync(process.execPath, [validator, file], { encoding: 'utf8' });
  assert.notEqual(result.status, 0, `${name}: validator unexpectedly accepted the invalid catalog`);
  assert.match(`${result.stdout}\n${result.stderr}`, expectedFragment, `${name}: expected diagnostic was absent`);
};

const valid = spawnSync(process.execPath, [validator, path.join(root, 'docs', 'jira', 'jira-catalog.v1.3.json')], { encoding: 'utf8' });
assert.equal(valid.status, 0, valid.stderr);

run('generic-executable', (candidate) => {
  candidate.issues.find((issue) => issue.sourceId === 'PROJECT-GUIDE').outcome = 'Work is delivered as a deterministic, authorized, observable capability with evidence.';
}, /generator boilerplate/);

run('synthetic-permission', (candidate) => {
  candidate.issues.find((issue) => issue.sourceId === 'PROJECT-GUIDE').authorization.actions = ['project-guide:manage'];
}, /synthetic Source-ID authorization/);

run('unmapped-acceptance', (candidate) => {
  const issue = candidate.issues.find((entry) => entry.sourceId === 'PROJECT-GUIDE');
  issue.testCases = issue.testCases.map((testCase) => ({ ...testCase, verifies: testCase.verifies.filter((id) => id !== 'AC02') }));
}, /AC02 has no test\/evidence mapping/);

run('unsafe-dispatch', (candidate) => {
  const issue = candidate.issues.find((entry) => entry.sourceId === 'PROJECT-REFINE-W1');
  issue.dispatchable = true;
}, /dispatchable must be true exactly/);

run('missing-jira-key', (candidate) => {
  delete candidate.issues.find((entry) => entry.sourceId === 'PROJECT-GUIDE').jiraKey;
}, /backfilled jiraKey/);

console.log('Jira semantic validation negative tests passed: 5 cases');
