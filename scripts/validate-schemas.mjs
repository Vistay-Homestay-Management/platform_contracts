import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schemaDirectory = new URL("../events/v1/", import.meta.url);
const exampleDirectory = new URL("../events/v1/examples/", import.meta.url);
const schemaPath = fileURLToPath(schemaDirectory);
const examplePath = fileURLToPath(exampleDirectory);
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const files = (await readdir(schemaDirectory))
  .filter((file) => file.endsWith(".schema.json"))
  .sort();

if (files.length === 0) {
  throw new Error("No event schemas were found");
}

const schemas = [];
for (const file of files) {
  const raw = await readFile(join(schemaPath, file), "utf8");
  const schema = JSON.parse(raw);
  schemas.push({ file, schema });
  ajv.addSchema(schema);
}

for (const { file, schema } of schemas) {
  if (!ajv.getSchema(schema.$id)) {
    throw new Error(`Schema ${file} could not be compiled`);
  }
  process.stdout.write(`validated ${file}\n`);
}

const examples = (await readdir(exampleDirectory))
  .filter((file) => file.endsWith(".example.json"))
  .sort();

for (const file of examples) {
  const schemaFile = basename(file).replace(".example.json", ".schema.json");
  const schemaId = `https://contracts.vistay.vn/events/v1/${schemaFile}`;
  const validate = ajv.getSchema(schemaId);
  if (!validate) {
    throw new Error(`Example ${file} has no matching schema ${schemaFile}`);
  }

  const raw = await readFile(join(examplePath, file), "utf8");
  const example = JSON.parse(raw);
  if (!validate(example)) {
    throw new Error(
      `Example ${file} failed ${schemaFile}: ${ajv.errorsText(validate.errors)}`,
    );
  }

  const wrongVersion = structuredClone(example);
  wrongVersion.version += 1;
  if (validate(wrongVersion)) {
    throw new Error(`Schema ${schemaFile} accepted the wrong event version`);
  }

  const missingCorrelation = structuredClone(example);
  delete missingCorrelation.correlationId;
  if (validate(missingCorrelation)) {
    throw new Error(`Schema ${schemaFile} accepted an incomplete envelope`);
  }

  process.stdout.write(`validated example ${file}\n`);
}
