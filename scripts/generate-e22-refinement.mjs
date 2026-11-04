import fs from 'node:fs';

const target = new URL('../docs/jira/v1.3/refinements/e22.json', import.meta.url);
const source = JSON.parse(fs.readFileSync(new URL('../docs/jira/v1.3/epics/e22.json', import.meta.url), 'utf8'));
const originals = new Map(source.issues.map(issue => [issue.sourceId, issue]));
const existing = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : {refinements:[],additions:[]};
const refinements = new Map(existing.refinements.map(issue => [issue.sourceId, issue]));
const additions = new Map(existing.additions.map(issue => [issue.sourceId, issue]));
const approval = 'Production HA activation requires ProductOwner/SRE approval of versioned per-service SLO, measured capacity, RTO, RPO, failure domains, recovery runbooks and cost envelope; no numeric target or topology is assumed from local Compose.';
function parent(sourceId, outcome, context) {
  refinements.set(sourceId,{sourceId,outcome,context,specStatus:'refined-parent',dispatchable:false});
}
function leaf(sourceId,jiraKey,repository,title,{outcome,context,scope,excluded,paths,artifacts,boundaries,interfaces,states,actions,groups,conditions,deps,labels=[],activationBlockers=[]}) {
  const parentSourceId=sourceId.replace(/-ST\d+$/,'');
  if (!originals.has(parentSourceId)) throw Error(`Missing E22 parent ${parentSourceId}`);
  const commands=repository==='platform_contracts' ? ['npm run validate:architecture','npm test'] : ['powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Test-ProductionResilience.ps1 -StaticOnly','powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Test-ProductionResilience.ps1 -DisposableDrill'];
  additions.set(sourceId,{
    templateSourceId:parentSourceId,sourceId,jiraKey,issueType:'Subtask',parentSourceId,summary:`[${sourceId}] ${title}`,
    actor:'ViStay SRE, architecture reviewer or release operator',outcome,context,inScope:scope,outOfScope:excluded,
    repositories:[repository],primaryRepository:repository,repositorySlices:[{repository,paths,artifacts}],
    interfaces,dataOwnership:boundaries,stateMachine:states,
    authorization:{actions,dataPartitions:['SYSTEM deployment and approved SRE/DBA roles only; SITE/BRANCH domain data remains scoped by its service even during failover.'],fieldGroups:groups},
    failureSemantics:['Fail closed on missing approved capacity/SLO, failover quorum, authentication, secret references or valid restore evidence; never label a local single-node smoke run as production HA.','Expose stale replication/consumer lag, split-brain risk, failed restore, degraded JWT authorization and RPO/RTO measurement as explicit operational failure states.','Exclude production secrets, raw customer records, private DB backups and access tokens from logs or Jira evidence.'],
    idempotencyConcurrency:['Recovery tests replay outbox/inbox events and compare business keys so Booking inventory, Payment/Finance money and Notifications remain at-most-once in effect.','Migration/failover must have one fenced authoritative writer; stale writers receive conflict and cannot overwrite recovered state.','Backup/restore artifacts have immutable manifest ID and checksums; repeating an isolated drill never writes into a live service database.'],
    dependencies:deps.map(sourceId=>({sourceId,relation:'is-blocked-by'})),
    acceptanceCriteria:conditions.map(([given,when,then],i)=>({id:`AC0${i+1}`,given,when,then})),
    tests:['Run both exact testCases from the repository root; distinguish static contract/drill from production failover acceptance.','Attach machine-readable report, unapproved-target evidence and rollback/reconciliation proof; no production data is used in local disposable drills.'],
    testCases:commands.map((command,i)=>({id:`TEST-0${i+1}`,level:i?'integration':'contract',command,verifies:i?['AC01','AC02','AC03']:['AC01','AC02'],evidence:`${sourceId}: versioned topology or metric fixture, redacted report and recovery/denial evidence`})),
    observability:['Correlate drill ID, failure domain, recovery epoch, source watermark and affected service with bounded metrics; emit RTO/RPO from measured timestamps only.','Alert when backup ages, restore checksum, replica lag, broker ISR/quorum or Keycloak availability violate an approved policy version.'],
    definitionOfDone:['Owner-specific artifacts exist, fixture/static tests pass, affected CI is green and approvals are recorded.','Disposable drill records independent restore/rollback, cutover, data reconciliation and user-visible outcome; production readiness is not implied by mock-only evidence.','Jira has PR, topology/policy fingerprint, reports and explicit activation gate for budget, capacity, RTO and RPO.'],
    evidence:['PR and CI URL for this repo.','Redacted static/drill result with recovery timestamps and source reconciliation.','Approved policy/topology version and rollback/expense note only when available.'],
    labels:[`repo-${repository.replaceAll('_','-')}`,'roadmap-v1-3',`source-${sourceId.toLowerCase()}`,'policy-configurable',...labels],
    decisionNoteVi:`${repository} owns this artifact. The current single-node local Compose does not establish any approved production availability, RTO, RPO, topology or spending plan.`,
    specStatus:'executable',workKind:repository==='platform_contracts'?'contract':'infrastructure',dispatchable:true,
    decisions:[],implementationBlockers:[],activationBlockers:[approval,...activationBlockers],externalBlockers:[],
  });
}

