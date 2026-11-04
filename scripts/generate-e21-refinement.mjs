import fs from 'node:fs';

const source = new URL('../docs/jira/v1.3/epics/e21.json', import.meta.url);
const target = new URL('../docs/jira/v1.3/refinements/e21.json', import.meta.url);
const originals = new Map(JSON.parse(fs.readFileSync(source, 'utf8')).issues.map(issue => [issue.sourceId, issue]));
const vendorGate = 'Production vendor adapter remains disabled until the ProductOwner approves the actual vendor API, sandbox credentials, callback authentication/signing algorithm, key rotation, allowlist, retry semantics and retention policy under VS-E00-T02.';
const parent = (sourceId, outcome, context, status='refined-parent') => ({sourceId,outcome,context,specStatus:status,dispatchable:false});
const refinements = [
  parent('VS-E21','Operations owns ViStay work orders, vendor dispatch state, callback verification and source evidence; separate contract, dispatch, callback/ingress, reconciliation and authorization leaves make integration testable without guessing the vendor API.','Operations V2 SQL already declares work_order_dispatches and external_callback_events; no production vendor connector or authoritative external API contract was found. The E12 cleanliness and E23 trust flows depend on authenticated, attributable source evidence.'),
  parent('VS-E21-S01','S01 establishes a vendor-neutral verified envelope and a recorded vendor-readiness decision before a real adapter is enabled.','VS-E00-T02 still asks which external employee system is selected. The child contract/fixture work is dispatchable; this parent cannot claim live vendor verification without API documentation, sandbox and signing/allowlist configuration.'),
  parent('VS-E21-S02','S02 sends ViStay-owned work-order intent through a replay-safe Operations adapter and maps external IDs after a verified acknowledgement.','Operations V2 already has work_order_dispatches and a unique (external_system, external_work_order_id); a fabricated vendor response cannot be called a real dispatch.'),
  parent('VS-E21-S03','S03 separates Operations signature-first callback processing from infrastructure ingress/secret provisioning; neither trusts a vendor-provided trust score.','V2 external_callback_events has unique external_system+external_event_id and processing statuses; callback authorization must precede payload persistence/use.'),
  parent('VS-E21-S04','S04 exposes bounded retry, dead-letter reconciliation and authorized manual repair without silently converting missing vendor updates into completed work.','The existing dispatch status/attempt columns are persistence scaffolding; exact vendor retry response and rate limits remain activation gates.'),
  parent('VS-E21-S05','S05 audits the association between vendor IDs, ViStay work orders, authorized branch, signed assessment and later corrections.','Operations holds authoritative work-order ownership. E12 separates stayover versus checkout care; E23 Finance alone interprets evidence into trust points.'),
];
const repos = { 'VS-E21-S01-ST01':'platform_contracts','VS-E21-S02-ST01':'service_operations','VS-E21-S03-ST01':'service_operations','VS-E21-S03-ST02':'platform_infrastructure','VS-E21-S04-ST01':'service_operations','VS-E21-S05-ST01':'service_operations' };
const keys = { 'VS-E21-S01-ST01':'SCRUM-858','VS-E21-S02-ST01':'SCRUM-859','VS-E21-S03-ST01':'SCRUM-860','VS-E21-S03-ST02':'SCRUM-861','VS-E21-S04-ST01':'SCRUM-862','VS-E21-S05-ST01':'SCRUM-863' };
const tests = {
  platform_contracts:['npm run validate:schemas','npm test'],
  service_operations:['.\\gradlew.bat test --tests "*ExternalEmployee*"','.\\gradlew.bat test'],
  platform_infrastructure:['powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Test-ExternalEmployeeIngress.ps1 -StaticOnly','powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Test-ExternalEmployeeIngress.ps1 -Live'],
};
function leaf(sourceId, title, {outcome,context,scope,excluded,paths,artifacts,boundaries,interfaces,states,actions,groups,conditions,deps,activationBlockers=[],labels=[]}) {
  const parentSourceId = sourceId.replace(/-ST\d+$/,'');
  const original = originals.get(parentSourceId);
  const repository = repos[sourceId];
  if (!original || !repository || !keys[sourceId]) throw Error(`Missing E21 source identity ${sourceId}`);
  return {
    templateSourceId:parentSourceId, sourceId, jiraKey:keys[sourceId], issueType:'Subtask',parentSourceId,
    summary:`[${sourceId}] ${title}`, actor:'Authorized Operations operator or trusted integration worker',
    outcome, context, inScope:scope, outOfScope:excluded,
    repositories:[repository],primaryRepository:repository,repositorySlices:[{repository,paths,artifacts}],
    interfaces,dataOwnership:boundaries,stateMachine:states,
    authorization:{actions,dataPartitions:['ADMIN must have target SITE/BRANCH and work-order relationship; SYSTEM only authenticated integration purpose; vendor callback may address only its mapped external_system/work-order identity.'],fieldGroups:groups},
    failureSemantics:['Reject missing credentials, unsupported vendor contract version, stale timestamp and unverified signature before mutating Operations work orders.','Classify transient dependency failure separately from permanent invalid vendor data; quarantine failed messages and never complete a work order as fallback.','Return stable non-enumerating forbidden/not-found, conflict, dependency-unavailable and rate-limit codes without raw payload, callback secret or customer PII.'],
    idempotencyConcurrency:['Outbound retry uses a stable idempotency key bound to workOrderId, vendor and canonical payload hash; changed payload with the same key conflicts.','Inbox deduplicates signed callback by external_system and external_event_id and checks external_work_order_id maps to the same ViStay order.','Use source version/expectedRevision to keep late or reordered callbacks from rolling back status or creating a second assessment.'],
    dependencies:deps.map(sourceId => ({sourceId,relation:'is-blocked-by'})),
    acceptanceCriteria:conditions.map(([given,when,then],i)=>({id:`AC0${i+1}`,given,when,then})),
    tests:['Run exact testCases and provide positive, authorization-negative, duplicate/reordered and dependency-failure evidence.','Mock-vendor tests do not count as proof of live vendor integration; real-adapter activation remains externally gated.'],
    testCases:tests[repository].map((command,i)=>({id:`TEST-0${i+1}`,level:i?'integration':'unit',command,verifies:i?['AC01','AC02','AC03']:['AC01','AC02'],evidence:`${sourceId}: fixture version, redacted CI report, denial and replay proof`})),
    observability:['Propagate correlation, vendor event ID and internal work-order ID to bounded metric/audit labels; never log private raw evidence or signing keys.','Expose pending age, retry count, quarantined events and next authorized repair action by branch.'],
    definitionOfDone:['Named artifacts and focused tests land in the owning repo; authorization, replay, stale-status and recovery evidence is attached.','Contract and migration compatibility are verified; external callback activation waits for vendor-gate approval.','Jira links PR/CI/fixture report and marks whether validation is mock-only or actually ran against approved sandbox.'],
    evidence:['Repository PR and CI URL.','Redacted negative-auth/replay integration report and recovery note.','Vendor contract/sandbox approval only when supplied; mock fixture is labeled as mock.'],
    labels:[`repo-${repository.replaceAll('_','-')}`,'roadmap-v1-3',`source-${sourceId.toLowerCase()}`,'vendor-contract-required',...labels],
    decisionNoteVi:`${repository} owns only this slice; no actual vendor endpoint, secret, signing algorithm or reward points are assumed.`,
    specStatus:'executable',workKind:repository==='platform_contracts'?'contract':repository==='platform_infrastructure'?'infrastructure':'service',
    dispatchable:true,decisions:[],implementationBlockers:[],activationBlockers:[vendorGate,...activationBlockers],externalBlockers:[],
  };
}

