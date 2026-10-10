import {APIError,type CollectionConfig,type Config} from 'payload';
import {features,staffAccess} from './model.ts';
export * from './model.ts';
export const DemoRequests:CollectionConfig={
 slug:'demo-requests',versions:false,labels:{singular:'Demo-Anfrage',plural:'Demo-Anfragen'},
 admin:{useAsTitle:'feature',defaultColumns:['feature','status','createdAt'],description:'Nur Testanfragen. Keine echte Buchung, Bestellung, Zahlung oder E-Mail.'},
 access:{create:()=>false,read:({req})=>staffAccess(req.user),update:({req})=>staffAccess(req.user,true),delete:({req})=>staffAccess(req.user,true)&&req.user?.role!=='editor'},
 hooks:{beforeChange:[({data,originalDoc,operation})=>{
  if(operation==='create'&&(data.mode!=='demo'||data.status!=='pending'))throw new APIError('Only pending demo requests can be created.',400);
  if(operation==='update'&&originalDoc)for(const key of ['feature','data','site','fingerprint','idempotencyKey','mode'])if(key in data&&JSON.stringify(data[key])!==JSON.stringify(originalDoc[key]))throw new APIError('Submission fields are immutable.',400);
  return data;
 }]},
 fields:[
  {name:'feature',type:'select',required:true,options:[...features],admin:{readOnly:true}},
  {name:'site',type:'text',required:true,admin:{readOnly:true}},
  {name:'mode',type:'select',required:true,options:['demo'],defaultValue:'demo',admin:{readOnly:true}},
  {name:'status',type:'select',required:true,defaultValue:'pending',options:[{label:'Offene Demo-Anfrage',value:'pending'},{label:'Demo geprüft',value:'reviewed'},{label:'Archiviert',value:'archived'}]},
  {name:'data',type:'json',required:true,admin:{readOnly:true}},
  {name:'idempotencyKey',type:'text',required:true,unique:true,index:true,admin:{hidden:true}},
  {name:'fingerprint',type:'text',required:true,admin:{hidden:true}},
  {name:'internalNote',type:'textarea',maxLength:3000,label:'Interne Notiz'},
 ],
};
/** Native Payload plugin; the public app owns its validated submission route. */
export const leadBookings=()=>(config:Config):Config=>({...config,collections:[...(config.collections||[]),DemoRequests]});
