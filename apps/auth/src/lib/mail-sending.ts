import {byokPolicy} from './hosting/byok';
import {auth} from './auth';
import {transaction} from './hosting/db';
import {authorizeMail,mailUnavailable} from './mail-access';
import {manageNativeMailKey,requireNativeSending} from './mail-native-keys';
import {configureNativeTransport} from './mail-send-transport';
async function actor(headers:Headers){const session=await auth.api.getSession({headers});if(!session)mailUnavailable();return {subject:session.user.id,sessionID:session.session.id};}
export async function getNativeSending(headers:Headers,customerID:string){
 if(process.env.WEBDOCK_NATIVE_MAIL_SENDING_ENABLED!=='true')return null;
 const identity=await actor(headers);
 let apiOrigin:string|null=null;
 if(process.env.MAIL_API_ORIGIN){const url=new URL(process.env.MAIL_API_ORIGIN);if(url.protocol!=='https:' || url.username || url.password || url.pathname!=='/' || url.search || url.hash)mailUnavailable();apiOrigin=url.origin;}
 return transaction(async db=>{
  const access=await authorizeMail(db,identity,customerID,false,false);if(!access.canManage)return null;
  const transport=(await db.query('SELECT mode,state FROM webdock_mail.send_transport WHERE customer_id=$1',[customerID])).rows[0]??null;
  const keys=(await db.query('SELECT id,label,key_suffix AS suffix,revoked_at AS "revokedAt" FROM webdock_mail.api_key WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 100',[customerID])).rows;
  const domains=(await db.query("SELECT id,domain FROM webdock_auth.mail_sender_domain WHERE customer_id=$1 AND status='ownership_verified' ORDER BY domain",[customerID])).rows;
  return {customerID,transport,keys,domains,byokAllowed:(await byokPolicy(db,customerID)).turbosmtp,apiOrigin};
 });
}
export async function manageNativeSending(headers:Headers,customerID:string,input:Record<string,string>){
 requireNativeSending();const identity=await actor(headers);
 if(input.action==='configure'){
  if(!['managed','byok'].includes(input.mode))mailUnavailable();
  await configureNativeTransport(identity,customerID,input.mode as 'managed'|'byok');return {message:'Native Mail sending is configured.'};
 }
 const command=input.action==='create'?{action:'create',label:input.label,...(input.domainID?{domainID:input.domainID}:{})}:{action:input.action,keyID:input.keyID};
 const result=await transaction(db=>manageNativeMailKey(db,identity,customerID,command));
 return {message:result.token?'Save this Webdock API key now. It is shown only once.':'Webdock API key revoked.',...('token' in result?{token:result.token}:{})};
}