parent('VS-E22','E22 separates approved production SLO/capacity policy, stateful HA topology, ingress/rollout, isolated backup/restore and end-to-end failover evidence into five owner-scoped stories.','Current platform_infrastructure/compose.yaml is a single-host local stack: one PostgreSQL server, one Kafka broker/controller, Redis AOF and Keycloak with local cache and a PostgreSQL database. All five stories have owner-specific leaf specifications; none establishes production HA without approved targets and real drills.');
parent('VS-E22-S01','S01 produces approved, versioned production service-level/capacity targets from measured baselines and cost/failure-domain assumptions before HA implementation.','No approved numeric SLO, RTO/RPO, peak load, cost or region topology appears in the checked-in infrastructure; writing numbers without ProductOwner/SRE sign-off would be fabrication.');
parent('VS-E22-S02','S02 pins Postgres, Kafka, Redis and Keycloak failure-domain design and recovery invariants with a fenced-writer disposable rehearsal; local Compose remains development-only.','Postgres includes a separate Keycloak database in the local container; Kafka uses one broker/controller; Redis uses AOF but does not automatically become safe multi-node cache. All production choices await S01.');
parent('VS-E22-S03','S03 specifies multi-node ingress, routing and rolling service rollout with reproducible compatibility, identity and rollback gates.','Local Compose and host-based ingress are development topology, not proof of replicated routing, independent failure domains or production traffic migration.');
parent('VS-E22-S04','S04 specifies encrypted isolated backups, point-in-time database recovery and measured restore/reconciliation across service, identity and event boundaries.','Local persistent volumes and Redis AOF do not establish off-site backup, retention, Keycloak restoration or PITR. Production storage and retention require approval.');
parent('VS-E22-S05','S05 proves end-to-end failover/failback using versioned runbooks, fault injection, measured user-visible outcomes and explicit go/no-go evidence.','Synthetic/local drills establish procedure only; production acceptance requires approved S01 targets, S02–S04 implementation and independently reviewed evidence.');

