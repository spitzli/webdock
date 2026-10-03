import type { CollectionSlug, Where, Endpoint, PayloadRequest } from 'payload';
import { idOf, principal } from '../cms/site-access';
import { verifyPreview } from './preview';

const reply = (data: unknown, status = 200) => Response.json(data, {status,headers:{'Cache-Control':'private, no-store'}});
export async function authorizedSite(req: PayloadRequest, scope = 'content:read') {
  const user = principal(req);
  if (user?.collection !== 'integrations' || !user.enabled || !user.scopes?.includes(scope)) return null;
  const result = await req.payload.find({collection:'sites',where:{key:{equals:String(req.routeParams?.site)}},overrideAccess:true,depth:0,limit:1,req});
  const site=result.docs[0];
  return site?.active && idOf(user.site)===site.id ? site : null;
}
const sources = {
  landing: {landing:['landing-pages','pages',true]},
  portfolio: {settings:['website-settings','site-settings',true],projects:['projects','projects',false]},
  business: {settings:['stall-settings','site-settings',true],header:['stall-header','site-settings',true],footer:['stall-footer','site-settings',true],pages:['stall-pages','pages',false],redirects:['stall-redirects','redirects',false],forms:['stall-forms','forms',false]},
} as const;
export const contentHandler: Endpoint['handler'] = async req => {
  const site=await authorizedSite(req);
  if(!site) return reply({error:'Site access denied.'},403);
  const resource=String(req.routeParams?.resource);
  const routes=sources[site.model as keyof typeof sources] as Record<string, readonly [string,string,boolean]>;
  const entry=routes?.[resource];
  if(!entry || !site.modules?.includes(entry[1] as never)) return reply({error:'Resource not enabled.'},404);
  const [collection,,singleton]=entry;
  const url=new URL(req.url || 'http://localhost');
  const locale=url.searchParams.get('locale')||site.defaultLocale;
  if(!site.languages?.includes(locale as 'en'|'de')) return reply({error:'Locale not enabled.'},400);
  const slug=req.routeParams?.slug ? String(req.routeParams.slug) : undefined;
  const token=url.searchParams.get('previewToken');
  if(token && (!slug || !verifyPreview(token,site.key,slug))) return reply({error:'Invalid preview token.'},403);
  req.context.contentPreview=Boolean(token);
  const isPublished=['projects','stall-pages'].includes(collection);
  const where: Where={and:[{site:{equals:site.id}},...(slug ? [collection==='stall-forms'?{id:{equals:Number(slug)}}:{slug:{equals:slug}}] : []),...(isPublished&&!token?[{_status:{equals:'published'}}]:[])]};
  const result=await req.payload.find({collection:collection as CollectionSlug,overrideAccess:false,user:req.user,req,depth:2,locale:locale as 'en'|'de',fallbackLocale:site.defaultLocale,draft:Boolean(token),where,sort:collection==='projects'?['sortOrder','name']:undefined,pagination:false});
  const docs = result.docs.map(doc=>{
    if(resource==='forms') { const {id,title,fields,submitButtonLabel,confirmationType,confirmationMessage,redirect}=doc as unknown as Record<string,unknown>; return {id,title,fields,submitButtonLabel,confirmationType,confirmationMessage,redirect}; }
    if(resource==='settings'&&site.model==='business') { const copy=structuredClone(doc) as unknown as Record<string,unknown>;if(copy.maintenance) delete (copy.maintenance as Record<string,unknown>).bypassKey;return copy; }
    if(resource==='landing' && !site.modules?.includes('faqs')) return {...doc,faqs:[]};
    return doc;
  });
  const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize) : value && typeof value==='object' ? Object.fromEntries(Object.entries(value).map(([key, v])=>[key,key==='relationTo'&&v==='stall-pages'?'pages':key==='relationTo'&&v==='stall-forms'?'forms':normalize(v)])) : value;
  if(singleton||slug) return docs[0]?reply(normalize(docs[0])):reply({error:'Content not found.'},404);
  return reply(normalize(docs));
};
export const contentEndpoints: Endpoint[] = [
  {path:'/content/v1/sites/:site/:resource',method:'get',handler:contentHandler},
  {path:'/content/v1/sites/:site/:resource/:slug',method:'get',handler:contentHandler},
];
