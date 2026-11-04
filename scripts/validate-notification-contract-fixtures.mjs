import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const fixtureRoot = fileURLToPath(
  new URL("../fixtures/notifications/", import.meta.url),
);

async function listJsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(path);
    }
  }
  return files.sort();
}

const files = await listJsonFiles(fixtureRoot);
assert.ok(files.length > 0, "Notification contract fixtures are missing");

const validFixtures = files.filter((file) => /[\\/]valid[\\/]/.test(file));
const invalidFixtures = files.filter((file) => /[\\/]invalid[\\/]/.test(file));
assert.equal(validFixtures.length, 6, "Expected six valid notification fixtures");
assert.equal(invalidFixtures.length, 6, "Expected six invalid notification fixtures");

for (const file of validFixtures) {
  const fixture = JSON.parse(await readFile(file, "utf8"));
  assert.equal(fixture.fixtureVersion, 1, `${file} has an unsupported fixture version`);
  assert.equal(fixture.valid, true, `${file} must be marked valid`);
  assert.equal(typeof fixture.kind, "string", `${file} has no fixture kind`);
  assert.equal(typeof fixture.request, "object", `${file} has no request`);
  assert.equal(typeof fixture.expected, "object", `${file} has no expected result`);

  if (fixture.kind === "notification-stream-reconnect") {
    assert.equal(fixture.expected.deliveryGuarantee, "AT_LEAST_ONCE");
    assert.equal(fixture.expected.duplicateFramesAllowed, true);
    assert.deepEqual(fixture.expected.clientDeduplicationKey, [
      "notificationId",
      "notificationRevision",
    ]);
  }

  if (fixture.kind === "notification-push-feature-flag") {
    assert.deepEqual(fixture.expected.effectiveChannels, ["IN_APP", "EMAIL"]);
    assert.equal(fixture.expected.mandatoryChannelsRemainEnabled, true);
    assert.equal(fixture.expected.pushCreated, false);
  }
}

for (const file of invalidFixtures) {
  const fixture = JSON.parse(await readFile(file, "utf8"));
  assert.equal(fixture.fixtureVersion, 1, `${file} has an unsupported fixture version`);
  assert.equal(fixture.valid, false, `${file} must be marked invalid`);
  assert.match(fixture.violation, /^[A-Z][A-Z0-9_]+$/);
  assert.match(fixture.expectedError, /^[A-Z][A-Z0-9_]+$/);
}

const rawProviderFixture = JSON.parse(
  await readFile(join(fixtureRoot, "invalid", "raw-provider-payload.json"), "utf8"),
);
assert.ok(rawProviderFixture.request.rawDestination);
assert.ok(rawProviderFixture.request.providerResponse);

const retryFixture = JSON.parse(
  await readFile(join(fixtureRoot, "valid", "retry-delivery.json"), "utf8"),
);
assert.ok(retryFixture.expected.maximumAttempts > 0);
assert.equal(retryFixture.expected.nextAttemptIsBounded, true);

process.stdout.write(
  `validated ${validFixtures.length} valid and ${invalidFixtures.length} invalid notification fixtures\n`,
);