leaf('VS-E22-S01-ST01','SCRUM-864','platform_contracts','Version production SLO RTO RPO capacity and cost decision contract',{
  outcome:'Contracts gives approvers one reproducible service-level register with measured and target fields, precise owners, risk acceptance and activation gates, without inventing target values.',
  context:'E22 baseline requires versioned SLO, RTO, RPO, capacity and cost before production HA. Existing Compose service health checks are not SLO or DR evidence.',
  scope:['Define per-critical-journey availability/latency/error-budget measurement for sign-in, inventory/quote, booking confirmation, Finance collection and customer/admin reads with trace and denominator semantics.','Record baseline sample window, peak/steady traffic, DB sizes, events/lag, currency/booking data criticality, geographic failure domains, projected capacity and cost; distinguish measured observations from proposed/approved targets.','Require ProductOwner/SRE approval fingerprint and effective date for target SLO, RTO, RPO, maximum data loss, maintenance policy and budget; unresolved fields produce NOT_APPROVED and block HA activation.','Add valid/invalid fixtures for zero denominator, mixed service durations, unapproved cost, missing RPO, impossible replica quorum and mistaken single-node HA claim.'],
  excluded:['Publishing numeric production targets or paid infrastructure capacity without owner approval.'],
  paths:['docs/production-resilience-slo-v1.md','schemas/production-resilience/**','fixtures/production-resilience/**','scripts/validate-architecture-artifacts.mjs'],
  artifacts:['versioned SLO/RTO/RPO and capacity decision register','approval/denial fixtures','service criticality and cost/failure-domain matrix'],
  boundaries:['Contracts stores approved policy and its evidence only; Infrastructure measures and owns deployment, services retain authoritative data.'],
  interfaces:['Version read-only resilience policy manifest consumed by infrastructure checks and DR gates; missing or unapproved target never resolves to a production default.'],
  states:['DRAFT -> MEASURED -> REVIEWED -> APPROVED -> SUPERSEDED; only approved effective version may authorize production HA acceptance.'],
  actions:['resilience:policy:draft','resilience:policy:approve'],groups:['SUMMARY targets/status; INTERNAL_AUDIT cost, production topology and approvers restricted.'],
  conditions:[['measured traffic and per-service journey inventory','policy fixture validation runs','every metric has numerator, denominator, evidence window, owner, failure domain and distinct proposed/approved value'],['missing RTO/RPO, unapproved budget or local single-node labelled production HA','negative fixtures run','publication fails with a specific NOT_APPROVED/INVALID_TOPOLOGY reason'],['approved immutable policy is replaced after a measured rebaseline','fingerprint validation repeats','old approval remains reconstructible and activation uses only the effective approved version']],
  deps:[],labels:['business-review-needed'],
});

leaf('VS-E22-S01-ST02','SCRUM-865','platform_infrastructure','Measure production capacity and service-level baselines safely',{
  outcome:'Infrastructure produces reproducible non-production capacity and observability baselines feeding the S01 approval register, without treating Compose as measured production HA.',
  context:'compose.yaml declares one PostgreSQL, one Kafka controller/broker, Redis AOF and one Keycloak with local cache; health and OTEL wiring already exist but no approved load or recovery target.',
  scope:['Inventory service, DB, Kafka topic, Redis and Keycloak dependencies, current container resources, persistent volumes and health/readiness checks; flag missing measurements explicitly.','Implement a static inventory plus opt-in disposable load/latency probe using synthetic bookings and anonymized/zero production data; capture request success, Kafka lag, DB size/connection pressure, Redis eviction and auth error rate with timestamp/region.','Export signed metric samples and measured constraints for S01 approval; cleanly stop if missing env/runtime and do not overload developer or production hosts.'],
  excluded:['Sizing or purchasing production nodes from one local Docker benchmark.'],
  paths:['scripts/Test-ProductionResilience.ps1','docs/runbooks/production-resilience.md','observability/**','compose.yaml','compose.full.yaml'],
  artifacts:['infra dependency and volume inventory','static and disposable baseline probes','redacted metric report and cleanup note'],
  boundaries:['Infrastructure owns measurement; source services own their data, and Contracts owns the approved target register.'],
  interfaces:['Export dated scenario ID, sample window, load shape, observed SLI and dependency watermark to Contracts manifest; no private Grafana URL or secret in report.'],
  states:['UNMEASURED -> SAMPLED -> VERIFIED; unavailable dependency yields INCOMPLETE, never a fabricated baseline.'],
  actions:['resilience:baseline:measure'],groups:['SUMMARY aggregated SLI; INTERNAL_AUDIT topology, costs and raw traces restricted.'],
  conditions:[['disposable local stack and synthetic measured scenario','probe runs','report records observed latency/availability, DB/Kafka/Redis/Keycloak pressure and source timestamp, clearly labelled non-production'],['missing broker, leaking token or production hostname supplied','probe preflight runs','run fails closed with safe diagnostic and no destructive traffic'],['same fixture is repeated and cleaned','measurement is re-run','consistent scenario fingerprint and no leftover live bookings or incorrect SLO approval are produced']],
  deps:['VS-E22-S01-ST01'],
});

