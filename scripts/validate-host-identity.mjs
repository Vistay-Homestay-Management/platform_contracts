import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse } from "graphql";

const rootPath = fileURLToPath(new URL("../", import.meta.url));
const hostSchemaPath = join(rootPath, "schemas", "host-identity");
const hostEventPath = join(rootPath, "events", "host-account", "v1");
const hostFixturePath = join(rootPath, "fixtures", "host-identity");

async function listJsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listJsonFiles(path)));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(path);
  }
  return files.sort();
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value) {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}

function reverseObjectKeys(value) {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).reverse().map(([key, nested]) => [key, reverseObjectKeys(nested)]),
  );
}

function stableCorrelationId(value, file) {
  assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, `${file}: correlationId must be a UUID`);
}

function invalidFixtureError(fixture) {
  const input = fixture.input ?? {};
  switch (fixture.kind) {
    case "invitation-replay":
      return input.state === "ACTIVATED" && input.activationAttempt > 1
        ? "HOST_INVITATION_REPLAY"
        : "HOST_INVALID_STATE_TRANSITION";
    case "stale-version":
      return input.currentVersion > input.expectedVersion ? "HOST_STALE_VERSION" : "HOST_INVALID_STATE_TRANSITION";
    case "restricted-field":
      return (input.grantedFieldGroups ?? []).includes(input.requiredFieldGroup)
        ? "HOST_REDACTION_REQUIRED"
        : "HOST_RESTRICTED_FIELD";
    case "wrong-realm-type":
      return input.realm !== "HOST" || input.subjectType !== "HOST" || !["host-api", "host-portal"].includes(input.audience)
        ? "HOST_WRONG_REALM_OR_TYPE"
        : "HOST_INVALID_STATE_TRANSITION";
    case "partial-dependency":
      return input.propertyDependency !== "AVAILABLE" || input.mediaDependency !== "AVAILABLE"
        ? "HOST_PARTIAL_DEPENDENCY"
        : "HOST_PROPERTY_OWN_REQUIRED";
    case "missing-redaction":
      return input.fieldGroup === "SUMMARY" && input.explicitGrant === false
        ? "HOST_REDACTION_REQUIRED"
        : "HOST_RESTRICTED_FIELD";
    case "subject-collision":
      return input.existingSubject ? "HOST_SUBJECT_COLLISION" : "HOST_INVALID_STATE_TRANSITION";
    case "local-credential-model":
      return input.credentialOwner !== "KEYCLOAK" || input.sessionOwner !== "AUTHENTICATION"
        ? "HOST_CREDENTIAL_OWNER_VIOLATION"
        : "HOST_INVALID_STATE_TRANSITION";
    default:
      return "HOST_FIXTURE_UNRECOGNIZED";
  }
}

