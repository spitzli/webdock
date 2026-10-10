
import { msgid } from '@webdock/i18n';

import { getRequestI18n } from '@webdock/i18n/next';
import {headers} from 'next/headers';
import {notFound,redirect} from 'next/navigation';
import Link from 'next/link';
import {auth} from '@/lib/auth';
import {shopAccess,shopRequest,type ShopKind,type ShopProduct,type ShopOrder,type ShopCustomer,type ShopMedia} from '@/lib/studio-shop';
import {ProductWorkspace,SettingsWorkspace,CustomerWorkspace} from './shop-forms';
import './shop.css';
export async function generateMetadata(){ const i18n = await getRequestI18n(); return {title: i18n.t("Manage shop")}; }
const names:Record<ShopKind,string>={products:msgid("Products"),settings:msgid("Page content"),orders:msgid("Demo orders"),customers:msgid("Customers"),media:msgid("Media")};
const descriptions:Record<ShopKind,string>={products:msgid("Find products, adjust prices and manage availability."),settings:msgid("Edit the homepage and shop information."),orders:msgid("View simulated orders. No real delivery or payment."),customers:msgid("Manage names and saved addresses."),media:msgid("View existing images. Assign them to a product or the homepage.")};
const money=(n:number,locale:string)=>new Intl.NumberFormat(locale,{style:'currency',currency:'EUR'}).format(n/100);
const date=(s:string,locale:string)=>new Date(s).toLocaleString(locale === "de" ? "de-DE" : "en-GB",{timeZone:'Europe/Berlin'});
export default async function Shop({params,searchParams}:{params:Promise<{bindingID:string}>;searchParams:Promise<{kind?:string;page?:string}>}){
  const i18n = await getRequestI18n();

 const {bindingID}=await params;if(!(await auth.api.getSession({headers:await headers()})))redirect('/api/sso/login?returnTo='+encodeURIComponent('/sites/'+bindingID+'/shop'));
 const search=await searchParams;const kind=(search.kind||'products') as ShopKind;const rawPage=search.page||'1';if(!Object.hasOwn(names,kind)||!/^[1-9]\d{0,3}$/.test(rawPage))notFound();
 const access=await shopAccess(bindingID,kind).catch(()=>null);if(!access)notFound();const writable=!access.readOnly&&['operator','admin','editor'].includes(access.site.role);const manager=['operator','admin'].includes(access.site.role);
 let result;try{result=await shopRequest(bindingID,kind,Number(rawPage));}catch{return <section className="cms-panel shop-load-error"><h1>{i18n.t(names[kind])}</h1><p role="alert">{i18n.t("This area is currently unavailable.")}</p><Link href={'?kind='+kind+'&page='+rawPage}>{i18n.t("Reload")}</Link></section>;}
 return <div className="shop-page"><header className="cms-page-heading"><div><h1>{i18n.t(names[kind])}</h1><p>{i18n.t(descriptions[kind])}</p></div>{!writable&&<span className="shop-status">{i18n.t("Read access")}</span>}</header>
 {kind==='products'&&result.docs.length>0&&<ProductWorkspace bindingID={bindingID} products={result.docs as ShopProduct[]} categoryOptions={result.categoryOptions} tagOptions={result.tagOptions} media={result.mediaChoices} imageOrigin={access.bridge.origin} writable={writable}/>}
 {kind==='settings'&&<SettingsWorkspace bindingID={bindingID} sections={result.sections||[]} media={result.mediaChoices} products={result.productChoices} writable={writable}/>}
 {kind==='customers'&&result.docs.length>0&&<CustomerWorkspace bindingID={bindingID} customers={result.docs as ShopCustomer[]} writable={manager&&!access.readOnly}/>}
 {kind==='orders'&&<section className="cms-panel shop-orders" aria-label={i18n.t("Order overview")}>{(result.docs as ShopOrder[]).map(o=><details className="shop-order" key={o.number}><summary><span><strong>{o.number}</strong><small>{date(o.createdAt, i18n.locale)}</small></span><span className="shop-order-kind">{o.fulfillment==='delivery'?i18n.t("Delivery"):i18n.t("Pickup")}</span><strong>{money(o.total, i18n.locale)}</strong><span className="shop-status">{i18n.t("Simulated")}</span></summary><div className="shop-order-detail"><ul>{o.items.map((item,i)=><li key={i}><span>{item.quantity} × {item.name} {item.variantLabel}</span><span>{money(item.total, i18n.locale)}</span></li>)}</ul><dl><div><dt>{i18n.t("Delivery")}</dt><dd>{money(o.delivery, i18n.locale)}</dd></div><div><dt>{i18n.t("Discount")}</dt><dd>{money(o.discount, i18n.locale)}</dd></div><div><dt>{i18n.t("Total")}</dt><dd><strong>{money(o.total, i18n.locale)}</strong></dd></div></dl></div></details>)}</section>}
 {kind==='media'&&<div className="shop-media-grid">{(result.docs as ShopMedia[]).map(m=><figure className="cms-panel shop-media-card" key={m.id}>{m.url?<img src={m.url} alt={m.alt||i18n.t("Medium")} referrerPolicy="no-referrer" loading="lazy"/>:<div className="shop-media-placeholder">{i18n.t("No preview")}</div>}<figcaption><strong>{m.alt||i18n.t("Image")}</strong><span>#{m.id}</span></figcaption></figure>)}</div>}
 {(result.hasMoreMedia||result.hasMoreProducts)&&<p className="shop-help">{i18n.t("The selection includes up to 100 media files and 500 products. Existing selections are preserved; find more images under Media.")}</p>}
 {kind!=='settings'&&!result.docs.length&&<section className="cms-panel shop-empty-state"><h2>{kind==='products'?i18n.t("No products yet"):kind==='customers'?i18n.t("No customers yet"):kind==='media'?i18n.t("No media yet"):i18n.t("No orders yet")}</h2><p>{kind==='media'?i18n.t("Existing images appear here. Uploading is not available in this view."):i18n.t("Existing entries appear automatically in this overview.")}</p></section>}
 {kind!=='settings'&&(Number(rawPage)>1||result.hasNextPage)&&<nav className="shop-pagination" aria-label={i18n.t("More entries")}>{Number(rawPage)>1?<Link className="button secondary" href={`?kind=${kind}&page=${Number(rawPage)-1}`}>{i18n.t("← Back")}</Link>:<span/>}<span>{i18n.t("Page ")}{rawPage}</span>{result.hasNextPage?<Link className="button secondary" href={`?kind=${kind}&page=${Number(rawPage)+1}`}>{i18n.t("Next →")}</Link>:<span/>}</nav>}
 </div>;
}
