import type { Payload, User } from 'payload';
import { idOf } from '../cms/site-access';
import { SiteSelect } from './SiteSelect';
export async function SiteSelector({ payload, user }: { payload: Payload; user?: User | null }) {
  if(user?.collection!=='users') return null;
  const tenantIDs=(user.tenants || []).map(row=>idOf(row.tenant));
  const result=await payload.find({collection:'sites',overrideAccess:true,depth:1,pagination:false,where:user.role==='super-admin'?{}:{tenant:{in:tenantIDs}}});
  return <SiteSelect sites={result.docs.map(site=>({id:site.id,name:`${typeof site.tenant === 'object' && site.tenant ? site.tenant.name + ' / ' : ''}${site.name}`,tenant:idOf(site.tenant),locale:site.defaultLocale}))}/>;
}
