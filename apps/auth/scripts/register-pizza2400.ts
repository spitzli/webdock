// Offline operator provisioning; never imported by an HTTP route. Temporary session is revoked in finally.
import fs from 'node:fs';import {parseEnv} from 'node:util';import {randomBytes} from 'node:crypto';import {serializeSignedCookie} from 'better-call';
import {auth} from '../src/lib/auth';import {database} from '../src/lib/db';import {registerApplication} from '../src/lib/bootstrap';
const file='../../../pizza2400/.env.deploy';const env=parseEnv(fs.readFileSync(file,'utf8'));const registry=JSON.parse(fs.readFileSync('../../../pizza2400/.provisioning.json','utf8'));
let temporaryToken:string|undefined;
try{
 if(env.WEBDOCK_SSO_CLIENT_ID){console.log('Pizza2400 SSO already registered.');process.exit(0)}
 const operator=(await database.query('SELECT id FROM webdock_auth."user" WHERE email=$1 AND role=\'operator\' AND NOT coalesce(banned,false) AND "emailVerified" AND "twoFactorEnabled"', ['dominik@spitzli.dev'])).rows[0];if(!operator)throw Error('Verified enrolled operator required');
 const org=(await database.query('SELECT organization_id FROM webdock_auth.tenant_customer WHERE customer_id=$1',[registry.customerID])).rows[0];if(!org)throw Error('Tenant mapping missing');
 const ctx=await auth.$context;const session=await ctx.internalAdapter.createSession(operator.id);temporaryToken=session.token;
 const cookie=await serializeSignedCookie(ctx.authCookies.sessionToken.name,session.token,ctx.secret,ctx.authCookies.sessionToken.attributes);
 const result=await registerApplication({label:'Pizza2400 CMS',origin:'https://pizza2400.webdock.dev',logoutPath:'/api/sso/login',organizationID:org.organization_id,headers:new Headers({Cookie:cookie.split(';')[0]})});
 Object.assign(env,{WEBDOCK_AUTH_ISSUER:process.env.BETTER_AUTH_URL+'/api/auth',WEBDOCK_SSO_CLIENT_ID:result.clientID,WEBDOCK_SSO_CLIENT_SECRET:result.clientSecret,WEBDOCK_SSO_COOKIE_SECRET:randomBytes(48).toString('base64url'),WEBDOCK_SSO_APP_ORIGIN:'https://pizza2400.webdock.dev',WEBDOCK_SSO_ALLOW_LOCAL_HTTP:'false',WEBDOCK_SSO_ENFORCE:'true',OPERATOR_AUTH_SUBJECT:operator.id});
 fs.writeFileSync(file,Object.entries(env).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{mode:0o600});
 console.log('Pizza2400 CMS SSO registered, tenant bound, credentials saved privately.');
}finally{if(temporaryToken)await (await auth.$context).internalAdapter.deleteSession(temporaryToken);await database.end()}
