import 'server-only';
import {demoAccess} from './demo-bridges';
export type ShopKind='products'|'settings'|'orders'|'customers'|'media';
export type ShopOption={id:string;key:string;label:string;price:number};
export type ShopProduct={id:number;image:string;photo:number|null;name:string;description:string;category:string;available:boolean;sort:number;tags:string[];variants:ShopOption[];extras:ShopOption[];updatedAt:string};
export type ShopContent={section:'homepage'|'site-settings'|'promotion';updatedAt:string;data:Record<string,string|boolean|number|number[]|null>};
export type ShopOrder={number:string;mode:string;status:string;fulfillment:string;total:number;delivery:number;discount:number;createdAt:string;items:{name:string;variantLabel:string;quantity:number;total:number}[]};
export type ShopAddress={label:string;street:string;postalCode:string;city:string};
export type ShopMedia={id:number;url:string;alt:string};
export type ShopCustomer={id:number;name:string;email:string;verified:boolean;createdAt:string;updatedAt:string;addresses:ShopAddress[]};
export type ShopResult={categoryOptions?:Record<string,string>;tagOptions?:Record<string,string>;docs:(ShopProduct|ShopOrder|ShopCustomer|ShopMedia)[];sections?:ShopContent[];mediaChoices?:ShopMedia[];productChoices?:{id:number;name:string}[];hasMoreMedia?:boolean;hasMoreProducts?:boolean;page:number;hasNextPage:boolean};
export async function shopAccess(bindingID:string,kind:ShopKind,write=false){
 const access=await demoAccess(bindingID,write);
 if((access.bridge.kind!=='shop'&&access.bridge.shop!==true)||!['products','settings','orders','customers','media'].includes(kind)||(kind==='orders'&&(!['operator','admin'].includes(access.site.role)||write))||(kind==='customers'&&!['operator','admin'].includes(access.site.role))||(kind==='media'&&write))throw Error('Keine Berechtigung für diesen Shop-Bereich.');
 return access;
}
export async function shopRequest(bindingID:string,kind:ShopKind,page=1,body?:Record<string,unknown>):Promise<ShopResult>{
 if(body&&body.kind!==kind)throw Error('Ungültiger Shop-Bereich.');
 const {bridge,site}=await shopAccess(bindingID,kind,!!body);
 const response=await fetch(`${bridge.origin}/api/webdock/shop${body?'':`?kind=${kind}&page=${page}`}`,{method:body?'POST':'GET',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000),headers:{authorization:`Bearer ${bridge.secret}`,'Content-Type':'application/json','X-Webdock-Role':site.role},...(body?{body:JSON.stringify(body)}:{})});
 if(!response.ok){if([400,404,409].includes(response.status)){const data=await response.json().catch(()=>null);if(typeof data?.error==='string')throw Error(data.error.slice(0,300));}throw Error('Die Shop-Verwaltung ist gerade nicht erreichbar. Bitte später erneut versuchen.');}
 const reader=response.body?.getReader();if(!reader)throw Error('Leere Antwort.');let size=0;const chunks:Uint8Array[]=[];try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>500000)throw Error('Antwort zu groß.');chunks.push(value);}}finally{void reader.cancel().catch(()=>{});}const result=JSON.parse(Buffer.concat(chunks).toString('utf8')) as ShopResult;const mediaURL=(m:ShopMedia)=>({...m,url:m.url.startsWith('/')&&!m.url.startsWith('//')?bridge.origin+m.url:m.url});if(result.mediaChoices)result.mediaChoices=result.mediaChoices.map(mediaURL);if(kind==='media')result.docs=(result.docs as ShopMedia[]).map(mediaURL);return result;
}
