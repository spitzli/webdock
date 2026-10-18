import { mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root=fileURLToPath(new URL("./",import.meta.url));
await mkdir(root+"dist/ui",{recursive:true});
for(const options of [
 {entrypoints:[root+"src/index.ts"],outdir:root+"dist",target:"bun" as const,naming:"runtime.js"},
 {entrypoints:[root+"ui/cms.tsx"],outdir:root+"dist/ui",target:"browser" as const,format:"iife" as const,naming:"cms.[ext]",define:{"process.env.NODE_ENV":'"production"'}},
]){
 const result=await Bun.build({...options,minify:true});
 if(!result.success)throw new AggregateError(result.logs,"CMS plugin build failed");
}
await copyFile(root+"ui/index.html",root+"dist/ui/index.html");
console.log("Managed CMS plugin built.");
