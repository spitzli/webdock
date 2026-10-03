import { APIError, type Access, type CollectionConfig, type CollectionSlug, type Field, type Where } from 'payload';
import { allowedSites, idOf } from './site-access';

// Module models differ, but their site boundary is identical.
export function modelScope(collection: CollectionConfig, module: string, model?: string): CollectionConfig {
  for(const key of ['read','create','update','delete','readVersions'] as const) {
    const existing=collection.access?.[key];
    if(!existing) continue;
    const access: Access = async args=>{
      const result=await existing(args);
      if(!result) return false;
      const sites=await allowedSites(args.req,module,!['read'].includes(key),model);
      if(!sites.length) return false;
      if(key==='create') return true;
      const field = key === 'readVersions' ? 'version.site' : 'site';
      const filter:Where={[field]:{in:sites.map(site=>site.id)}};
      const scoped = key === 'readVersions' && typeof result === 'object' ? JSON.parse(JSON.stringify(result).replace(/"site":/g, '"version.site":')) as Where : result;
      return scoped===true?filter:{and:[scoped as Where,filter]};
    };
    collection.access![key]=access;
  }
  collection.hooks ??= {};
  collection.hooks.beforeValidate ??= [];
  collection.hooks.beforeValidate.push(async ({data,originalDoc,req})=>{
    if(!data) return data;
    const siteID=idOf(data.site ?? originalDoc?.site);
    const site=await req.payload.findByID({collection:'sites',id:siteID,overrideAccess:true,depth:0,req});
    if(model && site.model!==model) throw new APIError('This content model is not enabled for this site.',403);
    async function richRelations(value: unknown): Promise<void> {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) { for (const item of value) await richRelations(item); return; }
      const node = value as Record<string, unknown>;
      if (typeof node.relationTo === 'string' && node.value) {
        if (!req.payload.collections[node.relationTo as CollectionSlug]) throw new APIError('Invalid relationship collection.', 400);
        const target: unknown = await req.payload.findByID({ collection: node.relationTo as CollectionSlug, id: idOf(node.value), overrideAccess: true, depth: 0, req });
        if (!target || typeof target !== 'object' || !('site' in target) || idOf(target.site) !== siteID) throw new APIError('Rich-text references must belong to the same site.', 400);
      }
      for (const item of Object.values(node)) await richRelations(item);
    }
    async function check(fields:Field[], values:Record<string,unknown>) {
      for(const field of fields) {
        if(field.type==='tabs') { for(const tab of field.tabs) await check(tab.fields, 'name' in tab && tab.name ? (values[tab.name] as Record<string,unknown> || {}) : values); continue; }
        const value='name' in field && field.name ? values[field.name] : undefined;
        if (field.type === 'richText') await richRelations(value);
        if((field.type==='relationship'||field.type==='upload') && !['site','tenant'].includes(field.name) && value) {
          for(const ref of Array.isArray(value)?value:[value]) {
            const relation=typeof ref==='object' && ref && 'relationTo' in ref ? ref.relationTo : field.relationTo;
            if(Array.isArray(relation)) continue;
            const id=idOf(typeof ref==='object' && ref && 'value' in ref ? ref.value:ref);
            if(!id) continue;
            const target=await req.payload.findByID({collection:relation,id,overrideAccess:true,depth:0,req});
            if('site' in target && idOf(target.site)!==siteID) throw new APIError('Related content must belong to the same site.',400);
          }
        }
        if('fields' in field && Array.isArray(field.fields)) {
          if(field.type==='array') { for(const row of (value as Record<string,unknown>[] || [])) await check(field.fields,row); }
          else await check(field.fields,field.type==='group'?(value as Record<string,unknown>||{}):values);
        }
        if(field.type==='blocks' && Array.isArray(value)) for(const row of value) {
          const block=field.blocks.find(b=>typeof b!=='string'&&b.slug===row.blockType);
          if(block&&typeof block!=='string') await check(block.fields,row);
        }
      }
    }
    await check(collection.fields,data);
    return data;
  });
  return collection;
}
