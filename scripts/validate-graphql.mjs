import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { composeServices } from "@apollo/composition";
import { parse, validate } from "graphql";

const root = new URL("../graphql/backoffice/", import.meta.url);
const subgraphFiles = ["user.graphql", "notification.graphql"];

const services = await Promise.all(
  subgraphFiles.map(async (file) => ({
    name: file.replace(".graphql", ""),
    url: `http://service-${file.replace(".graphql", "")}:8080/graphql`,
    typeDefs: parse(
      await readFile(new URL(`subgraphs/${file}`, root), "utf8"),
    ),
  })),
);

const composition = composeServices(services);
if (composition.errors?.length) {
  throw new Error(
    `Backoffice federation composition failed:\n${composition.errors.join("\n")}`,
  );
}

assert.ok(composition.supergraphSdl, "Composition did not emit a supergraph");
assert.match(
  composition.supergraphSdl,
  /https:\/\/specs\.apollo\.dev\/authenticated\/v0\.1/,
);
assert.match(
  composition.supergraphSdl,
  /https:\/\/specs\.apollo\.dev\/requiresScopes\/v0\.1/,
);
assert.match(composition.supergraphSdl, /http:\/\/service-user:8080\/graphql/);
assert.match(
  composition.supergraphSdl,
  /http:\/\/service-notification:8080\/graphql/,
);
const apiSchema = composition.schema
  .toAPISchema()
  .toGraphQLJSSchema();

const operationFiles = ["viewer.graphql", "notification-stream.graphql"];
for (const file of operationFiles) {
  const operation = parse(
    await readFile(new URL(`operations/${file}`, root), "utf8"),
  );
  const errors = validate(apiSchema, operation);
  if (errors.length) {
    throw new Error(
      `Operation ${file} is incompatible with the supergraph:\n${errors.join("\n")}`,
    );
  }
  process.stdout.write(`validated operation ${file}\n`);
}

const transport = JSON.parse(
  await readFile(new URL("transport.contract.json", root), "utf8"),
);
assert.equal(transport.endpoint, "/graphql");
assert.equal(transport.subscriptionTransport.protocol, "GRAPHQL_OVER_SSE");
assert.equal(transport.subscriptionTransport.method, "POST");
assert.equal(transport.subscriptionTransport.accept, "text/event-stream");
assert.equal(transport.subscriptionTransport.resumeArgument, "afterCursor");
assert.equal(
  transport.authorization.notificationStreamRequiredScope,
  "notifications:read",
);
assert.equal(
  transport.subscriptionTransport.cursorPattern,
  "^(0|[1-9][0-9]*)$",
);
assert.equal(transport.subscriptionTransport.cursorSemantics, "EXCLUSIVE");
assert.equal(
  transport.subscriptionTransport.deliveryGuarantee,
  "AT_LEAST_ONCE",
);

process.stdout.write("validated Backoffice federation composition\n");
process.stdout.write("validated GraphQL-over-SSE transport contract\n");
