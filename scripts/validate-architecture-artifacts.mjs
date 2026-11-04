import { readdir, readFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const docsRoot = join(repositoryRoot, "docs");
const manifestPath = join(docsRoot, "architecture-artifacts.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const allowedTypes = new Set(["adr", "threat-model"]);
const allowedStatuses = new Set(["Proposed", "Accepted", "Deprecated", "Superseded"]);
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const errors = [];

if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.artifacts)) {
  throw new Error("Architecture registry must use schemaVersion 1 and contain artifacts");
}

const byId = new Map();
const paths = new Set();
for (const artifact of manifest.artifacts) {
  if (!artifact || typeof artifact !== "object") {
    errors.push("Registry contains a non-object artifact");
    continue;
  }
  if (byId.has(artifact.id)) errors.push(`Duplicate artifact id ${artifact.id}`);
  if (paths.has(artifact.path)) errors.push(`Duplicate artifact path ${artifact.path}`);
  byId.set(artifact.id, artifact);
  paths.add(artifact.path);
  if (!allowedTypes.has(artifact.type)) errors.push(`${artifact.id} has invalid type`);
  if (!semver.test(artifact.version ?? "")) errors.push(`${artifact.id} has invalid semantic version`);
  if (!allowedStatuses.has(artifact.status)) errors.push(`${artifact.id} has invalid status`);
  if (!Array.isArray(artifact.related) || artifact.related.length === 0) {
    errors.push(`${artifact.id} must reference at least one related artifact`);
  }
}

for (const artifact of manifest.artifacts) {
  const expectedPrefix = artifact.type === "adr" ? "ADR-" : "TM-";
  if (!artifact.id?.startsWith(expectedPrefix)) errors.push(`${artifact.id} does not match ${artifact.type}`);
  const absolutePath = normalize(join(repositoryRoot, artifact.path ?? ""));
  if (!absolutePath.startsWith(normalize(`${docsRoot}${sep}`)) && absolutePath !== docsRoot) {
    errors.push(`${artifact.id} path escapes docs`);
    continue;
  }
  let markdown;
  try {
    markdown = await readFile(absolutePath, "utf8");
  } catch {
    errors.push(`${artifact.id} path does not exist: ${artifact.path}`);
    continue;
  }
  const required = [
    `- Artifact-ID: ${artifact.id}`,
    `- Version: ${artifact.version}`,
    `- Status: ${artifact.status}`,
    "- Last reviewed:",
    "- Review due:",
    "## Change history",
    `| ${artifact.version} |`,
  ];
  for (const marker of required) {
    if (!markdown.includes(marker)) errors.push(`${artifact.id} is missing metadata marker: ${marker}`);
  }
  for (const relatedId of artifact.related ?? []) {
    const related = byId.get(relatedId);
    if (!related) {
      errors.push(`${artifact.id} references unknown artifact ${relatedId}`);
    } else if (!related.related?.includes(artifact.id)) {
      errors.push(`${artifact.id} relationship with ${relatedId} is not reciprocal`);
    }
  }
}

const registeredFiles = new Set(manifest.artifacts.map((artifact) => artifact.path.replace("docs/", "")));
const architectureFiles = (await readdir(docsRoot)).filter((file) =>
  /^(adr|threat-model)-\d{3}-.+\.md$/.test(file),
);
for (const file of architectureFiles) {
  if (!registeredFiles.has(file)) errors.push(`Unregistered architecture artifact docs/${file}`);
}

if (errors.length > 0) {
  throw new Error(`Architecture artifact validation failed:\n- ${errors.join("\n- ")}`);
}

process.stdout.write(`validated ${manifest.artifacts.length} versioned architecture artifacts\n`);
