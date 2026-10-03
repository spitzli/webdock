import type { BaseAccess, CollectionSlug, PayloadRequest, Where } from 'payload';
import { idOf, platformAdmin, principal } from './site-access';

type Ref = {relationTo?: string;value?: unknown};
async function targetAllowed(req: PayloadRequest, ref: Ref | null | undefined, write: boolean) {
  if(!ref?.relationTo || ref.relationTo.startsWith('payload-') || !req.payload.collections[ref.relationTo as CollectionSlug])return false;
  const collection=ref.relationTo as CollectionSlug;const id=idOf(ref.value);if(!id)return false;
  try {
    let filter:Where={id:{equals:id}};
    if(write){
      const access=req.payload.collections[collection].config.access.update;
      const result=access?await access({req,id,slug:collection}):false;
      if(!result)return false;
      if(result!==true)filter={and:[filter,result]};
    }
    const docs=await req.payload.find({collection,where:filter,overrideAccess:false,depth:0,limit:1,req,user:req.user});
    return docs.docs.length===1;
  }catch{return false;}
}
function lockPolicy(write: boolean, create=false) {
  const access: NonNullable<NonNullable<BaseAccess['collections']>['read']> = async ({req,slug,data})=>{
    if(slug==='payload-preferences' && principal(req)?.collection!=='users')return false;
    if(slug!=='payload-locked-documents')return true;
    if(platformAdmin({req}))return true;
    if(principal(req)?.collection!=='users')return false;
    if(data?.user && (data.user.relationTo!=='users'||idOf(data.user.value)!==req.user!.id))return false;
    if(data?.globalSlug)return false;
    if(data?.document && !(await targetAllowed(req,data.document,write)))return false;
    if(create)return Boolean(data?.document && data?.user && await targetAllowed(req,data.document,true));
    const locks=await req.payload.find({collection:'payload-locked-documents',overrideAccess:true,depth:0,pagination:false,req});
    const ids:number[]=[];
    for(const lock of locks.docs)if(await targetAllowed(req,lock.document,write))ids.push(lock.id);
    return ids.length?{id:{in:ids}}:false;
  };
  return access;
}
export const systemAccess:BaseAccess = {
  collections:{read:lockPolicy(false),create:lockPolicy(true,true),update:lockPolicy(true),delete:lockPolicy(true)},
  globals:{
    read:({req,slug})=>slug==='payload-jobs-stats'?platformAdmin({req}):true,
    update:({req,slug})=>slug==='payload-jobs-stats'?platformAdmin({req}):true,
  },
};
