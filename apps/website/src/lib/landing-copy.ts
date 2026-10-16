import {landingDefaults} from '../cms/landing';
const legacyOutlook:Record<string,string>={outlookTitle:"Your link today. Your dashboard tomorrow.",outlookDescription:"A dedicated console for your projects is planned. Until then, we’ll take care of things personally."};
const legacyStudioFAQ={question:"Is there a client console yet?",answer:"Not yet. A dedicated console for managing projects is planned for a future release. Until then, Dominik is your direct point of contact."};
/** Only unchanged Webdock defaults are translated; authored copy and content IDs remain intact. */
export function localizeLanding<T extends object>(page:T,t:(message:string)=>string):T{
 const source=page as Record<string,unknown>,out:Record<string,unknown>={...source};
 for(const [key,value] of Object.entries(landingDefaults)){
  if(key==='contactEmail')continue;
  if(typeof value==='string'&&(source[key]===value||(Object.hasOwn(legacyOutlook,key)&&source[key]===legacyOutlook[key])))out[key]=t(value);
 }
 for(const [key,fields] of [['useCases',['title','description']],['faqs',['question','answer']]] as const){
  const rows=source[key];if(!Array.isArray(rows))continue;
  const defaults=landingDefaults[key] as unknown as Record<string,string>[];
  out[key]=rows.map(row=>{if(!row||typeof row!=='object')return row;const copy={...row};if(key==='faqs'&&copy.question===legacyStudioFAQ.question&&copy.answer===legacyStudioFAQ.answer){const current=landingDefaults.faqs[landingDefaults.faqs.length-1];return {...copy,question:t(current.question),answer:t(current.answer)};}for(const field of fields)if(typeof copy[field]==='string'&&defaults.some(d=>d[field]===copy[field]))copy[field]=t(copy[field]);return copy;});
 }
 return out as T;
}