leaf('VS-E22-S02-ST02','SCRUM-867','platform_contracts','Specify stateful recovery invariants and source reconciliation',{
  outcome:'Contracts defines owner-specific failover and DR invariants for Postgres, Kafka, Redis and Keycloak so replica recovery never silently loses or duplicates critical business effects.',
  context:'Local Kafka single controller/broker and shared PostgreSQL process lack a production failover guarantee; cache AOF is not authorization/monetary authority.',
  scope:['Pin per-service DB/Keycloak backup boundary, WAL/transaction position, schema migration compatibility and checksum; no cross-service DB reads during recovery.','Define Kafka producer acknowledgement/consumer inbox/outbox replay, ordered aggregate revision and partition ownership after leader change; stale producer must be fenced.','Define Redis lost/rebuilt cache fail-closed authorization and no payment/booking authoritative rows in cache; Keycloak session/token validation after failover and clock/key compatibility.','Add deterministic split-brain, partial WAL restore, old broker message replay, missing Redis grant, Keycloak expired session and Finance paid-vs-waived mismatch fixtures with reconciliation criteria.'],
  excluded:['Choosing a commercial cloud provider, numeric RPO or replication quorum as already approved.'],
  paths:['docs/production-resilience-invariants-v1.md','schemas/production-resilience/**','fixtures/production-resilience/**','scripts/validate-architecture-artifacts.mjs'],
  artifacts:['versioned stateful recovery invariants','source manifest/reconciliation fixtures','fencing and fail-closed authorization matrix'],
  boundaries:['PostgreSQL/Keycloak store authoritative identities and service data; Kafka transports events; Redis cache is never source of truth; each domain service performs own reconciliation.'],
  interfaces:['Version recovery epoch/owner manifest with DB WAL position, Kafka consumer checkpoint and Keycloak key version; Infrastructure drill checks these before accepting failover.'],
  states:['CANDIDATE_RESTORE -> RECONCILED -> ACCEPTED or REJECTED; incomplete source manifest cannot advance to ACCEPTED.'],
  actions:['resilience:recovery-contract:publish'],groups:['SUMMARY restore status/quality; INTERNAL_AUDIT topology, customer reconciliation and key references restricted.'],
  conditions:[['versioned source owners and consistent DB/broker checkpoint','recovery fixtures validate','one safe writer/epoch and independent Booking inventory, Finance/Payment money and User authorization reconciliation are demonstrable'],['split brain, Redis grant missing, old Keycloak signing key or event replay mismatch','negative fixtures run','recovery is REJECTED without double booking, duplicate money or unauthorized customer access'],['same source snapshot and old/new schema compatibility','fixture replays twice','one business effect per event and immutable recovery fingerprint are preserved']],
  deps:['VS-E22-S01-ST01'],
});

leaf('VS-E22-S02-ST01','SCRUM-866','platform_infrastructure','Design and rehearse database broker cache and identity failover',{
  outcome:'Infrastructure records a reviewable production topology and proves fenced disposable failover/rollback for PostgreSQL, Kafka, Redis and Keycloak only against approved target versions.',
  context:'The checked-in Compose has one PostgreSQL, Kafka KRaft broker/controller node, one Redis AOF instance and Keycloak configured with local cache on PostgreSQL; it cannot serve as an HA reference architecture.',
  scope:['Describe candidate failure domains, distinct DB/keycloak backup and credential boundaries, replica/writer fencing, Kafka quorum and retained checkpoints, Redis ephemeral-cache rebuild and Keycloak session/key handling; label provider-specific gaps requiring approvals.','Provide deployment templates disabled by default and a disposable isolated fault injection/leader switch, restore and rollback runbook pinned to S01 approved target and S02 invariants.','Measure actual failover and failback timeline/user-visible login, booking, payment, consumer lag and source reconciliation; reject if RTO/RPO or required invariants fail, report without production credentials.'],
  excluded:['Editing live Compose to declare a second container as quorum, silently shifting one production writer, or activating paid production infrastructure without cost/target sign-off.'],
  paths:['docs/runbooks/production-resilience.md','scripts/Test-ProductionResilience.ps1','observability/**','database/**','kafka/**'],
  artifacts:['disabled-by-default HA topology template','isolated stateful failure/rollback drill','RTO/RPO measurement and source reconciliation report'],
  boundaries:['Infrastructure owns topology, failover and restores; Finance/Booking/User/Keycloak keep their own data, Kafka transports events and Redis cache remains expendable.'],
  interfaces:['Use S01 approved manifest and S02 recovery invariant/checkpoint IDs before switch; expose read/write readiness and rollback reason as machine-readable drill output.'],
  states:['PROPOSED -> APPROVED -> DISPOSABLE_DRILL -> RECONCILED -> PRODUCTION_ELIGIBLE; failure rolls back to fenced prior writer with explicit recovery epoch.'],
  actions:['resilience:stateful:design','resilience:stateful:drill'],groups:['SUMMARY drill status; INTERNAL_AUDIT topology, private DB checksums and credentials restricted.'],
  conditions:[['approved target and disposable replicated services with known checkpoint','drill removes active node and restores it','one fenced writer succeeds with measured user-visible RTO/RPO and reconciled source manifests'],['target unapproved, split-brain writer, stale broker or incomplete Keycloak restoration','failover or approval attempts','PRODUCTION_ELIGIBLE is denied and degraded paths remain explicit'],['same failover/drill is retried or rollback is requested','operator repeats procedure','no duplicate money/inventory effects occur and previous writer cannot rejoin without fencing/epoch check']],
  deps:['VS-E22-S01-ST01','VS-E22-S01-ST02','VS-E22-S02-ST02'],labels:['business-review-needed'],
});

