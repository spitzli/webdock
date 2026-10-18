import {test,expect} from "bun:test";
import {createManifest} from "../src/manifest";
test("published manifest uses a pinned image and separates read/write capabilities",()=>{
 const manifest=createManifest("ghcr.io/spitzli/webdock-extension-managed-cms@sha256:"+"a".repeat(64));
 expect(manifest.name).toBe("managed-cms");
 expect(manifest.actions.find(action=>action.name==="cms.read")?.intent).toBe("read");
 expect(manifest.actions.find(action=>action.name==="cms.create")?.capabilities).toEqual(["plugin.apps.provision"]);
 expect(()=>createManifest("ghcr.io/spitzli/webdock-extension-managed-cms:latest")).toThrow();
});
