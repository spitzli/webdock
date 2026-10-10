import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateRequest, RequestError, saveRequest, staffAccess} from '../src/model.ts';
const request = {feature:'appointment',idempotencyKey:'a94fc1ab-8421-43a8-8571-432e874e9c73',data:{name:'Demo Person',date:'2030-12-20',time:'14:30',email:'demo@example.test'}};
test('only enabled features and known bounded fields; dates are real calendar dates',()=>{
 assert.equal(validateRequest(request,['appointment']).feature,'appointment');
 for(const bad of [{...request,feature:'reservation'},{...request,mode:'live'},{...request,data:{status:'confirmed'}},{...request,data:{date:'2030-02-30'}},{...request,data:{time:'24:10'}},{...request,data:{message:'x'.repeat(2001)}},{...request,data:{people:0}},{...request,data:{email:'broken'}}]) assert.throws(()=>validateRequest(bad,['appointment']),RequestError);
});
test('anonymous and foreign identities cannot inspect or update requests',()=>{
 assert.equal(staffAccess(null),false); assert.equal(staffAccess({collection:'shop-customers',role:'admin'}),false); assert.equal(staffAccess({collection:'users',role:'reader'}),true); assert.equal(staffAccess({collection:'users',role:'reader'},true),false); assert.equal(staffAccess({collection:'users',role:'admin'},true),true);
});
test('durable retry returns same receipt, conflict rejects, race recovers unique winner',async()=>{
 let stored:any; let creates=0;
 const store={find:async()=>stored,create:async(data:any)=>{creates++;stored={id:42,...data};return stored;}};
 const input=validateRequest(request,['appointment']);
 assert.equal((await saveRequest(store,input,'site-a')).replayed,false);
 assert.equal((await saveRequest(store,input,'site-a')).replayed,true);assert.equal(creates,1);assert.equal(stored.mode,'demo');assert.equal(stored.status,'pending');
 await assert.rejects(()=>saveRequest(store,validateRequest({...request,data:{...request.data,name:'Changed'}},['appointment']),'site-a'),(e:any)=>e.status===409);
 let reads=0; const race={find:async()=>++reads===1?undefined:stored,create:async()=>{throw Error('unique key');}};
 assert.equal((await saveRequest(race,input,'site-a')).replayed,true);
});
test('required fields and future dates match booking semantics',()=>{
 for(const data of [{name:'Demo'}, {...request.data,name:''},{...request.data,date:'2020-01-01'}])assert.throws(()=>validateRequest({...request,data},['appointment']),RequestError);
 assert.throws(()=>validateRequest({...request,feature:'reservation'},['reservation']),RequestError);
 assert.equal(validateRequest({...request,feature:'reservation',data:{...request.data,people:2}},['reservation']).data.people,2);
 assert.throws(()=>validateRequest({...request,feature:'voucher',data:{name:'Demo',amount:1001}},['voucher']),RequestError);
});