function validateValidFixture(fixture, file) {
  switch (fixture.kind) {
    case "host-viewer-self":
      assert.equal(fixture.request.realm, "HOST", `${file}: viewer realm must be HOST`);
      assert.equal(fixture.request.subjectType, "HOST", `${file}: viewer subject type must be HOST`);
      assert.equal(fixture.request.partition, "SELF", `${file}: viewer must be self scoped`);
      assert.deepEqual(fixture.request.fieldGroups, ["SUMMARY"], `${file}: viewer default group must be SUMMARY`);
      assert.deepEqual(fixture.expected.redactedFields, ["email", "phone"], `${file}: PII must be redacted by default`);
      assert.equal(fixture.expected.credentialFieldsPresent, false, `${file}: credentials must not cross the boundary`);
      break;
    case "host-activation-idempotency":
      assert.match(fixture.request.idempotencyKey, /^host-activate-fixture-/);
      assert.match(fixture.request.activationReference, /^KEYCLOAK_ACTIVATION_REF_/);
      assert.equal(fixture.expected.effectCount, 1, `${file}: activation replay must have one effect`);
      assert.equal(fixture.expected.replay, "SAME_RESULT", `${file}: activation replay must be deterministic`);
      assert.equal(fixture.expected.duplicateEvent, false, `${file}: activation replay must not duplicate an event`);
      break;
    case "host-publication-repeatability": {
      const first = fingerprint(fixture.canonicalInput);
      const second = fingerprint(reverseObjectKeys(fixture.canonicalInput));
      assert.equal(first, second, `${file}: canonical input fingerprint is not repeatable`);
      assert.equal(fixture.expected.sameFingerprint, true, `${file}: repeatability evidence is missing`);
      assert.equal(fixture.expected.previousPublishedVersionImmutable, true, `${file}: rollback must preserve immutable history`);
      assert.equal(fixture.expected.effectCount, 1, `${file}: repeat publication must have one effect`);
      break;
    }
    case "host-profile-explicit-pii":
      assert.ok(fixture.request.fieldGroups.includes("SUMMARY"), `${file}: SUMMARY must remain available`);
      assert.ok(fixture.request.fieldGroups.includes("PII"), `${file}: PII requires an explicit grant`);
      assert.ok(!fixture.request.fieldGroups.includes("DOCUMENT"), `${file}: document fields are out of scope`);
      assert.equal(fixture.expected.documentFieldsPresent, false, `${file}: document data must not cross the fixture`);
      break;
    case "property-own-binding":
      assert.equal(fixture.request.source, "PROPERTY_ACTIVE_MEMBERSHIP", `${file}: binding source must be Property`);
      assert.equal(fixture.request.ownershipTerm, "OWNED", `${file}: binding must use OWNED term`);
      assert.equal(fixture.request.dependencyStatus, "AVAILABLE", `${file}: dependency must be available`);
      assert.equal(fixture.expected.fallback, "DENY", `${file}: missing binding must fail closed`);
      assert.equal(fixture.expected.inferredFromCallerClaim, false, `${file}: caller claims cannot infer ownership`);
      break;
    case "admin-lifecycle-partition":
      assert.equal(fixture.request.caller, "ADMIN", `${file}: lifecycle changes require an admin`);
      assert.match(fixture.request.partition, /^ADMIN:(SITE|BRANCH)$/);
      assert.ok(fixture.request.fieldGroups.includes("SUMMARY"), `${file}: SUMMARY must remain available`);
      assert.equal(fixture.expected.effectCount, 1, `${file}: lifecycle command must be idempotent`);
      break;
    default:
      throw new Error(`HOST_VALID_FIXTURE_UNKNOWN_KIND: ${file}: ${fixture.kind}`);
  }
}

