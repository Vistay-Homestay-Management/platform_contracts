import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const snapshotPath = path.resolve(option('--snapshot', path.join(root, '..', '.backups', 'jira', 'snapshots', 'pre-refinement-20261103-211017.json')));
const outputPath = path.resolve(option('--out', path.join(root, 'docs', 'jira', 'jira-catalog.v1.2.json')));
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const snapshot = readJson(snapshotPath);

const sourceFromSummary = (summary = '') => summary.match(/^\[([^\]]+)]/)?.[1];
const adfText = (node) => {
  if (!node) return '';
  if (Array.isArray(node)) return node.map(adfText).join(' ');
  if (typeof node === 'string') return node;
  return `${node.text ?? ''} ${adfText(node.content)}`.trim();
};
const sourceFromIssue = (issue) => {
  const descriptionSource = adfText(issue.fields.description).match(/Source-ID:\s*([A-Z0-9-]+)/i)?.[1];
  return descriptionSource ?? sourceFromSummary(issue.fields.summary);
};

const profiles = {
  '00': {
    actor: 'Product owner and architecture reviewer',
    repos: ['platform_contracts', 'platform_infrastructure'],
    data: ['Versioned policy and decision records are owned by platform_contracts; runtime services consume published versions and never silently invent defaults.'],
    rules: ['A decision is publishable only after named owner approval, effective time, supersession rule, fixtures, and rollback impact are recorded.', 'Example values are DRAFT/UAT only unless an explicit production policy is maker-checker approved.'],
  },
  '01': {
    actor: 'Platform operator and application developer',
    repos: ['platform_infrastructure', 'platform_contracts', 'service_authentication', 'service_user', 'frontend_admin'],
    data: ['Each service owns its database; Keycloak owns credentials/sessions; authorization DB is source of truth and Redis is cache only.'],
    rules: ['The walking slice must traverse Nginx, Hive Router, service authorization, database, Kafka, and SSE with trace propagation.', 'Configuration and secrets fail closed; example files contain no live credentials.'],
  },
  '02': {
    actor: 'Backoffice administrator',
    repos: ['service_user', 'service_authentication', 'frontend_admin', 'platform_contracts'],
    data: ['Keycloak owns authentication credentials and sessions; User owns profile/account lifecycle; authorization tables own action, partition, and field-group grants.'],
    rules: ['All three account types use the same authorization model keyed by account_type plus Keycloak subject.', 'Authorization checks combine action, data partition, and field group; Redis may cache but may not become authority.'],
  },
  '03': {
    actor: 'Authorized document uploader or reviewer',
    repos: ['service_media', 'platform_contracts', 'platform_infrastructure'],
    data: ['Media owns object metadata, checksum, malware state, retention state, and domain references; binary content remains in a private object store.'],
    rules: ['Allow JPEG/PNG/WebP up to 15 MiB and PDF up to 25 MiB; one session allows at most 20 files and 100 MiB.', 'Reject video, SVG, Office, and HEIC initially; verify magic bytes, malware status, checksum, and strip image EXIF.', 'Upload/download URLs are short lived and objects remain private.'],
  },
  '04': {
    actor: 'Supply administrator',
    repos: ['service_property', 'service_user', 'platform_contracts', 'frontend_admin'],
    data: ['Property owns site, building, exact unit, amenity, supply-party reference, contract term, and activation projection; it does not own commercial nightly price.'],
    rules: ['Every exact unit belongs to a mandatory site; a standalone unit is represented by a one-unit site.', 'OWNED requires no host contract; LEASED and MANAGEMENT require an approved effective contract.', 'No overlapping effective winner is allowed; economic shares total 100 percent and exactly one primary signatory exists.', 'Activation fails closed until identity, supply term, documents, media, capacity, readiness, and pricing eligibility gates pass.'],
  },
  '05': {
    actor: 'Pricing administrator and booking agent',
    repos: ['service_booking', 'platform_contracts', 'frontend_admin'],
    data: ['Booking/Pricing owns base commercial rate, dated rules, publication versions, quote calculation, and frozen quote snapshots; Property owns no base price.'],
    rules: ['Stay products are SHORT 1-29 nights, MEDIUM 30-364 nights, and LONG 365 or more nights; boundaries are versioned configuration.', 'Only SHORT supports the five discount price levels.', 'No hourly booking is allowed; default check-in 14:00 and checkout 12:00 are configurable property-local policy.', 'Staff markup may be fixed or percentage within configured cap and is persisted separately from base rate and discounts.'],
  },
  '06': {
    actor: 'Booking agent and inventory reconciler',
    repos: ['service_booking', 'platform_contracts', 'frontend_admin'],
    data: ['Booking owns exact-unit holds, reservation occupancy, and inventory-block projection; maintenance sources publish blocking facts.'],
    rules: ['Availability uses half-open intervals and exact units.', 'Mutating commands require idempotency key and expected revision; overlap is rejected under concurrency.', 'Expired/orphan blocks are reconciled without deleting audit history.'],
  },
  '07': {
    actor: 'Sales or booking employee',
    repos: ['service_booking', 'service_user', 'frontend_admin', 'platform_contracts'],
    data: ['Booking owns leads, inquiries, attribution, assignments, and conversion references; User owns employee/customer identity.'],
    rules: ['Lead PII is purpose-limited and duplicate hints never auto-merge people.', 'A request does not consume inventory until an explicit hold succeeds.', 'Assignment, stage, loss reason, source, campaign, and responsible employee are audited.'],
  },
  '08': {
    actor: 'Customer or authorized booking employee',
    repos: ['service_booking', 'service_finance', 'platform_contracts', 'frontend_admin'],
    data: ['Booking owns quote, hold, reservation, cancellation state, inventory release, and immutable commercial snapshots; Finance owns money obligations.'],
    rules: ['Default hold duration is 30 minutes and configurable; a review request never extends it.', 'Confirmation requires a valid hold plus fully verified required advance payment or a final waiver decision.', 'Material customer, unit, date, stay-product, or price change invalidates and recomputes deposit assessment before confirmation.'],
  },
  '09': {
    actor: 'Finance employee, payer, or payment operator',
    repos: ['service_finance', 'service_payment', 'service_booking', 'platform_contracts', 'frontend_admin'],
    data: ['Finance owns charges, receivables, allocations, refunds, deposit obligations, and financial projections; Payment owns intents, QR payloads, provider transactions, callbacks, and technical reconciliation.'],
    rules: ['Advance payment is credited to the final or last receivable; it is neither a security deposit nor revenue at collection time.', 'Deposit is a configured percentage of eligible booking total after discounts and including staff markup, bounded by stay-type min/max, excluding incident/damage charges.', 'No production monetary default exists until maker-checker publication.', 'Provider confirmation is deduplicated and never directly rewrites Finance balances.'],
  },
  '10': {
    actor: 'Finance settlement reviewer and property owner',
    repos: ['service_finance', 'service_property', 'frontend_admin', 'frontend_host', 'platform_contracts'],
    data: ['Finance owns settlement periods, lines, adjustments, payable state, and exports; Property supplies effective immutable contract-term snapshots.'],
    rules: ['MANAGEMENT basis is verified collected lodging after discounts/refunds; exclude unearned deposit, staff markup, damage/cleaning, and employee commission.', 'OTA commission is included only when the effective contract says so.', 'LEASED uses fixed monthly amount with actual-day proration; OWNED produces no host payable.', 'Closed periods are immutable; reopen requires maker-checker reason and compensating history.'],
  },
  '11': {
    actor: 'Stay operator and compliance reviewer',
    repos: ['service_booking', 'service_user', 'service_media', 'frontend_admin', 'platform_contracts'],
    data: ['Booking owns stay timeline and roster references; User owns identity; Media owns protected document objects and access audit.'],
    rules: ['Default check-in is 14:00 and checkout 12:00 in property timezone, with a configurable two-hour cleaning buffer.', 'No-show is a manual transition only; no automatic no-show classification.', 'Guest document access requires purpose, field-group grant, audit, and retention enforcement.'],
  },
  '12': {
    actor: 'Operations employee or approved cleaning provider',
    repos: ['service_operations', 'service_property', 'service_booking', 'platform_contracts', 'frontend_admin'],
    data: ['Property owns physical asset catalog, serial, and QR reference; Operations owns condition, inspections, incidents, work orders, readiness, and raw cleanliness evidence.'],
    rules: ['Operations publishes verified facts; it never writes the final customer trust score.', 'Maintenance/readiness blocking facts affect Booking inventory through versioned events.', 'Evidence revisions are append-only and keep reviewer identity.'],
  },
  '13': {
    actor: 'Notification recipient and support operator',
    repos: ['service_notification', 'platform_contracts', 'frontend_admin'],
    data: ['Notification owns delivery attempts, templates, preferences, inbox items, cursors, and provider response metadata.'],
    rules: ['In-app and email are required; push is feature flagged.', 'Every consumed domain event is inbox-deduplicated and delivery retries terminate in an operable dead-letter state.', 'SSE resume uses a cursor and does not promise exactly-once display.'],
  },
  '14': {
    actor: 'Channel integration operator',
    repos: ['service_booking', 'platform_contracts', 'platform_infrastructure'],
    data: ['Booking owns the Channex mapping, durable webhook inbox, revision cursor, ARI publication state, and manual exception.'],
    rules: ['Pilot mapping is one exact ViStay unit to one Channex Property and one Room Type with inventory one; pilot supports SHORT stays only.', 'Require current Channex HMAC verification in production; shared-secret fallback is sandbox-only.', 'Webhook is a trigger: pull Booking Revision Feed, durably apply in order, then acknowledge.', 'Out-of-order revisions, HTTP 429, and ARI warnings are handled; conflicts enter NEEDS_MANUAL_RESOLUTION and are never auto-cancelled or overwritten.', 'Do not ingest card or CVV data.'],
  },
  '15': {
    actor: 'Pilot release manager',
    repos: ['platform_infrastructure', 'platform_contracts', 'cross-service'],
    data: ['Each service owns its migration and reconciliation evidence; infrastructure owns orchestration, backup, restore, and rollback runbooks.'],
    rules: ['Cutover requires encrypted backup plus restore smoke before forward migration.', 'Every migrated aggregate has count, key, amount, and exception reconciliation.', 'Public callback activation requires HTTPS, provider UAT, secrets, alerting, and rollback evidence.'],
  },
  '16': {
    actor: 'Host account holder',
    repos: ['service_user', 'service_authentication', 'frontend_host', 'platform_contracts'],
    data: ['Keycloak owns host authentication; User owns host profile and maps one host account to the primary signatory in v1.'],
    rules: ['Host v1 is one account per host/primary signatory, not a multi-member organization portal.', 'Host access is limited by action, host-party partition, and field group.'],
  },
  '17': {
    actor: 'Authenticated host',
    repos: ['frontend_host', 'service_property', 'service_finance', 'platform_contracts'],
    data: ['Property and Finance remain authoritative; Host UI consumes purpose-built, field-filtered projections.'],
    rules: ['A host sees only property, contract, settlement, and payment data whose effective primary-signatory partition matches the subject.', 'Internal employee compensation, customer PII, and unrelated property data are forbidden.'],
  },
  '18': {
    actor: 'Customer',
    repos: ['service_user', 'service_authentication', 'frontend_customer', 'platform_contracts'],
    data: ['Keycloak owns customer credentials; User owns profile, contacts, consent, claim, and identity-verification projection.'],
    rules: ['Email verification is required; phone remains optional until an SMS provider is selected.', 'Offline profile claim is explicit, audited, and collision-safe.', 'Compromised/duplicate identity recovery revokes sessions before relinking.'],
  },
  '19': {
    actor: 'Customer',
    repos: ['frontend_customer', 'service_booking', 'service_finance', 'service_payment', 'platform_contracts'],
    data: ['Customer UI reads Booking availability/reservation and Finance/Payment projections; it never joins service databases.'],
    rules: ['Customer cancellation uses a short-lived server quote and explicit confirmation.', 'Customer sees trust tier and safe reason codes, never the raw numeric trust score or anti-fraud evidence.', 'All ownership-negative tests prove one customer cannot access another customer booking or payment.'],
  },
  '20': {
    actor: 'Authorized analyst and finance reviewer',
    repos: ['data_warehouse', 'platform_contracts', 'platform_infrastructure'],
    data: ['Source services remain authoritative; the warehouse owns immutable ingestion lineage, conformed facts, quality results, and secured aggregates.'],
    rules: ['Ingestion is replayable, deduplicated, schema-version aware, and reconciled to source control totals.', 'PII is minimized and dashboard/export authorization applies action, partition, and field group.'],
  },
  '21': {
    actor: 'Operations dispatcher and external employee system',
    repos: ['service_operations', 'platform_contracts', 'platform_infrastructure'],
    data: ['Operations owns jobs and raw evidence; the adapter owns external identifiers, delivery attempts, signed callback inbox, and reconciliation status.'],
    rules: ['The vendor may submit checklist, severity, event/work-order, and evidence; it never submits final trust points.', 'Callbacks require signature, timestamp window, replay protection, schema validation, and durable deduplication.', 'Real adapter activation remains blocked until vendor documentation, sandbox credentials, and callback keys are supplied.'],
  },
  '22': {
    actor: 'Site reliability engineer',
    repos: ['platform_infrastructure', 'platform_contracts', 'cross-service'],
    data: ['Infrastructure owns deployment and recovery configuration; services own readiness, idempotency, and data reconciliation hooks.'],
    rules: ['SLO, RTO, RPO, capacity assumptions, failure domains, and cost envelope are versioned before HA implementation.', 'A backup is not accepted until an isolated restore and application-level reconciliation pass.', 'Failover and rollback evidence must include user-visible behavior and data-loss bounds.'],
  },
  '23': {
    actor: 'Customer, booking employee, finance risk reviewer, or operations reviewer',
    repos: ['service_finance', 'service_operations', 'service_booking', 'service_user', 'frontend_admin', 'frontend_customer', 'platform_contracts'],
    data: ['Finance owns normalized trust facts, effective-dated scoring policies, trust profile/tier/confidence, deposit decision, and appeal ledger; Operations owns raw cleanliness evidence; User owns identity; Booking freezes the decision snapshot.'],
    rules: ['The trust subject is the responsible customer account, not the employee who creates the booking; an absent customer account is UNASSESSED and requires full deposit.', 'Dimensions are Payment 30%, Booking 25%, Property care/cleanliness 30%, and Conduct 15%; identity/history are eligibility gates and confidence, not score points.', 'Each dimension starts at 50 and is clamped 0-100; tiers are RESTRICTED 0-39, WATCH 40-59, RELIABLE 60-79, TRUSTED 80-100; insufficient evidence displays UNASSESSED.', 'Default waiver eligibility requires composite at least 80, payment at least 70, cleanliness at least 65, verified email, at least three completed stays spanning 90 days, and no hard blocker.', 'There is no direct score edit; corrections and reversals append facts and replay the projection under the original or explicitly selected policy version.', 'Positive, minor, and medium facts decay after 24 months; major/no-show facts after 36 months; active blockers do not decay.', 'A disputed negative fact blocks automatic waiver while pending but is not a final point deduction.', 'Policies are effective-dated, simulated, maker-checker published, and historical decisions remain frozen.'],
  },
  '24': {
    actor: 'Employee, finance administrator, and collection manager',
    repos: ['service_finance', 'service_booking', 'service_user', 'frontend_admin', 'platform_contracts'],
    data: ['Finance owns effective-dated base salary, commission/bonus rules, accrual/reversal, collection accountability, and personal-revenue projection; Booking owns sales attribution and frozen markup.'],
    rules: ['The customer remains debtor; the assigned employee is collection owner/KPI accountable, never the debtor.', 'Customer-facing staff markup is separate from internal commission and belongs to the sales owner only after verified collection and service completion.', 'Refunds and reversals produce compensating earning entries; records are never deleted.', 'Sales and collection commission may be split only by a published effective policy.', 'Scope excludes tax, insurance, net payroll, and bank payroll execution.'],
  },
};

