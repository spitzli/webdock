// Offline, explicit per-lead CMS registration. Temporary operator session is always revoked.
import fs from 'node:fs';import path from 'node:path';import {parseEnv} from 'node:util';import {randomBytes} from 'node:crypto';import {serializeSignedCookie} from 'better-call';
import {auth} from '../src/lib/auth';import {database} from '../src/lib/db';import {registerApplication} from '../src/lib/bootstrap';
const root=path.resolve('../../../webdock-demos'),manifest=JSON.parse(fs.readFileSync(path.join(root,'food-showcase-manifest.json'),'utf8')),registry=JSON.parse(fs.readFileSync(path.join(root,'food-showcase-registry.json'),'utf8'));
let temporaryToken:string|undefined;
try{
 const operator=(await database.query('SELECT id FROM webdock_auth."user" WHERE email=$1 AND role=\'operator\' AND NOT coalesce(banned,false) AND "emailVerified" AND "twoFactorEnabled"',['dominik@spitzli.dev'])).rows[0];if(!operator)throw Error('Verified enrolled operator required');
 const ctx=await auth.$context,session=await ctx.internalAdapter.createSession(operator.id);temporaryToken=session.token;
 const cookie=await serializeSignedCookie(ctx.authCookies.sessionToken.name,session.token,ctx.secret,ctx.authCookies.sessionToken.attributes);
 for(const site of manifest){
  const file=path.join(root,'sites',site.slug,'.env.deploy'),env=parseEnv(fs.readFileSync(file,'utf8'));
  const mapping=(await database.query('SELECT organization_id FROM webdock_auth.tenant_customer WHERE customer_id=$1',[registry[site.id].customerID])).rows[0];if(!mapping)throw Error('Missing tenant '+site.id);
  const label=site.name+' · Demo-CMS';
  const existing=(await database.query('SELECT id,client_id,organization_id FROM webdock_auth.app_binding WHERE label=$1',[label])).rows;
  if(env.WEBDOCK_SSO_CLIENT_ID){if(existing.length!==1||existing[0].client_id!==env.WEBDOCK_SSO_CLIENT_ID||existing[0].organization_id!==mapping.organization_id)throw Error('SSO mismatch '+site.id);console.log(site.id+' SSO verified');continue;}
  if(existing.length)throw Error('SSO binding exists without local credentials '+site.id);
  const result=await registerApplication({label,origin:'https://'+site.domain,logoutPath:'/api/sso/login',organizationID:mapping.organization_id,headers:new Headers({Cookie:cookie.split(';')[0]})});
  Object.assign(env,{WEBDOCK_AUTH_ISSUER:process.env.BETTER_AUTH_URL+'/api/auth',WEBDOCK_SSO_CLIENT_ID:result.clientID,WEBDOCK_SSO_CLIENT_SECRET:result.clientSecret,WEBDOCK_SSO_COOKIE_SECRET:randomBytes(48).toString('base64url'),WEBDOCK_SSO_APP_ORIGIN:'https://'+site.domain,WEBDOCK_SSO_ALLOW_LOCAL_HTTP:'false',WEBDOCK_SSO_ENFORCE:'true',OPERATOR_AUTH_SUBJECT:operator.id});
  fs.writeFileSync(file+'.tmp',Object.entries(env).map(([k,v])=>k+'='+JSON.stringify(v)).join('\n')+'\n',{mode:0o600});fs.renameSync(file+'.tmp',file);
  registry[site.id].tenantID=mapping.organization_id;registry[site.id].bindingID=result.binding;
  fs.writeFileSync(path.join(root,'food-showcase-registry.json'),JSON.stringify(registry,null,2)+'\n');console.log(site.id+' tenant and SSO ready');
 }
}finally{if(temporaryToken)await(await auth.$context).internalAdapter.deleteSession(temporaryToken);await database.end();}
