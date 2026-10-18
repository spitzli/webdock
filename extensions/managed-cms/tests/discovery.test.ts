import {test,expect} from "bun:test";
import {discoverCMS} from "../ui/discovery";
test("an existing website opens without any provisioning service or record",async()=>{
 const result=await discoverCMS(async()=>Response.json({siteName:"Existing website",siteURL:"https://existing.example"}),async()=>{throw Error("Hosting is not installed");});
 expect(result).toEqual({site:{name:"Existing website",origin:"https://existing.example"},instance:null});
});
test("unconfigured bridge discovers durable setup without creating resources",async()=>{
 const instance={template_id:"managed-cms",provisioning_id:"123",state:"running" as const,steps:[]};
 const result=await discoverCMS(async()=>{throw Error("Binding not configured");},async()=>({provisionings:[instance as any]}));
 expect(result).toEqual({site:null,instance});
});
test("a connected website cannot supply a credential URL or an unrelated path",async()=>{
 for(const siteURL of ["https://user:secret@example.test","http://example.test","https://example.test/untrusted"]){
  await expect(discoverCMS(async()=>Response.json({siteName:"Site",siteURL}),async()=>({provisionings:[]}))).rejects.toBeDefined();
 }
});