const additions = [
  ['VS-E00-T03', 'Task', 'Publish executable commercial policy schemas and production-default gates', 'VS-E00'],
  ['VS-E04-S07', 'Story', 'Activate and suspend exact-unit supply through a deterministic eligibility gate', 'VS-E04'],
  ['VS-E08-S06', 'Story', 'Preview and execute cancellation against a frozen policy quote', 'VS-E08'],
  ['VS-E09-T08', 'Task', 'Remediate Finance and Payment ownership boundaries', 'VS-E09'],
  ['VS-E09-S09', 'Story', 'Generate and maintain medium and long-stay installment schedules', 'VS-E09'],
  ['VS-E10-T01', 'Task', 'Remediate settlement basis and contract-term calculations', 'VS-E10'],
  ['VS-E11-T01', 'Task', 'Remediate guest-document media ownership and retention boundaries', 'VS-E11'],
  ['VS-E12-S07', 'Story', 'Ingest and verify external stayover and checkout cleanliness assessments', 'VS-E12'],
  ['VS-E19-S07', 'Story', 'Request deposit waiver and appeal a customer trust decision', 'VS-E19'],
  ['VS-E20-T01', 'Task', 'Harden governed ingestion replay lineage and source reconciliation', 'VS-E20'],
  ['VS-E23', 'Epic', 'Customer Trust, Deposit Eligibility and Appeals', undefined],
  ['VS-E23-S01', 'Story', 'Normalize immutable customer trust facts from source services', 'VS-E23'],
  ['VS-E23-S02', 'Story', 'Configure simulate approve and publish trust policies', 'VS-E23'],
  ['VS-E23-S03', 'Story', 'Compute explainable trust profile tier and confidence', 'VS-E23'],
  ['VS-E23-S04', 'Story', 'Decide deposit requirement and operate waiver review', 'VS-E23'],
  ['VS-E23-S05', 'Story', 'Appeal correct and replay customer trust decisions', 'VS-E23'],
  ['VS-E23-S06', 'Story', 'Investigate trust and waiver decisions in Admin Web and Mobile', 'VS-E23'],
  ['VS-E24', 'Epic', 'Employee Earnings, Commission and Collection Accountability', undefined],
  ['VS-E24-S01', 'Story', 'Maintain effective employee compensation profiles with restricted access', 'VS-E24'],
  ['VS-E24-S02', 'Story', 'Configure staff markup limits and booking attribution rules', 'VS-E24'],
  ['VS-E24-S03', 'Story', 'Accrue split and reverse employee commission deterministically', 'VS-E24'],
  ['VS-E24-S04', 'Story', 'Assign monitor and escalate employee collection accountability', 'VS-E24'],
  ['VS-E24-S05', 'Story', 'Show scoped personal earnings and management dashboards', 'VS-E24'],
];

