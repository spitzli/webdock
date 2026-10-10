import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHostingAllowances,
  effectiveHostingAllowances,
  parseHostingFields,
  commandSchema,
  resourceID,
  appDemand,
  resolveAppSpec,
} from "./index";
test("hosting is denied by default and unlimited is explicit", () => {
  assert.equal(normalizeHostingAllowances(undefined).apps, 0);
  assert.equal(normalizeHostingAllowances({ apps: null }).apps, null);
  for (const apps of [-1, "10", 1.5, Number.MAX_SAFE_INTEGER + 1, NaN])
    assert.throws(() => normalizeHostingAllowances({ apps }));
  assert.throws(() => normalizeHostingAllowances({ unknown: 1 }));
  assert.equal(effectiveHostingAllowances({ apps: 2 }, { apps: 3 }).apps, 5);
  assert.equal(
    effectiveHostingAllowances({ apps: null }, { apps: 3 }).apps,
    null,
  );
  assert.throws(() =>
    effectiveHostingAllowances({ apps: Number.MAX_SAFE_INTEGER }, { apps: 1 }),
  );
});

test('persistent app capacity is fixed filesystem space, retained without a running app', () => {
 const base={template:'custom',image:'registry.example/app@sha256:'+'a'.repeat(64),args:[],port:8080,healthPath:'/health',cpuMillicores:100,memoryBytes:67108864,ephemeralBytes:67108864,replicas:1};
 const spec=resolveAppSpec({...base,volumeBytes:1000000000});
 assert.equal(appDemand(spec).volumeBytes,1000000000);
 assert.equal(appDemand({...spec,replicas:0}).volumeBytes,1000000000);
 assert.equal(appDemand(spec,true).volumeBytes,1000000000);
 assert.equal(appDemand(spec,true).cpuMillicores,0);
 assert.equal(appDemand(resolveAppSpec(base)).volumeBytes,0);
 for(const bad of [{volumeBytes:1},{volumeBytes:-1},{volumeBytes:NaN},{volumeBytes:1000000000,replicas:2}])assert.throws(()=>resolveAppSpec({...base,...bad}));
});
test("legacy form edits preserve hosting and explicit inputs are exact", () => {
  const previous = normalizeHostingAllowances({ apps: 4 });
  assert.deepEqual(parseHostingFields({}, previous), previous);
  assert.equal(parseHostingFields({ "hosting.apps": "0" }, previous).apps, 0);
  assert.equal(
    parseHostingFields({ "hosting.apps": "unlimited" }, previous).apps,
    null,
  );
  for (const v of ["", "1e3", "1.1", "-1", "9007199254740992"])
    assert.throws(() => parseHostingFields({ "hosting.apps": v }, previous));
});
test("IDs remain strings and public commands reject actor injection", () => {
  assert.equal(resourceID.parse("9223372036854775807"), "9223372036854775807");
  for (const id of [1, "9223372036854775808", "1e3", "0"])
    assert.equal(resourceID.safeParse(id).success, false);
  assert.equal(
    commandSchema.safeParse({
      action: "clusters.list",
      actor: { operator: true },
    }).success,
    false,
  );
});

test('managed apps require immutable images, positive resources and explicit deletion confirmation', () => {
 const spec={template:'custom',image:'registry.example/app@sha256:'+'a'.repeat(64),args:[],port:8080,healthPath:'/health',cpuMillicores:100,memoryBytes:67108864,ephemeralBytes:67108864,replicas:1};
 assert.equal(commandSchema.safeParse({action:'apps.create',projectID:'123',name:'App',spec,idempotencyKey:'create-app-fixture-key',subscriptionRevision:1}).success,true);
 for(const bad of [{image:'app:latest'},{cpuMillicores:0},{healthPath:'http://host/'},{replicas:-1},{hostNetwork:true}])assert.equal(commandSchema.safeParse({action:'apps.create',projectID:'123',name:'App',spec:{...spec,...bad},idempotencyKey:'create-app-fixture-key',subscriptionRevision:1}).success,false);
 assert.equal(commandSchema.safeParse({action:'apps.delete',appID:'123',revision:1,idempotencyKey:'delete-app-fixture-key'}).success,false);
});
