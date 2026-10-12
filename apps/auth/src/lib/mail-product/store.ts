import type { PoolClient } from 'pg';
import { database } from '../db';
import {remainingMailTime} from './deadline';
/** Destroy an expired job connection so no abandoned statement can commit later. */
async function withClient<T>(run:(db:PoolClient)=>Promise<T>):Promise<T>{
 const remaining=remainingMailTime();
 if(remaining===undefined){const db=await database.connect();try{return await run(db);}finally{db.release();}}
 if(remaining<1)throw Error('Mail job deadline reached');
 let expired=false,released=false,db:PoolClient|undefined;
 let rejectDeadline:(reason:Error)=>void=()=>{};
 const timeout=new Promise<never>((_,reject)=>{rejectDeadline=reject;});
 const timer=setTimeout(()=>{
  expired=true;if(db&&!released){released=true;db.release(true);}rejectDeadline(Error('Mail job deadline reached'));
 },remaining);
 const work=(async()=>{
  const acquired=await database.connect();
  if(expired){acquired.release(true);throw Error('Mail job deadline reached');}
  db=acquired;
  try {
  // PostgreSQL also bounds the statement if transport cancellation is delayed.
  await db.query("SELECT set_config('statement_timeout',$1,false)",[String(Math.max(1,remainingMailTime()??remaining))]);
  const guarded=new Proxy(db,{get(target,property){
   if(property==='query')return (...args:unknown[])=>{if(expired||(remainingMailTime()??1)<1)return Promise.reject(Error('Mail job deadline reached'));return Reflect.apply(target.query,target,args);};
   const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
  }});
  return await run(guarded);
  }finally{
   // Successful queries can reuse their connection; expired/uncertain sessions are destroyed.
   if(!released){
    let destroy=false;try{await db.query('RESET statement_timeout');}catch{destroy=true;}
    if(!released){released=true;db.release(destroy);}
   }
  }
 })();
 try{return await Promise.race([work,timeout]);}finally{clearTimeout(timer);}
}
/** Non-job callers retain ordinary pool semantics; all job SQL shares the absolute budget. */
export const mailDatabase=new Proxy(database,{get(target,property){
 if(property==='query')return (...args:unknown[])=>remainingMailTime()===undefined?Reflect.apply(target.query,target,args):withClient(db=>Reflect.apply(db.query,db,args));
 const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
}});
export async function withMailTransaction<T>(run:(db:PoolClient)=>Promise<T>):Promise<T>{
 return withClient(async db=>{
  try{await db.query('BEGIN');const result=await run(db);await db.query('COMMIT');return result;}
  catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
 });
}
