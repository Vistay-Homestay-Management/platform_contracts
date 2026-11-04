import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const valueAfter = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};
const inputPath = path.resolve(valueAfter('--input', path.join(root, 'docs', 'jira', 'jira-catalog.v1.2.json')));
const snapshotPath = path.resolve(valueAfter('--snapshot', path.join(root, '..', '.backups', 'jira', 'sync', 'jira-SCRUM-20261104-013204.json')));
const outputDirectory = path.resolve(valueAfter('--out-dir', path.join(root, 'docs', 'jira', 'v1.3', 'epics')));
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

const input = readJson(inputPath);
const snapshot = readJson(snapshotPath);
if (!process.argv.includes('--force') && fs.existsSync(outputDirectory) && fs.readdirSync(outputDirectory).some((name) => name.endsWith('.json'))) {
  throw new Error(`Refusing to overwrite curated v1.3 shards in ${outputDirectory}; --force is for one-time migration recovery only.`);
}
const adfText = (node) => {
  if (!node) return '';
  if (Array.isArray(node)) return node.map(adfText).join(' ');
  if (typeof node === 'string') return node;
  return `${node.text ?? ''} ${adfText(node.content)}`.trim();
};
const sourceIdOf = (issue) => {
  const summary = String(issue.fields?.summary ?? '');
  const fromSummary = summary.match(/^\[([^\]]+)]/)?.[1];
  if (fromSummary) return fromSummary;
  return adfText(issue.fields?.description).match(/Source-ID:\s*([A-Z0-9-]+)/i)?.[1];
};
const liveBySource = new Map(snapshot.issues.map((issue) => [sourceIdOf(issue), issue]).filter(([source]) => source));

const workKindOf = (record) => {
  const text = `${record.summary} ${(record.repositories ?? []).join(' ')}`.toLowerCase();
  if (record.issueType === 'Bug') return 'bug';
  if (record.issueType === 'Spike') return 'spike';
  if (record.issueType === 'Tech Debt') return 'tech-debt';
  if (/mobile/.test(text)) return 'mobile';
  if (/frontend_admin|frontend_customer|frontend_host|\bweb\b/.test(text)) return 'web';
  if (/migration|cutover|backfill/.test(text)) return 'migration';
  if (/contract|schema|graphql|grpc|kafka|openapi/.test(text)) return 'contract';
  if (/infrastructure|platform_infrastructure|observability|deployment|ci\b/.test(text)) return 'infrastructure';
  if (/integration|channex|vietqr|provider|webhook/.test(text)) return 'integration';
  if (/operations|cleaning|maintenance|incident/.test(text)) return 'operations';
  if (/decision|policy|guide|ownership/.test(text)) return 'decision';
  return 'service';
};
const shardOf = (sourceId) => sourceId.match(/^VS-(E\d{2})/)?.[1] ?? 'PROJECT';
const migrated = input.issues.map((record) => {
  const live = liveBySource.get(record.sourceId);
  if (!live) throw new Error(`Live Jira snapshot has no issue for ${record.sourceId}`);
  const historical = live.fields?.status?.name === 'Done';
  const acceptanceCriteria = record.acceptanceCriteria.map((criterion, index) => ({
    id: `AC${String(index + 1).padStart(2, '0')}`,
    given: criterion.given,
    when: criterion.when,
    then: criterion.then,
  }));
  const managedReadinessLabels = new Set(['agent-ready', 'agent-ready-after-dependencies', 'decision-required', 'externally-blocked', 'needs-refinement', 'refined-parent', 'historical', 'agent-not-ready']);
  const labels = [...new Set([
    ...(record.labels ?? []).filter((label) => label !== 'roadmap-v1-2' && !label.startsWith('spec-') && !managedReadinessLabels.has(label)),
    'roadmap-v1-3',
  ])].sort();
  const { decisionStatus: _decisionStatus, ...rest } = record;
  return {
    ...rest,
    jiraKey: live.key,
    manageDescription: historical ? false : record.manageDescription,
    specStatus: historical ? 'historical' : 'needs-refinement',
    workKind: workKindOf(record),
    dispatchable: false,
    acceptanceCriteria,
    testCases: [],
    decisions: [],
    implementationBlockers: [],
    activationBlockers: [...(record.externalBlockers ?? [])],
    externalBlockers: [...(record.externalBlockers ?? [])],
    labels,
  };
});

const groups = Map.groupBy(migrated, (record) => shardOf(record.sourceId));
fs.mkdirSync(outputDirectory, { recursive: true });
for (const [shard, issues] of [...groups].sort(([left], [right]) => left.localeCompare(right))) {
  const filename = `${shard.toLowerCase()}.json`;
  fs.writeFileSync(path.join(outputDirectory, filename), `${JSON.stringify({ shard, issues }, null, 2)}\n`);
}
console.log(`Migrated ${migrated.length} records into ${groups.size} v1.3 source shards at ${outputDirectory}`);