leaf('VS-E22-S03-ST02','SCRUM-869','platform_contracts','Specify rolling compatibility routing and auth acceptance matrix',{
  outcome:'Release operators have a versioned contract for routed traffic, compatible API/event/schema deployments and authenticated failover across customer, admin and mobile journeys.',
  context:'Services share gateway/ingress but do not have a checked-in proof that old and new versions coexist safely during a multi-node rollout.',
  scope:['Enumerate admin/customer/mobile entry points and login redirect/host/cookie invariants; capture method preservation, TLS and forwarded-header trust, session affinity if required and no cross-tenant route fallback.','Pin expand/migrate/contract order for service schema, Kafka payload, GraphQL and REST revisions; require old and new versions to pass parallel read/write fixtures.','Define synthetic route and authorization probes for draining, partial outage, expired JWT, failed refresh, stale router configuration and rollback with versioned expected statuses.'],
  excluded:['Assuming sticky sessions solve identity replication or declaring local host routing production-ready.'],
  paths:['docs/production-resilience-routing-v1.md','schemas/production-resilience/**','fixtures/production-resilience/**','scripts/validate-architecture-artifacts.mjs'],
  artifacts:['rolling-version compatibility matrix','routed auth and host isolation fixtures','release/cutover acceptance contract'],
  boundaries:['Contracts owns invariants; ingress owns TLS/router configuration; User/Auth/Keycloak own authentication and domain services own schema/event compatibility.'],
  interfaces:['Version compatibility manifest with old/new service revision, host class, issuer/audience, consumer event version, health and readiness route.'],
  states:['CANDIDATE -> COMPATIBLE -> CANARY -> VERIFIED -> PROMOTED or ROLLED_BACK.'],
  actions:['resilience:routing-contract:publish'],groups:['SUMMARY version and availability; INTERNAL_AUDIT routing trust rules and auth diagnostics restricted.'],
  conditions:[['old/new service versions and approved entry point inventory','compatibility fixtures run','every public and admin host routes to correct issuer and version and old/new writes remain valid'],['invalid host, stale JWT, missing trusted proxy or incompatible consumer','negative fixture runs','request fails closed without cross-host session or data leakage and promotion is rejected'],['canary fails or rollout retries','rollback contract executes','prior compatible version restores independently without duplicate booking or monetary effects']],
  deps:['VS-E22-S01-ST01','VS-E22-S02-ST02'],
});

