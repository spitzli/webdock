import { test, expect } from "bun:test";
import { runAction } from "../src/actions";
const calls: unknown[] = [];
const context: any = {
  http: { request: async (input: unknown) => { calls.push(input); return {status:200,body:{ok:true}}; } },
  apps: { provisioningList:async()=>({provisionings:[]}), provision:async(input:unknown)=>{calls.push(input);return {state:"queued"};}, provisioningStatus:async(input:unknown)=>{calls.push(input);return {state:"running"};} },
};
test("read actions cannot become write tunnels or select another HTTP binding", async () => {
  calls.length = 0;
  for (const input of [{path:"/api/webdock/cms",body:{}},{path:"https://evil.test"},{path:"/api/webdock/cms?url=evil"},{path:"/other"}]) {
    await expect(runAction(context, "cms.read", input)).rejects.toBeDefined();
  }
  expect(calls).toHaveLength(0);
  await runAction(context, "cms.read", {path:"/api/webdock/cms?transfer=abc&offset=0"});
  expect(calls[0]).toEqual({binding:"cms",method:"GET",path:"/api/webdock/cms?transfer=abc&offset=0"});
});
test("mutations use only the CMS transfer endpoint and reject unbounded chunks", async () => {
  calls.length=0;
  await runAction(context,"cms.write",{op:"append",transfer:"a".repeat(48),offset:0,data:"YQ=="});
  expect(calls[0]).toMatchObject({binding:"cms",method:"POST",path:"/api/webdock/cms"});
  await expect(runAction(context,"cms.write",{op:"append",transfer:"abc",offset:0,data:"a".repeat(30000)})).rejects.toBeDefined();
  await expect(runAction(context,"cms.write",{op:"commit",transfer:"abc",role:"operator"})).rejects.toBeDefined();
});
test("create selects the operator-approved CMS template without exposing resource controls", async()=>{
  calls.length=0;
  await runAction(context,"cms.create",{name:"My website",request_id:"request-1"});
  expect(calls[0]).toEqual({template_id:"managed-cms",name:"My website",request_id:"request-1"});
  await expect(runAction(context,"cms.create",{name:"My website",request_id:"request-1",image:"evil"})).rejects.toBeDefined();
});