const additions = [
  leaf('VS-E21-S01-ST01','Version vendor-neutral employee integration and sandbox readiness contract',{
    outcome:'Contracts defines a testable, versioned ViStay work-order/assessment envelope and a separate checklist for approving a real external employee vendor.',
    context:'E00-T02 still has no selected vendor contract. Document what ViStay owns and isolate the unknown vendor-specific transport/signing/response mapping behind an adapter, with no hardcoded production values.',
    scope:['Publish ViStay-owned dispatch, acknowledgement, status, stayover/checkout cleaning checklist and source correction schemas with source IDs, booking/work-order/customer attribution, version, timestamp and evidence references; vendor never supplies final trust points.','Add an approval checklist for vendor API version, sandbox URL, auth/signature algorithm and key rotation, timestamp/retry window, allowed callbacks, rate limits and retention; record each field as unverified until authoritative docs/sandbox prove it.','Add deterministic mock fixtures for valid/invalid signature, duplicate/reordered callbacks, mismatched work order/branch, missing assessor and unsupported source version; version rejection and compatibility checks.'],
    excluded:['Creating a vendor-specific host/path, credential, signature scheme or production retention default without provider evidence.','Declaring live sandbox tested from mock fixtures.'],
    paths:['schemas/external-employee/**','fixtures/external-employee/**','docs/external-employee-integration-v1.md','scripts/validate-schemas.mjs'],
    artifacts:['vendor-neutral envelope and approval checklist','signed mock callback/correction fixture matrix','schema validation and secret scan'],
    boundaries:['Contracts pins ViStay-visible events; Operations owns work orders and raw verified care evidence, Finance owns customer trust points.'],
    interfaces:['Versioned dispatch/ack/callback and source-correction envelopes; real provider mapping is a separate unapproved adapter implementation until contract evidence exists.'],
    states:['DRAFT -> VALIDATED mock contract; VENDOR_VERIFIED only after exact docs, keys, signing test and sandbox correlation pass.'],
    actions:['external-employee:contract:publish'],groups:['SUMMARY IDs/status only; DOCUMENT evidence and INTERNAL_AUDIT assessor details classified explicitly.'],
    conditions:[['a vendor-neutral order and stayover/checkout assessment example','schema/fixture validation runs','required source IDs, signatures, correction references and distinction between raw severity and final trust score are explicit'],['unsigned/mismatched customer, duplicate event or assessor claiming final score','negative fixtures run','contract rejects with stable diagnostic and does not call the result vendor-verified'],['actual vendor contract or sandbox remains unavailable','readiness checklist is evaluated','adapter activation stays blocked while mock fixtures remain usable for internal implementation']],
    deps:['VS-E00-T02'],labels:['business-review-needed'],
  }),
  leaf('VS-E21-S02-ST01','Dispatch replay-safe ViStay work orders through vendor adapter port',{
    outcome:'Operations sends authorized work orders through a bounded, pluggable external adapter with durable IDs, retry-safe acknowledgement and no fake completion.',
    context:'V2 work_order_dispatches stores PENDING/SENDING/DISPATCHED and unique vendor external IDs. The vendor transport is not known, so only a mock adapter can run until S01 verification.',
    scope:['Map authoritative work_order_id, branch, task kind, due window and source revision to versioned dispatch intent without leaking unrelated customer data.','Persist idempotency_key, payload fingerprint, attempt_count, external_system, verified acknowledgement ID and next_retry_at; use bounded transient retry and record every state transition.','Implement outbound port plus mock contract adapter and verify cancellation/reschedule race cannot dispatch obsolete versions.'],
    excluded:['Treating a 2xx transport response as completed cleaning or inventing a vendor REST endpoint.'],
    paths:['src/main/java/**','src/main/resources/db/migration/**','src/test/java/**'],
    artifacts:['work-order dispatch worker and outbound adapter port','verified vendor-ID mapping','mock acknowledgement/duplicate/cancel tests'],
    boundaries:['Operations owns work_orders and work_order_dispatches; external vendor owns execution and supplied external_work_order_id.'],
    interfaces:['Consume approved ViStay work-order command; adapter sends versioned dispatch and accepts ack with one external ID and response version.'],
    states:['PENDING -> SENDING -> DISPATCHED or FAILED; only signed/validated later callback advances ACCEPTED/IN_PROGRESS/COMPLETED.','CANCELLED must not revive from late acknowledgement.'],
    actions:['operations:work-order:dispatch'],groups:['SUMMARY work-order/dispatch status; DOCUMENT and INTERNAL_AUDIT restricted task details.'],
    conditions:[['authorized work order at one branch and a mock vendor acknowledgement','dispatch worker runs','one dispatch row and one external ID mapping persist with version/audit'],['forbidden branch, stale work-order revision or missing vendor adapter','dispatch is requested','no outbound order is sent and stable forbidden/conflict/unavailable status is recorded'],['the same request retries or cancellation races with ack','worker replays','single durable external mapping remains and CANCELLED cannot become active again']],
    deps:['VS-E21-S01-ST01'],
  }),
  leaf('VS-E21-S03-ST01','Validate signed vendor callbacks and quarantine untrusted evidence',{
    outcome:'Operations authenticates, attributes and deduplicates vendor status and cleaning evidence before advancing a ViStay order or publishing E12 source evidence.',
    context:'V2 external_callback_events uniquely indexes external_system/external_event_id. Actual signing algorithm/window is vendor-specific and must be approved before production ingress.',
    scope:['Verify vendor identity, approved key revision/signature, clock window, payload size/schema and distinct external event/work-order ID before accepting any state or evidence.','Map external ID to one work order/site/branch and legal status transition; separate stayover vs checkout checklist and assessor/evidence source from vendor-provided severity; reject direct trust-point fields.','Persist accepted callback inbox, status/audit/outbox atomically; quarantine unknown ID, stale/out-of-order revision and conflicted signature with safe replay/repair metadata.'],
    excluded:['Accepting unauthenticated callback, publishing fake Finance trust score or storing raw sensitive evidence in open logs.'],
    paths:['src/main/java/**','src/main/resources/db/migration/**','src/test/java/**'],
    artifacts:['signature-first callback ingress adapter','external_callback_events inbox mapping','valid/invalid/replay/care-kind integration tests'],
    boundaries:['Operations owns verified source evidence and callback inbox; vendor supplies raw assessment, Finance owns trust points.'],
    interfaces:['Version callback endpoint and verifier port; concrete provider-specific algorithm/key IDs activated only after approved S01 contract.'],
    states:['RECEIVED -> PROCESSED/IGNORED/QUARANTINED/FAILED; never transition an order backwards on a late callback.'],
    actions:['operations:external-callback:ingest'],groups:['SUMMARY event status; DOCUMENT and TRUST_DETAIL raw care evidence, INTERNAL_AUDIT signature/assessor metadata restricted.'],
    conditions:[['valid signed callback referencing exactly one dispatched work order','Operations processes the payload','legal order transition and distinct signed stayover/checkout evidence persist once with audit/outbox'],['bad signature, stale timestamp, foreign vendor work ID or unsupported version','callback arrives','request is denied or quarantined and no order/evidence/trust event changes'],['duplicate or reordered signed event is delivered','inbox replays','unique source event produces at most one transition and late older revision does not roll back current status']],
    deps:['VS-E21-S01-ST01','VS-E21-S02-ST01'],
  }),
  leaf('VS-E21-S03-ST02','Provision restricted vendor callback ingress and secret references',{
    outcome:'Infrastructure exposes a narrowly scoped TLS callback route and versioned secret references only after vendor contract, callback identity and trust boundary are approved.',
    context:'compose.full.yaml and local edge exist for development; they are not proof of a production ingress or verified vendor IP allowlist.',
    scope:['Describe callback route, TLS termination, request body/rate limits, source allowlist if vendor supports it, and forwarding of authenticated identity/correlation to Operations verifier without storing raw payload in access logs.','Provide environment/secret-reference examples and rotation procedure without embedding actual callback keys; keep disabled-by-default production route until vendor approval.','Add static configuration validator and opt-in local signed mock/unsigned denial test that fails explicitly when runtime/key material is absent.'],
    excluded:['Publishing a production callback route or real vendor credentials into Compose or Git.','Assuming IP allowlist alone authenticates a callback.'],
    paths:['caddy/**','nginx/**','compose.full.yaml','scripts/Test-ExternalEmployeeIngress.ps1','docs/runbooks/**'],
    artifacts:['restricted callback route template','secret rotation and deployment note','static and opt-in live request validation'],
    boundaries:['Infrastructure owns ingress/secret references; Operations alone verifies signature and mutates work orders.'],
    interfaces:['Forward bounded callback requests to Operations through TLS with declared path/version and trace headers; never trust HTTP headers as vendor identity.'],
    states:['DISABLED -> STAGED -> ENABLED only after owner approves key/allowlist/contract; failed rotation returns to previous valid key reference without exposing values.'],
    actions:['external-employee:ingress:configure'],groups:['SUMMARY health/denial status; INTERNAL_AUDIT secret reference/rotation restricted; no callback payload in edge logs.'],
    conditions:[['approved mock fixture and disabled-by-default route template','static validator runs','route shape, TLS boundary, size/rate limits and secret references are checked without real credential'],['unsigned/oversized request or absent approved vendor key','opt-in test calls ingress','Operations rejects without state change and no secret or payload appears in logs'],['secret rotates with an in-flight callback','approved rollout/drill runs','old/new key grace is policy-controlled and replay stays deduplicated without widening route to unrelated sites']],
    deps:['VS-E21-S01-ST01','VS-E21-S03-ST01'],activationBlockers:['Production TLS hostname and network ingress require approved E22 rollout plan; local Compose route is not production HA.'],
  }),
  leaf('VS-E21-S04-ST01','Reconcile vendor delivery with retry dead-letter and safe repair',{
    outcome:'Operations makes failed dispatch/callback states visible and repairable by an authorized operator without duplicating work, evidence or Finance points.',
    context:'V2 dispatch attempts/next_retry_at and callback FAILED/QUARANTINED states are schema scaffolding; worker, alert and source reconciliation still need implementation.',
    scope:['Classify transient timeout/rate-limit separately from permanent schema/signature/ownership errors; schedule bounded exponential retries and durable dead-letter after exhaustion.','Reconcile local dispatch status to authenticated vendor event/lookup only when vendor contract supports it; unresolved/missing vendor update remains visibly STALE, never completed.','Add action+branch-scoped manual requeue with reason, expectedVersion and audit; preserve original attempt/error and link correction or compensation event rather than overwrite.'],
    excluded:['Polling an undocumented vendor endpoint or automatically re-sending a cancelled work order.'],
    paths:['src/main/java/**','src/main/resources/db/migration/**','src/test/java/**'],
    artifacts:['durable retry/repair worker','dead-letter and discrepancy projection','duplicate and unavailable-vendor tests'],
    boundaries:['Operations owns retries and source reconciliation; vendor owns execution/ack; Finance only consumes verified care facts.'],
    interfaces:['Version internal repair/reconciliation commands and optional vendor status lookup port; actual provider endpoint remains vendor-gated.'],
    states:['FAILED_TRANSIENT -> RETRY_SCHEDULED -> DISPATCHED or DEAD_LETTER; invalid signature -> QUARANTINED, never auto-retry to trusted status.'],
    actions:['operations:external-dispatch:repair'],groups:['SUMMARY status/age; INTERNAL_AUDIT raw attempt and payload hash restricted.'],
    conditions:[['temporary vendor timeout and bounded retry policy','worker retries','single vendor dispatch ID is recovered or dead-lettered visibly with attempt history'],['invalid signature, foreign branch or cancelled work order','repair is attempted','no unauthorized or duplicate dispatch/evidence occurs'],['same retry job executes twice or vendor feed is offline','reconciliation runs','one business effect persists, with STALE/unavailable rather than fabricated completion']],
    deps:['VS-E21-S02-ST01','VS-E21-S03-ST01'],labels:['policy-configurable'],
  }),
  leaf('VS-E21-S05-ST01','Audit vendor IDs and partitioned work-order evidence ownership',{
    outcome:'Operations can trace one external ID through work order, signed callback, care assessment and correction while enforcing customer/site ownership and retention.',
    context:'V2 stores vendor ID mapping and callback digest but not a finished investigator experience; E12/E23 require source attribution for cleanliness evidence and appeal correction.',
    scope:['Expose authorized lookup by ViStay work-order ID or vendor ID with source event/revision, assessor provenance, evidence reference, branch and delivery history; filter before list/count.','Reject cross-branch/external-system ID collisions, customer mismatch and unauthorized raw document dereference; audit every permitted sensitive inspection.','Publish versioned stayover/checkout source correction references for E12 and Finance E23; retain immutable original mapping and policy-approved retention/erasure marker.'],
    excluded:['Creating a second Finance trust ledger, revealing a vendor signing key or treating raw cleaning notes as customer fault without verified attribution.'],
    paths:['src/main/java/**','src/main/resources/db/migration/**','src/test/java/**'],
    artifacts:['branch-filtered vendor ID lookup and audit','source assessment/correction trace','foreign-customer and retention tests'],
    boundaries:['Operations owns work-order and source evidence audit; E12 applies approved care facts; Finance owns trust-score and appeal decisions.'],
    interfaces:['Version purpose-bound Operations evidence lookup for E12/E23 with work order/external IDs, source revision and field-group projection.'],
    states:['ACCEPTED -> AMENDED_BY_LINKED_EVENT; retention expiration tombstones eligible private evidence only after approved retention and live-reference check.'],
    actions:['operations:external-evidence:view','operations:external-evidence:correct'],groups:['SUMMARY status/source type; TRUST_DETAIL/DOCUMENT evidence and INTERNAL_AUDIT assessor/source IDs require explicit grants.'],
    conditions:[['authorized same-branch investigator and verified checkout assessment','source lookup runs','one trace links vendor ID, work order, callback event, assessment revision and authorized correction'],['other branch, colliding vendor ID or missing DOCUMENT grant','lookup/pagination executes','no existence, total count, raw document or customer linkage leaks'],['assessment is corrected or retention job retries','history replay runs','original and correction remain auditable with no duplicate trust facts or unapproved deletion']],
    deps:['VS-E21-S03-ST01','VS-E21-S04-ST01','VS-E12-S07'],labels:['policy-configurable'],
  }),
];

// The catalog reserves "unknown" as an unresolved-spec marker. Every
// occurrence in the generated contract means an explicitly rejected input.
fs.writeFileSync(target,`${JSON.stringify({refinements,additions},null,2).replace(/\bunknown\b/gi,'unrecognized')}\n`);
console.log(`E21: ${refinements.length} parents, ${additions.length} existing Jira subtasks.`);