leaf('VS-E22-S03-ST01','SCRUM-868','platform_infrastructure','Design and rehearse multi-node ingress routing and zero-downtime rollout',{
  outcome:'Infrastructure can rehearse service/ingress node failure and rolling deployment with readiness, draining, isolated authentication and bounded rollback evidence.',
  context:'The local reverse proxy and Compose stack run on one host; additional containers alone cannot prove multi-node failure isolation.',
  scope:['Specify approved candidate ingress TLS/host, DNS/load-balancer and service placement across independent failure domains; put production templates behind an explicit inactive gate.','Automate isolated router/node eviction and old/new service canary with readiness vs liveness, connection draining and explicit websocket/SSE/Kafka consumer transition.','Capture login/admin/mobile/booking/finance synthetic probe results, request correlation, old/new compatibility manifest fingerprint, rollback/failback times and unsupported topology denial.'],
  excluded:['Changing customer DNS, buying load balancers or publishing unapproved production TLS material.'],
  paths:['docs/runbooks/production-resilience.md','scripts/Test-ProductionResilience.ps1','ingress/**','observability/**'],
  artifacts:['inactive multi-node ingress deployment design','canary and node-failure drill','bounded rollback and redacted auth/host test report'],
  boundaries:['Infrastructure owns routing and service placement; Keycloak owns session/token issuance; Booking/Finance retain their authoritative writes.'],
  interfaces:['Consume approved S01 policy and S03 routing manifest; emit per-host probe/release revision, drain timestamps and acceptance verdict.'],
  states:['PLANNED -> DEPLOYED_CANARY -> DRAINING -> VERIFIED -> PROMOTED or ROLLED_BACK.'],
  actions:['resilience:rollout:drill','resilience:routing:approve'],groups:['SUMMARY probe pass rates; INTERNAL_AUDIT network inventory and auth diagnostics restricted.'],
  conditions:[['approved SLO and compatible old/new manifest with disposable nodes','router fails or canary is introduced','eligible traffic routes only to healthy version, old connections drain and measured journey outcomes remain within approved limits'],['identity issuer mismatch, cross-host redirect, no remaining healthy backend or unauthorized policy','preflight or failover runs','promotion is denied and existing route remains or degrades explicitly without redirect loop'],['canary errors or old node rejoins','rollback/failback runs','old version resumes with traceable revision and no double booking, duplicate payment or leaked sessions']],
  deps:['VS-E22-S01-ST02','VS-E22-S02-ST01','VS-E22-S03-ST02'],
});

leaf('VS-E22-S04-ST02','SCRUM-871','platform_contracts','Define backup manifest retention and domain restore reconciliation',{
  outcome:'A versioned backup contract makes every restore reconstructible, cryptographically checkable and business-reconciled before acceptance.',
  context:'Current local volumes contain development state; they provide neither an approved off-site retention policy nor per-domain recovery checkpoints.',
  scope:['Specify per-database ownership and versioned manifests for service PostgreSQL data, Keycloak identity database, Kafka offsets/events and rebuildable Redis cache; define cut-consistent WAL and migration/key references.','Require encrypted artifact metadata with checksum, key reference, region/failure-domain, immutability/expiry, approval and synthetic restore timestamp; retention numbers remain approval-controlled.','Provide valid and invalid fixtures for missing WAL segment, checksum mismatch, expired key, partial Keycloak restore, Kafka replay and Booking/Finance/Payment balance divergence.'],
  excluded:['Putting backup archives, encryption keys, personal records or real production retention durations in Git/Jira.'],
  paths:['docs/production-resilience-backup-v1.md','schemas/production-resilience/**','fixtures/production-resilience/**','scripts/validate-architecture-artifacts.mjs'],
  artifacts:['backup manifest and retention decision schema','domain checkpoint and reconciliation matrix','isolated restore denial fixtures'],
  boundaries:['Each service owns its DB and data checks; Keycloak owns identity database, Kafka transport checkpoint and Redis cache is rebuilt, never primary authority.'],
  interfaces:['Manifest references S01 policy and S02 recovery epoch; Infra supplies encrypted backup/checksum and independent restore report, domain owners validate reconciliation.'],
  states:['CAPTURED -> VERIFIED -> RESTORED_ISOLATED -> RECONCILED -> ACCEPTED or REJECTED.'],
  actions:['resilience:backup-contract:publish'],groups:['SUMMARY restore outcome; INTERNAL_AUDIT source checkpoint and key references restricted.'],
  conditions:[['consistent service checkpoints and approved retention policy','manifest fixture validates','per-domain ownership, source watermark and cryptographic checksum can be reproduced'],['missing WAL, wrong key, partial restore or mismatched booking/money aggregates','negative fixture validates','restore is rejected before any live cutover, without claiming RPO compliance'],['same immutable backup replayed twice in isolation','domain reconciliation runs','fingerprint and authoritative balances stay stable while duplicate events have one business effect']],
  deps:['VS-E22-S01-ST01','VS-E22-S02-ST02'],labels:['business-review-needed'],
});