const specialRules = {
  'VS-E05-T01': ['Remediate durable pricing idempotency and preserve published quote snapshots while adding explicit staff-markup components.'],
  'VS-E06-T02': ['Expose inventoryBlocks as an authenticated Booking GraphQL query for exactly one canonical property ID.', 'Authorize inventory:read against the current Property-owned branch membership before reading Booking data; dependency failure, unmapped property, and foreign partition fail closed.', 'Optional date filters use half-open overlap semantics; type/status filters are exact enums and empty arrays mean all values.', 'Use opaque URL-safe keyset pagination ordered by updatedAt DESC then inventoryBlockId DESC, with page size 1-100 and default 50.', 'Return the Booking inventory revision plus Property branch and membership version so Admin clients can detect stale multi-page reads.', 'Expose operational reason and provider code only; never expose booking/hold/customer/guest identity, channel external reference, actor identity, authorization evidence, commercial data, credentials, or SQL details.'],
  'VS-E08-S06': ['Let N be the configured full-refund boundary in property-local calendar days and P the loss percentage exactly at N.', 'For d greater than N refund 100%; for 0 <= d <= N use refundRate = (100 - P) * d / N, so exactly N refunds 100-P and d=0 refunds zero.', 'Calculate on verified collected advance payment in VND with HALF_UP; forfeited equals collected minus refund.', 'Cancellation preview expires at the earlier of five minutes or next property-local midnight; stale execution returns CANCELLATION_QUOTE_STALE.', 'ViStay/property cancellation or approved force majeure refunds 100% with no trust penalty; after check-in uses a separate early-termination policy.', 'Booking cancellation and inventory release are atomic; Finance records obligation and Payment executes provider refund; refund failure never reactivates booking.'],
  'VS-E09-S09': ['SHORT is due at checkout.', 'MEDIUM and LONG schedule policy versions configure advance/arrears, anniversary/calendar-month boundary, grace period, and daily proration for partial periods.', 'Schedule override requires an explicit permission, reason, audit, and customer acceptance before confirmation.'],
  'VS-E09-T08': ['Remove charge, receivable, allocation, refund obligation, and deposit-decision authority from Payment; migrate or expose them from Finance.', 'Payment retains provider intent, QR, provider transaction, callback, and technical reconciliation only.', 'Use compatibility events and reconciliation before disabling legacy writes.'],
  'VS-E10-T01': ['Create corrective settlement entries for already closed periods; never rewrite historical financial lines.', 'Link remediation evidence to the completed generic settlement implementation.'],
  'VS-E12-S07': ['Cleanliness levels are 0 Clean, 1 Expected, 2 Moderate, 3 Heavy, 4 Extreme.', 'Stayover trust deltas are +1, 0, -2, -6, -12; checkout deltas are +2, 0, -4, -10, -20.', 'Cap stayover contribution per booking at +3 and -18; only the latest verified checkout revision contributes.', 'Levels 0-2 auto-verify when contract-valid; levels 3-4 require evidence and Operations manager approval.'],
  'VS-E19-S07': ['When automatic waiver is enabled and the customer is eligible, display zero deposit without a request.', 'When automatic waiver is disabled and the customer is eligible, create REVIEW_PENDING and let a Branch Manager decide.', 'Below threshold requires deposit; only Super Admin may waive one booking with mandatory reason, evidence, and audit.', 'A waiver request does not extend the hold; expiry applies the standard deposit or releases inventory.', 'Waived late cancellation/no-show creates a trust fact but never invents money debt.'],
  'VS-E23-S04': ['Deposit decision states are REQUIRED, REVIEW_AVAILABLE, REVIEW_PENDING, WAIVED_AUTO, WAIVED_MANUAL, REQUIRED_BY_REVIEW, EXPIRED, and CONSUMED.', 'Hard blockers include open overdue balance, active chargeback, unresolved serious incident, recent no-show/extreme cleanliness, profile conflict, or stale projection.'],
};

