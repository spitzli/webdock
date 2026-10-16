import { writeFileSync, readFileSync } from "node:fs";
import { tabulariumKindSchema } from "../../packages/plugin-sdk/src/contracts/index.ts";
const target = new URL("./tabularium-kind.schema.json", import.meta.url);
const generated = JSON.stringify(tabulariumKindSchema()) + "\n";
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== generated)
    throw Error("Plugin schema drift: run tools/plugins/generate-schema.ts");
} else writeFileSync(target, generated);
