import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabaseService,type DatabaseServiceDependencies} from '../src/server/service.ts';
const actor={subject:'1',sessionID:'session',source:'studio' as const,scopes:['hosting:read','hosting:write']};
const command={action:'grant',bindingID:'2',subject:'3',profile:'read',runtimeOrigin:'https://db.example.test',connectionID:'connection',proxySecret:'s'.repeat(32),isolationVerified:true,databaseRoleVerified:true};
function fixture(allowed:boolean,external=true){
 const queries:string[]=[];let verified=0;
 const db={query:async(sql:string)=>{queries.push(sql);if(sql.includes('FROM webdock_auth.database_binding'))return{rows:[{id:'2',projectID:'4',customerID:'5',profile:'read'}]};if(sql.includes('FROM webdock_auth."user"'))return{rows:sql.includes("u.role='operator'")&&external?[]:[{id:'3'}]};if(sql.includes('INSERT INTO webdock_auth.database_runtime_owner'))return{rows:[{runtime_origin:'https://db.example.test'}]};return{rows:[]};}};
 const deps={storedConsoleIdentity:()=>null,withStoredIdentity:async()=>{throw Error('unused');},authorizeHosting:async()=>({operator:true,canWrite:true}),hostingAudit:async()=>{},encryptMailSecret:()=> 'sealed',decryptMailSecret:()=>{throw Error('unused');},gatewayOrigin:()=>undefined,recipientAuthority:{isExternal:()=>external,allowed:async(subject:string,customer:string)=>{assert.equal(subject,'3');assert.equal(customer,'5');verified++;return allowed;}}} as unknown as DatabaseServiceDependencies;
 return {run:()=>createDatabaseService(deps).executeDatabase(db as any,actor,command),queries,verified:()=>verified};
}
test('external role authority grants only a currently eligible Clerk recipient',async()=>{
 const denied=fixture(false);await assert.rejects(denied.run(),/unavailable/);assert.equal(denied.verified(),1);assert.equal(denied.queries.some(q=>q.includes('INSERT INTO')),false);
 const granted=fixture(true);await granted.run();assert.equal(granted.verified(),1);assert.equal(granted.queries.some(q=>q.includes('INSERT INTO webdock_auth.database_grant')),true);assert.equal(granted.queries.some(q=>q.includes("u.role='operator'")),false);
});

test('Better Auth database recipients retain local role and membership policy',async()=>{const local=fixture(false,false);await local.run();assert.equal(local.verified(),0);assert.equal(local.queries.some(q=>q.includes("u.role='operator'")),true);});
