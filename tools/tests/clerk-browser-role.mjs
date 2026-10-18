/** Change only the owned DEVELOPMENT Clerk user's role or disposable local mapping. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {Pool} from 'pg';
import {createClerkClient} from '@clerk/backend';
const [file,operation]=process.argv.slice(2),f=JSON.parse(readFileSync(file,'utf8'));
assert.match(f.container,/^webdock-browser-[a-f0-9]+$/);assert.equal(f.clerk?.synthetic,true);
assert.equal(execFileSync('docker',['inspect','--format','{{index .Config.Labels "webdock.browser-fixture"}}',f.container],{encoding:'utf8'}).trim(),f.container);
const u=new URL(f.env.DATABASE_URL_UNPOOLED);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.pathname,'/webdock_operator_test');
assert.equal(u.port,execFileSync('docker',['port',f.container,'5432/tcp'],{encoding:'utf8'}).trim().split(':').at(-1));
assert.ok(['demote','restore','disable-mapping','restore-mapping'].includes(operation));
const db=new Pool({connectionString:u.href,max:1});try{
 let result;
 if(operation==='demote'||operation==='restore'){
  const secret=f.env.CLERK_SECRET_KEY;assert.ok(secret?.startsWith('sk_test_'));
  const client=createClerkClient({secretKey:secret,telemetry:{disabled:true}});
  const user=await client.users.getUser(f.clerk.userID);
  assert.match(user.externalId??'',/^webdock-core-acceptance-/);
  assert.ok(user.emailAddresses.some(e=>e.emailAddress.endsWith('+clerk_test@example.com')));
  await client.users.updateUserMetadata(user.id,{privateMetadata:{webdockRole:operation==='demote'?'user':'operator'}});
  result={rowCount:1};
 }
 else result=await db.query('UPDATE webdock_auth.clerk_identity SET enabled=$1 WHERE issuer=$2 AND clerk_user_id=$3 AND user_id=$4',[operation==='restore-mapping',f.clerk.issuer,f.clerk.userID,f.clerk.localOperatorID]);
 assert.equal(result.rowCount,1);console.log('Owned development Clerk fixture authority changed: '+operation);
}finally{await db.end();}