const dependencies = {
  'VS-E00-T03': [['VS-E00-S04', 'remediates']],
  'VS-E04-S07': [['VS-E04-S01', 'is-blocked-by'], ['VS-E04-S04', 'is-blocked-by']],
  'VS-E08-S06': [['VS-E08-S04', 'remediates'], ['VS-E00-T03', 'is-blocked-by']],
  'VS-E09-T08': [['VS-E09-S01', 'remediates']],
  'VS-E09-S09': [['VS-E05-S04', 'is-blocked-by'], ['VS-E09-T08', 'is-blocked-by']],
  'VS-E10-T01': [['VS-E10-S01', 'remediates']],
  'VS-E12-S07': [['VS-E21-S01', 'is-blocked-by']],
  'VS-E19-S07': [['VS-E23-S04', 'is-blocked-by'], ['VS-E08-S06', 'is-blocked-by']],
  'VS-E20-T01': [['VS-E20-S01', 'remediates']],
  'VS-E23-S01': [['VS-E09-T08', 'is-blocked-by'], ['VS-E12-S07', 'is-blocked-by']],
  'VS-E23-S03': [['VS-E23-S01', 'is-blocked-by'], ['VS-E23-S02', 'is-blocked-by']],
  'VS-E23-S04': [['VS-E23-S03', 'is-blocked-by'], ['VS-E00-T03', 'is-blocked-by']],
  'VS-E23-S05': [['VS-E23-S03', 'is-blocked-by']],
  'VS-E23-S06': [['VS-E23-S03', 'is-blocked-by'], ['VS-E23-S04', 'is-blocked-by'], ['VS-E23-S05', 'is-blocked-by']],
  'VS-E24-S02': [['VS-E05-T01', 'is-blocked-by']],
  'VS-E24-S03': [['VS-E24-S01', 'is-blocked-by'], ['VS-E24-S02', 'is-blocked-by'], ['VS-E09-T08', 'is-blocked-by']],
  'VS-E24-S04': [['VS-E09-S09', 'relates-to']],
  'VS-E24-S05': [['VS-E24-S03', 'is-blocked-by'], ['VS-E24-S04', 'is-blocked-by']],
};