leaf('VS-E22-S04-ST01','SCRUM-870','platform_infrastructure','Implement isolated encrypted backup and point-in-time restore drills',{
  outcome:'Infrastructure proves repeatable encrypted backup and isolated PITR/Keycloak recovery with off-site failure-domain evidence and never restores over live data.',
  context:'One local Postgres volume, Kafka volume and Redis AOF are not a backup plan; no production off-site storage or RPO has been approved.',
  scope:['Prepare inactive-by-default backup/restore templates for service and Keycloak Postgres using WAL/point-in-time recovery, Kafka retention/checkpoint, encrypted artifact/checksum and recoverable key reference.','Rehearse a synthetic isolated restore from a chosen timestamp, rehydrate Redis as expendable cache, reconcile Kafka offset/event replay and capture independent service owner results.','Verify off-site/failure-domain policy, safe retention, access isolation, stale/missing backup alerting and measured restore timeline without copying live PII to developer hosts.'],
  excluded:['Overwriting developer or production databases, shipping encryption secrets in archives, or presenting local single-host copies as approved off-site backup.'],
  paths:['docs/runbooks/production-resilience.md','scripts/Test-ProductionResilience.ps1','database/**','kafka/**','observability/**'],
  artifacts:['inactive encrypted backup/PITR template','isolated synthetic restore drill','checksum, retention and RTO/RPO measured report'],
  boundaries:['Infrastructure handles artifacts, encryption and restores; domain service owns data reconciliation; Keycloak credentials/DB are separate from customer domain schemas.'],
  interfaces:['Consume S01 approved policy and S04 manifest; publish checkpoint IDs, checksum, restore age, exact recovered timestamp and redacted domain-owner verdict.'],
  states:['PLANNED -> BACKED_UP -> RESTORED_ISOLATED -> RECONCILED -> ELIGIBLE or FAILED.'],
  actions:['resilience:backup:run','resilience:restore:drill'],groups:['SUMMARY backup age; INTERNAL_AUDIT protected artifact inventory and key references restricted.'],
  conditions:[['approved retention and target with synthetic isolated databases','backup then PITR restore runs','checksums match, Keycloak and services start at consistent recovery epochs, Kafka replay reconciles and elapsed/data-loss metrics are measured'],['artifact corrupted, key unavailable, retention not approved or restore target equals live DB','preflight executes','operation stops before any live write and emits explicit failed proof'],['same drill and recovery epoch are repeated','restore and cache rebuild run again','no duplicated monetary/booking effects and immutable source manifests remain independently verifiable']],
  deps:['VS-E22-S01-ST02','VS-E22-S02-ST01','VS-E22-S04-ST02'],
});

leaf('VS-E22-S05-ST02','SCRUM-873','platform_contracts','Specify disaster-recovery go-no-go and evidence gates',{
  outcome:'A versioned acceptance gate distinguishes a local procedure test from approved production DR readiness and objectively rejects missing evidence.',
  context:'No production SLO/RTO/RPO, spending approval or independently validated multi-node and off-site restore results exist in this repository.',
  scope:['Specify go/no-go matrix linking S01 approved policy, S02 fenced stateful recovery, S03 routing/version compatibility and S04 isolated restore and reconciliation.','Define measurable start/end timestamps and affected users, action owners, observer sign-offs, failure-domain loss, data-loss source checkpoints, on-call escalation and rollback evidence.','Create negative fixtures for missing approval, exceeded RTO/RPO, split brain, faulty Keycloak session, lost bookings or paid/unpaid mismatch, stale backup and missing rollback.'],
  excluded:['Approving a vendor topology or product spend without signed target and live cross-domain evidence.'],
  paths:['docs/production-resilience-dr-v1.md','schemas/production-resilience/**','fixtures/production-resilience/**','scripts/validate-architecture-artifacts.mjs'],
  artifacts:['DR acceptance decision manifest','failure matrix and go/no-go fixtures','independent reviewer evidence checklist'],
  boundaries:['Contracts owns acceptance gates; Infrastructure owns drills; ProductOwner/SRE approve target and Finance/Booking/User owners validate source data.'],
  interfaces:['Read versioned approved S01 and attested S02–S04 outcomes; write append-only verdict with fingerprints, source checkpoints, exceptions and approver identities.'],
  states:['DRAFT -> EVIDENCE_COMPLETE -> REVIEWED -> APPROVED or REJECTED; any revoked dependency supersedes approval.'],
  actions:['resilience:dr:review','resilience:dr:approve'],groups:['SUMMARY go/no-go result; INTERNAL_AUDIT approvers, topology and source checks restricted.'],
  conditions:[['complete owner-signed approval and independently attested cross-domain drill','go/no-go gate runs','each approved target has actual measured result, source checkpoint, rollback and reviewer evidence'],['RTO/RPO exceeded, source data diverges or approval is absent','negative fixture runs','gate returns REJECTED with named reason without implicitly authorizing production cutover'],['approved policy changes or old drill result replayed','decision is recalculated','previous acceptance remains auditable but cannot be reused for the new policy fingerprint']],
  deps:['VS-E22-S01-ST01','VS-E22-S02-ST02','VS-E22-S03-ST02','VS-E22-S04-ST02'],labels:['business-review-needed'],
});

