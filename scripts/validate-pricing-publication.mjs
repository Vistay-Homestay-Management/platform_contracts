import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const fixtureUrl = new URL(
  "../fixtures/pricing-v1-publication-fingerprint.v1.json",
  import.meta.url,
);
const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));

function canonicalText(value) {
  if (value === null || value === undefined) return "<null>";
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalText(item)).join(", ")}]`;
  }
  return String(value);
}

function append(parts, value) {
  const text = canonicalText(value);
  parts.push(`${Buffer.byteLength(text, "utf8")}:${text};`);
}

function lexical(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function publicationCanonical(fingerprintFixture) {
  const profile = fingerprintFixture.profile;
  const parts = [];
  append(parts, fingerprintFixture.schemaVersion);
  append(parts, profile.id);
  append(parts, profile.propertyId);
  append(parts, profile.version);
  append(parts, profile.effectiveFrom);
  append(parts, profile.effectiveToExclusive);
  append(parts, profile.baseDailyRate);
  append(parts, profile.mediumDailyFactorBps);
  append(parts, profile.longDailyFactorBps);
  append(parts, profile.currency);
  append(parts, profile.checkInTime);
  append(parts, profile.checkOutTime);
  append(parts, profile.turnoverMinutes);
  append(parts, profile.quoteTtlMinutes);
  append(parts, profile.commissionDefaultBps);
  append(parts, profile.commissionMaxBps);
  append(parts, profile.reason);
  append(parts, profile.authoredByAdminAccountId);
  append(parts, profile.correlationId);
  append(parts, profile.authoredAt);

  const orderedRules = [...profile.rules].sort((left, right) =>
    left.priority - right.priority
      || lexical(left.code, right.code)
      || lexical(left.id, right.id),
  );
  for (const rule of orderedRules) {
    append(parts, rule.id);
    append(parts, rule.code);
    append(parts, rule.name);
    append(parts, rule.effectiveFrom);
    append(parts, rule.effectiveToExclusive);
    append(parts, rule.priority);
    append(parts, rule.daysOfWeek);
    append(parts, rule.channels);
    append(parts, rule.minimumStayDays);
    append(parts, rule.maximumStayDays);
    append(parts, rule.minimumGuests);
    append(parts, rule.maximumGuests);
    append(parts, rule.actionType);
    append(parts, rule.actionValue);
  }
  return parts.join("");
}

const canonical = publicationCanonical(fixture);
const actual = createHash("sha256").update(canonical, "utf8").digest("hex");

if (actual !== fixture.sha256) {
  throw new Error(
    `PRICING_PUBLICATION_V1 fingerprint mismatch: expected ${fixture.sha256}, actual ${actual}`,
  );
}

const reorderedFixture = structuredClone(fixture);
reorderedFixture.profile.rules.reverse();
const reordered = createHash("sha256")
  .update(publicationCanonical(reorderedFixture), "utf8")
  .digest("hex");
if (reordered !== actual) {
  throw new Error("Rule database/input order changed the publication fingerprint");
}

process.stdout.write(`validated PRICING_PUBLICATION_V1 fingerprint ${actual}\n`);