const externalBlockers = {
  'VS-E00-S05': ['Channex sandbox account and credentials are not yet supplied.'],
  'VS-E09-T07': ['VietQR merchant sandbox/UAT account and production callback activation details are not yet supplied.'],
  'VS-E15-S05': ['Public HTTPS endpoint and VietQR merchant UAT approval are required.'],
  'VS-E21-S01': ['External employee/cleaning vendor documentation, sandbox credentials, signing keys, and callback allowlist are required.'],
};

const issueByKey = new Map(snapshot.issues.map((issue) => [issue.key, issue]));
const sourceByKey = new Map(snapshot.issues.map((issue) => [issue.key, sourceFromIssue(issue)]).filter(([, source]) => source));
const existingSources = new Set(sourceByKey.values());

const inferParent = (sourceId, issue) => {
  const jiraParent = issue?.fields?.parent?.key ? sourceByKey.get(issue.fields.parent.key) : undefined;
  if (jiraParent) return jiraParent;
  const match = sourceId.match(/^(VS-E\d{2})-[ST]\d{2}/);
  return match?.[1];
};
const epicNumber = (sourceId) => sourceId.match(/^VS-E(\d{2})/)?.[1] ?? '00';
const issueLinks = (issue) => (issue?.fields?.issuelinks ?? []).flatMap((link) => {
  const inward = link.inwardIssue?.key;
  const outward = link.outwardIssue?.key;
  if (inward && sourceByKey.get(inward)) return [{ sourceId: sourceByKey.get(inward), relation: link.type?.inward === 'is blocked by' ? 'is-blocked-by' : 'relates-to' }];
  if (outward && sourceByKey.get(outward)) return [{ sourceId: sourceByKey.get(outward), relation: link.type?.outward === 'blocks' ? 'blocks' : 'relates-to' }];
  return [];
});

