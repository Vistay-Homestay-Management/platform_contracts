import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schemaDirectory = new URL("../events/v1/", import.meta.url);
const schemaPath = fileURLToPath(schemaDirectory);
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const files = (await readdir(schemaDirectory))
  .filter((file) => file.endsWith(".schema.json"))
  .sort();

if (files.length === 0) {
  throw new Error("No event schemas were found");
}

for (const file of files) {
  const raw = await readFile(join(schemaPath, file), "utf8");
  const schema = JSON.parse(raw);
  ajv.compile(schema);
  process.stdout.write(`validated ${file}\n`);
}