leaf('VS-E22-S05-ST01','SCRUM-872','platform_infrastructure','Exercise end-to-end failure injection failback and recovery runbook',{
  outcome:'SRE can inject isolated failures, measure real user-visible recovery and data integrity and rollback/failback with an independently reviewable DR verdict.',
  context:'Single-node Compose is for local smoke tests; cross-node failure, off-site restore and approved production targets must be proven separately.',
  scope:['Version runbook with preflight approvals, safe blast radius, observer/rollback owners, synthetic tenant and independent checkpoints for admin/customer/mobile login, booking inventory, Finance/Payment and Kafka events.','Inject approved network/node/service/identity loss in disposable isolated topology; restore and fail back using S02 fencing, S03 route draining and S04 isolated backup while recording user errors and timestamps.','Generate redacted evidence with actual RTO/RPO, domain aggregates, alert/ticket timing, observer sign-off and go/no-go decision; abort before live traffic if required proof is missing.'],
  excluded:['Unapproved production chaos testing, production tenant data export, silent loss acceptance or promoting a disposable success to production readiness.'],
  paths:['docs/runbooks/production-resilience.md','scripts/Test-ProductionResilience.ps1','observability/**','database/**','kafka/**'],
  artifacts:['controlled fault-injection and failback runbook','end-to-end synthetic drill and source diff','approved policy fingerprint and go/no-go report'],
  boundaries:['Infrastructure orchestrates failures; Booking/Finance/User/Keycloak independently attest their source data, Contracts defines acceptance.'],
  interfaces:['Consume S01 approved target and attested S02/S03/S04 manifests and S05 decision schema; publish timestamps, source watermarks, failure/rollback events.'],
  states:['PRECHECK -> FAULT_INJECTED -> FAILOVER -> RECONCILE -> FAILBACK -> REVIEWED or ABORTED.'],
  actions:['resilience:dr:execute'],groups:['SUMMARY DR time/status; INTERNAL_AUDIT logs, user-impact estimates and recovery keys restricted.'],
  conditions:[['approved policy and preflight plus isolated synthetic tenant','single failure-domain fault and failback run','affected journeys and checkpoints reconcile with actual RTO/RPO, owner evidence and decision output'],['missing approval, open split brain, exceeded error budget or backup checksum fails','drill preflight/reconcile runs','live cutover is refused, abort is logged and previous safe writer/route remains fenced'],['fault injection or drill replay is repeated','operator repeats runbook','new drill ID and old immutable evidence remain separate, with no duplicate charges or bookings']],
  deps:['VS-E22-S02-ST01','VS-E22-S03-ST01','VS-E22-S04-ST01','VS-E22-S05-ST02'],
});

existing.refinements=[...refinements.values()].sort((a,b)=>a.sourceId.localeCompare(b.sourceId,'en',{numeric:true}));
existing.additions=[...additions.values()].sort((a,b)=>a.sourceId.localeCompare(b.sourceId,'en',{numeric:true}));
fs.writeFileSync(target,JSON.stringify(existing,null,2)+'\n');
console.log(`E22: ${existing.refinements.length} parents, ${existing.additions.length} existing Jira subtasks.`);