const build = ({ sourceId, issueType, summary, parentSourceId, jiraKey, issue }) => {
  const profile = profiles[epicNumber(sourceId)] ?? profiles['00'];
  const cleanTitle = summary.replace(/^\[[^\]]+]\s*/, '');
  const isDone = issue?.fields?.status?.name === 'Done';
  const blockers = externalBlockers[sourceId] ?? [];
  const mergedDependencies = [...(dependencies[sourceId] ?? []).map(([id, relation]) => ({ sourceId: id, relation })), ...issueLinks(issue)]
    .filter((entry, index, all) => entry.sourceId !== sourceId && all.findIndex((candidate) => candidate.sourceId === entry.sourceId && candidate.relation === entry.relation) === index);
  const businessRules = [...profile.rules, ...(specialRules[sourceId] ?? [])];
  const decisionStatus = 'approved';
  const record = {
    sourceId,
    ...(jiraKey ? { jiraKey } : {}),
    issueType,
    summary: summary.startsWith(`[${sourceId}]`) ? summary : `[${sourceId}] ${cleanTitle}`,
    ...(parentSourceId ? { parentSourceId } : {}),
    manageDescription: !isDone,
    actor: profile.actor,
    outcome: `${cleanTitle} is delivered as a deterministic, authorized, observable capability with executable acceptance evidence.`,
    context: `This ${issueType.toLowerCase()} is part of the ViStay ${sourceId.split('-').slice(0, 2).join('-')} delivery boundary. The specification is canonical for implementation detail; Jira remains canonical for workflow and delivery evidence.`,
    inScope: [`Implement and verify: ${cleanTitle}.`, 'Version contract, persistence, authorization, failure, audit, and operator behavior needed by this outcome.', 'Provide repository-specific automated tests and Postman/Newman evidence for callable APIs.'],
    outOfScope: ['Unlisted provider credentials and production policy values.', 'Direct cross-service database reads or duplicated ownership.', 'Unreviewed workflow transitions, historical rewrites, or destructive migration shortcuts.'],
    businessRules,
    repositories: profile.repos,
    interfaces: ['Version GraphQL/gRPC/Kafka/OpenAPI contracts before consumer implementation; document owner, caller, schema version, timeout, and compatibility.', 'Callable HTTP/GraphQL workflows include success, authorization-negative, validation, conflict, replay, and dependency-failure Postman examples.', 'Events use transactional outbox/inbox, stable aggregate identity, event ID, occurred-at time, producer schema version, and replay-safe consumers.'],
    dataOwnership: profile.data,
    stateMachine: [`Model legal states and transitions for ${cleanTitle}; reject illegal transitions with stable error codes.`, 'Persist actor, reason, source, policy/contract version, expected revision, and timestamps for every material transition.', 'Terminal or superseded records are retained; corrections use a new revision or compensating record.'],
    authorization: {
      actions: [`${sourceId.toLowerCase()}:view`, `${sourceId.toLowerCase()}:manage`],
      dataPartitions: ['SYSTEM for internal repair only; otherwise enforce the subject account type and the resource customer, host-party, site, branch, or assigned-employee partition.'],
      fieldGroups: ['SUMMARY by default; FINANCIAL, PII, DOCUMENT, TRUST_DETAIL, and INTERNAL_AUDIT require explicit grants and response-field filtering.'],
    },
    failureSemantics: ['Return stable validation, forbidden, not-found, conflict, stale-revision, dependency-unavailable, and rate-limit codes without leaking PII.', 'Fail closed when authorization, authoritative projection, policy version, or required dependency is unavailable.', 'Retry only transient operations with bounded exponential backoff; route exhausted asynchronous work to a visible repair queue.'],
    idempotencyConcurrency: ['Every externally retried mutation requires a scoped idempotency key, canonical request fingerprint, durable result, and mismatch rejection.', 'Use expected revision or equivalent compare-and-swap; concurrent winners are deterministic and losers receive conflict with current revision.', 'Consumers deduplicate by event ID and business key and support replay without duplicating money, inventory, notification, or audit effects.'],
    dependencies: mergedDependencies,
    acceptanceCriteria: [
      { given: `an authorized actor with a valid partition and a complete request for ${cleanTitle}`, when: 'the command or query is executed', then: 'the documented outcome, state revision, audit record, and contract response are produced deterministically' },
      { given: 'a caller missing the action, partition, or requested field-group grant', when: 'the same operation is attempted', then: 'access is denied without leaking existence or restricted fields and the denial is auditable' },
      { given: 'the same mutation is replayed or two requests use the same expected revision', when: 'processing overlaps or retries occur', then: 'at most one business effect is committed and all responses are stable, explainable, and reconciled' },
    ],
    tests: ['Unit tests cover rule boundaries, legal/illegal transitions, rounding/timezone where relevant, and stable error mapping.', 'Integration tests cover persistence constraints, authorization action+partition+field groups, outbox/inbox replay, and dependency failure.', 'Postman/Newman flow covers happy path, negative authorization, validation, conflict, idempotent replay, and a cleanup-safe deterministic fixture.'],
    observability: ['Propagate trace and correlation IDs across GraphQL/gRPC/Kafka/webhook boundaries without logging secrets or protected fields.', 'Emit transition, latency, error-code, replay/deduplication, dependency, and repair-queue metrics with bounded-cardinality labels.', 'Provide dashboard/alert thresholds and a runbook for stuck states, reconciliation mismatch, and rollback.'],
    definitionOfDone: ['Catalog validation and all affected repository CI checks pass.', 'Contracts, migrations, compatibility path, implementation, Admin Web/Mobile parity where applicable, and Postman/Newman evidence are merged.', 'Security-negative, concurrency/replay, observability, reconciliation, and rollback evidence is linked in Jira.', 'No production secret or unapproved monetary/policy default is committed; ServiceOwner acceptance evidence is attached before Done.'],
    evidence: ['Pull request and commit links per repository.', 'Automated test and Newman report with fixture version.', 'Migration/rollback or compatibility evidence where data/contracts change.', 'Dashboard, trace, audit, and reconciliation screenshots or machine-readable artifacts.'],
    decisionStatus,
    externalBlockers: blockers,
    labels: ['roadmap-v1-2', `source-${sourceId.toLowerCase()}`, `owner-${profile.repos[0].replaceAll('_', '-')}`],
    decisionNoteVi: blockers.length
      ? `Đặc tả đã đủ để triển khai phần nội bộ; chỉ giữ trạng thái blocked cho đầu vào bên ngoài: ${blockers.join(' ')}`
      : 'Các quy tắc nghiệp vụ và ranh giới dữ liệu trong catalog v1.2 đã được chốt; thay đổi sau này phải tạo phiên bản policy/contract mới, không sửa ngược lịch sử.',
  };
  return record;
};

