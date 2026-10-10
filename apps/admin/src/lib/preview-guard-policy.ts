/** Request-local policy; no Payload authentication/hooks or credentials in this layer. */
export type PreviewGuardSession={operator:boolean;preview?:unknown};
export type PreviewGuardDependencies={hasSSOCookie:(headers:Headers)=>boolean;getSession:()=>Promise<PreviewGuardSession|null>};
export async function previewDenial(headers:Headers,dependencies:PreviewGuardDependencies):Promise<Response|null>{
 // An anonymous/local-native request still goes through its existing native authentication.
 // An SSO cookie must never fall back to a different Payload credential when Auth fails.
 if(!dependencies.hasSSOCookie(headers))return null;
 const deny=(status:number,message:string)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
 try{
  const session=await dependencies.getSession();
  if(!session)return deny(401,'Die Sitzung ist nicht verfügbar. Bitte erneut anmelden.');
  if(session.preview!==undefined&&session.preview!==null)return deny(403,'Dieser Betreiberbereich ist in der Kundenansicht gesperrt.');
  if(!session.operator)return deny(403,'Betreiberzugriff erforderlich.');
  return null;
 }catch{return deny(503,'Der Sitzungsstatus konnte nicht geprüft werden. Bitte später erneut versuchen.');}
}
export function guardNativeHandler<Context>(handler:(request:Request,context:Context)=>Promise<Response>,check:(headers:Headers)=>Promise<Response|null>){
 return async(request:Request,context:Context)=>{const denied=await check(request.headers);return denied||handler(request,context);};
}
