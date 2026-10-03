import assert from 'node:assert/strict';
import test from 'node:test';
import type { CollectionBeforeValidateHook } from 'payload';
import { modelScope } from '../src/cms/collection-scope';

test('Lexical links and uploads cannot refer to another site or unscoped user data', async () => {
 const collection=modelScope({slug:'test-content',fields:[{name:'content',type:'richText'}]},'pages');
 const hook=collection.hooks!.beforeValidate!.at(-1)!;
 const run=(target:object)=>hook({data:{site:1,content:{root:{children:[{type:'link',fields:{doc:{relationTo:'media',value:7}}}]}}},req:{payload:{collections:{media:{}},findByID:async({collection}:{collection:string})=>collection==='sites'?{id:1,model:'business'}:target}}} as unknown as Parameters<CollectionBeforeValidateHook>[0]);
 await assert.rejects(run({id:7,site:2}),/same site/);
 await assert.rejects(run({id:7,email:'private@example.com'}),/same site/);
 assert.ok(await run({id:7,site:1}));
});