const records = snapshot.issues.flatMap((issue) => {
  const sourceId = sourceFromIssue(issue);
  if (!sourceId) return [];
  return [build({
    sourceId,
    jiraKey: issue.key,
    issueType: issue.fields.issuetype.name,
    summary: issue.fields.summary,
    parentSourceId: inferParent(sourceId, issue),
    issue,
  })];
});

for (const [sourceId, issueType, title, parentSourceId] of additions) {
  if (existingSources.has(sourceId)) continue;
  records.push(build({ sourceId, issueType, summary: `[${sourceId}] ${title}`, parentSourceId }));
}

// New cross-service work is decomposed into one bounded repository slice per repo.
// Existing historical tickets are not exploded retroactively; remediation tickets are included.
const slicedParents = new Set([
  ...additions.filter(([, type]) => type !== 'Epic').map(([sourceId]) => sourceId),
  'VS-E04-T01',
  'VS-E05-T01',
]);
const allSources = new Set(records.map((record) => record.sourceId));
for (const parent of [...records]) {
  if (!slicedParents.has(parent.sourceId)) continue;
  parent.repositories.forEach((repository, index) => {
    const sourceId = `${parent.sourceId}-ST${String(index + 1).padStart(2, '0')}`;
    if (allSources.has(sourceId)) return;
    const slice = build({
      sourceId,
      issueType: 'Subtask',
      summary: `[${sourceId}] ${repository} delivery slice for ${parent.summary.replace(/^\[[^\]]+]\s*/, '')}`,
      parentSourceId: parent.sourceId,
    });
    slice.actor = 'Repository ServiceOwner and implementing engineer';
    slice.outcome = `${repository} supplies its bounded contract, implementation, tests, and evidence for parent ${parent.sourceId}.`;
    slice.context = `This is the ${repository} implementation slice of ${parent.sourceId}. It must not duplicate authority assigned to another repository.`;
    slice.inScope = [
      `Change only ${repository} plus generated artifacts explicitly owned by it.`,
      `Implement the ${repository} responsibilities and interfaces stated in parent ${parent.sourceId}.`,
      'Attach focused unit/integration evidence and compatibility or rollback notes.',
    ];
    slice.outOfScope = [
      'Implementing another repository ownership slice.',
      'Cross-service database access or copying an authoritative aggregate.',
      'Closing the parent without end-to-end and Postman/Newman evidence.',
    ];
    slice.repositories = [repository];
    slice.dependencies = [];
    slice.labels = ['roadmap-v1-2', `source-${sourceId.toLowerCase()}`, `repo-${repository.replaceAll('_', '-')}`];
    slice.decisionNoteVi = `Đây là lát cắt triển khai riêng của repo ${repository} cho ${parent.sourceId}; không được lấy quyền sở hữu dữ liệu của service khác.`;
    records.push(slice);
    allSources.add(sourceId);
  });
}

const order = (left, right) => left.sourceId.localeCompare(right.sourceId, 'en', { numeric: true });
records.sort(order);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: '1.2', projectKey: snapshot.project ?? 'SCRUM', issues: records }, null, 2)}\n`);
console.log(`Generated ${records.length} Jira catalog records at ${outputPath}`);