export async function validateHostIdentity({ verbose = true } = {}) {
  const manifestSchema = JSON.parse(await readFile(join(hostSchemaPath, "host-identity-contract.v1.schema.json"), "utf8"));
  const manifest = JSON.parse(await readFile(join(hostSchemaPath, "host-identity-contract.v1.json"), "utf8"));
  const rest = JSON.parse(await readFile(join(hostSchemaPath, "rest.v1.openapi.json"), "utf8"));
  const graphqlSource = await readFile(join(hostSchemaPath, "host-identity.graphql"), "utf8");

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  ajv.addSchema(manifestSchema);
  const validateManifest = ajv.getSchema(manifestSchema.$id);
  assert.ok(validateManifest, "HOST_MANIFEST_SCHEMA_NOT_COMPILED");
  assert.equal(validateManifest(manifest), true, `HOST_MANIFEST_INVALID: ${ajv.errorsText(validateManifest.errors)}`);

  const commonEvent = JSON.parse(await readFile(join(rootPath, "events", "v1", "common-event-envelope.schema.json"), "utf8"));
  ajv.addSchema(commonEvent);
  const eventSchemaFiles = (await listJsonFiles(hostEventPath)).filter((file) => file.endsWith(".schema.json"));
  assert.equal(eventSchemaFiles.length, 12, "HOST_EVENT_SCHEMA_COUNT_MISMATCH");
  const eventSchemas = [];
  for (const file of eventSchemaFiles) {
    const schema = JSON.parse(await readFile(file, "utf8"));
    ajv.addSchema(schema);
    eventSchemas.push({ file, schema });
  }
  const expectedEventTypes = new Set(manifest.events.map((event) => event.type));
  const actualEventTypes = new Set();
  for (const { file, schema } of eventSchemas) {
    assert.ok(ajv.getSchema(schema.$id), `HOST_EVENT_SCHEMA_NOT_COMPILED: ${basename(file)}`);
    const eventType = schema.allOf?.[1]?.properties?.type?.const;
    if (eventType) actualEventTypes.add(eventType);
    assert.match(schema.$id, /\/events\/host-account\/v1\//, `HOST_EVENT_SCHEMA_ID_OUTSIDE_V1: ${basename(file)}`);
  }
  assert.deepEqual(actualEventTypes, expectedEventTypes, "HOST_EVENT_CATALOG_MISMATCH");

  const eventExamples = (await listJsonFiles(hostEventPath)).filter((file) => file.endsWith(".example.json"));
  assert.equal(eventExamples.length, 6, "HOST_EVENT_EXAMPLE_COUNT_MISMATCH");
  const schemaByFilename = new Map(eventSchemas.map(({ file, schema }) => [basename(file), schema]));
  for (const file of eventExamples) {
    const example = JSON.parse(await readFile(file, "utf8"));
    const schema = schemaByFilename.get(basename(file).replace(".example.json", ".schema.json"));
    assert.ok(schema, `HOST_EVENT_EXAMPLE_WITHOUT_SCHEMA: ${basename(file)}`);
    const validate = ajv.getSchema(schema.$id);
    assert.equal(validate(example), true, `HOST_EVENT_EXAMPLE_INVALID: ${basename(file)}: ${ajv.errorsText(validate.errors)}`);
    const wrongVersion = structuredClone(example);
    wrongVersion.version += 1;
    assert.equal(validate(wrongVersion), false, `HOST_EVENT_VERSION_NOT_PINNED: ${basename(file)}`);
    const missingCorrelation = structuredClone(example);
    delete missingCorrelation.correlationId;
    assert.equal(validate(missingCorrelation), false, `HOST_EVENT_ENVELOPE_NOT_REQUIRED: ${basename(file)}`);
  }

  assert.equal(rest.openapi, "3.1.0", "HOST_REST_OPENAPI_VERSION_MISMATCH");
  assert.equal(rest["x-vistay-contract-id"], "HOST_IDENTITY_PROFILE", "HOST_REST_CONTRACT_ID_MISMATCH");
  assert.equal(rest["x-vistay-contract-status"], "PUBLISHED", "HOST_REST_CONTRACT_NOT_PUBLISHED");
  assert.equal(rest.components.securitySchemes.hostBearer["x-issuer-alias"], "KEYCLOAK_HOST_ISSUER", "HOST_REST_ISSUER_MISSING");
  assert.deepEqual(rest.components.securitySchemes.hostBearer["x-audiences"], ["host-portal", "host-api"], "HOST_REST_AUDIENCE_MISSING");
  for (const operation of manifest.operations.filter((item) => item.protocol === "REST")) {
    const method = operation.method.toLowerCase();
    assert.ok(rest.paths[operation.path]?.[method], `HOST_REST_OPERATION_MISSING: ${operation.id}`);
    assert.equal(rest.paths[operation.path][method].operationId, operation.id, `HOST_REST_OPERATION_ID_MISMATCH: ${operation.id}`);
    assert.equal(rest.paths[operation.path][method]["x-owner"], operation.owner, `HOST_REST_OWNER_MISMATCH: ${operation.id}`);
  }

  parse(graphqlSource);
  for (const field of ["hostViewer", "updateHostProfile", "changeHostLifecycle", "revokeHostSession"]) {
    assert.match(graphqlSource, new RegExp(`\\b${field}\\b`), `HOST_GRAPHQL_FIELD_MISSING: ${field}`);
  }
  assert.doesNotMatch(graphqlSource, /password|refreshToken|accessToken|secret/i, "HOST_GRAPHQL_CREDENTIAL_FIELD_PRESENT");

  const stableErrorCodes = new Set(manifest.stableErrors.map((error) => error.code));
  const fixtureFiles = await listJsonFiles(hostFixturePath);
  const validFixtures = fixtureFiles.filter((file) => /[\\/]valid[\\/]/.test(file));
  const invalidFixtures = fixtureFiles.filter((file) => /[\\/]invalid[\\/]/.test(file));
  assert.equal(validFixtures.length, 6, "HOST_VALID_FIXTURE_COUNT_MISMATCH");
  assert.equal(invalidFixtures.length, 8, "HOST_INVALID_FIXTURE_COUNT_MISMATCH");

  for (const file of validFixtures) {
    const fixture = JSON.parse(await readFile(file, "utf8"));
    assert.equal(fixture.fixtureVersion, 1, `HOST_VALID_FIXTURE_VERSION: ${basename(file)}`);
    assert.equal(fixture.valid, true, `HOST_VALID_FIXTURE_MARKER: ${basename(file)}`);
    assert.equal(typeof fixture.kind, "string", `HOST_VALID_FIXTURE_KIND: ${basename(file)}`);
    stableCorrelationId(fixture.correlationId, basename(file));
    validateValidFixture(fixture, basename(file));
  }

  for (const file of invalidFixtures) {
    const fixture = JSON.parse(await readFile(file, "utf8"));
    assert.equal(fixture.fixtureVersion, 1, `HOST_INVALID_FIXTURE_VERSION: ${basename(file)}`);
    assert.equal(fixture.valid, false, `HOST_INVALID_FIXTURE_MARKER: ${basename(file)}`);
    assert.match(fixture.violation, /^[A-Z][A-Z0-9_]+$/, `HOST_INVALID_FIXTURE_VIOLATION: ${basename(file)}`);
    assert.match(fixture.expectedError, /^HOST_[A-Z0-9_]+$/, `HOST_INVALID_FIXTURE_ERROR: ${basename(file)}`);
    assert.ok(stableErrorCodes.has(fixture.expectedError), `HOST_UNREGISTERED_ERROR: ${basename(file)}: ${fixture.expectedError}`);
    stableCorrelationId(fixture.correlationId, basename(file));
    const actualError = invalidFixtureError(fixture);
    assert.equal(actualError, fixture.expectedError, `HOST_FIXTURE_EXPECTED_ERROR_MISMATCH: ${basename(file)} expected ${fixture.expectedError}; observed ${actualError}`);
  }

  const repeatabilityFixture = JSON.parse(await readFile(join(hostFixturePath, "valid", "host-publication-repeatability.json"), "utf8"));
  const publicationFingerprint = fingerprint(repeatabilityFixture.canonicalInput);
  const report = {
    contractId: manifest.contractId,
    version: manifest.version,
    status: manifest.status,
    eventSchemas: eventSchemaFiles.length / 2,
    eventExamples: eventExamples.length,
    validFixtures: validFixtures.length,
    invalidFixtures: invalidFixtures.length,
    publicationFingerprint,
    acceptanceCriteria: {
      AC01: "manifest, REST, GraphQL and Kafka schemas validated",
      AC02: "replay, stale-version, restricted-field, wrong-realm/type, partial-dependency, redaction, collision and credential-owner negatives matched stable errors",
      AC03: "canonical publication input repeated with the same SHA-256 fingerprint; rollback immutability asserted"
    }
  };
  if (verbose) process.stdout.write(`validated Host identity contract ${JSON.stringify(report)}\n`);
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await validateHostIdentity();
}
