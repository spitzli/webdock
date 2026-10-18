import {writeFile} from "node:fs/promises";
import {createManifest} from "./src/manifest";
const [image,output]=process.argv.slice(2);
if(!image||!output)throw Error("Usage: bun extensions/managed-cms/manifest.ts <image@sha256:digest> <output.json>");
await writeFile(output,JSON.stringify(createManifest(image),null,2)+"\n");
