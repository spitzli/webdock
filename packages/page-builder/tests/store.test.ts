import test from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {CanvasStore,CanvasError} from '../src/store.ts';
import {createCanvasDocument} from '../src/model.ts';
const connection=process.env.CANVAS_TEST_DATABASE_URL;
test('real PostgreSQL: revision races, publication isolation, atomic homepage and tenant schema separation',{skip:!connection},async()=>{
 const url=new URL(connection!);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Only disposable local databases are allowed');
 const pool=new Pool({connectionString:connection,max:6});const suffix=randomBytes(6).toString('hex');const schemas=['canvas_test_a_'+suffix,'canvas_test_b_'+suffix];
 const q=(s:string)=>'"'+s+'"';const sql=(await readFile(new URL('../../../../webdock-demos/template/src/migrations/20261005_230000_canvas.ts',import.meta.url),'utf8')).split('await db.execute(sql`')[1].split('`);')[0];
 const conflict=(e:unknown)=>e instanceof CanvasError&&e.status===409;
 try{
  for(const schema of schemas){await pool.query(`CREATE SCHEMA ${q(schema)};CREATE TABLE ${q(schema)}.payload_locked_documents_rels(id serial PRIMARY KEY);`);await pool.query(sql.replaceAll('${schema()}',q(schema)));}
  const a=new CanvasStore({schema:schemas[0],nativePath:'/original',pool}),b=new CanvasStore({schema:schemas[1],nativePath:'/shop',pool});
  assert.equal((await a.list()).homePageID,null);assert.deepEqual((await b.list()).pages,[]);
  const initial=await a.create(createCanvasDocument('Original draft','initial-slug'),'actor-a');assert.equal(initial.draftRevision,1);assert.equal(await a.publishedBySlug('initial-slug'),null);assert.equal(await a.activePublished(),null);
  await assert.rejects(b.get(initial.id),(e:unknown)=>e instanceof CanvasError&&e.status===404);
  const other=await b.create(createCanvasDocument('Different tenant','initial-slug'),'actor-b');assert.equal(other.id,initial.id);assert.equal((await a.get(initial.id)).draft.title,'Original draft');assert.equal((await b.get(other.id)).draft.title,'Different tenant');
  const races=await Promise.allSettled([a.save(initial.id,1,{...initial.draft,title:'First edit'},'actor-a'),a.save(initial.id,1,{...initial.draft,title:'Second edit'},'actor-a')]);assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal(races.filter(r=>r.status==='rejected'&&conflict(r.reason)).length,1);
  const saved=await a.get(initial.id);assert.equal(saved.draftRevision,2);await assert.rejects(a.homepage(saved.id,saved.draftRevision,'actor-a'),conflict);
  const published=await a.publish(saved.id,saved.draftRevision,'publisher-a');assert.equal(published.draftRevision,3);assert.equal(published.publishedRevision,3);assert.equal((await a.list()).homePageID,null);assert.equal((await a.publishedBySlug('initial-slug'))?.title,saved.draft.title);
  await assert.rejects(a.publish(saved.id,saved.draftRevision,'publisher-a'),conflict);
  await a.homepage(published.id,published.draftRevision,'actor-a');assert.equal((await a.activePublished())?.title,saved.draft.title);
  const draftChanged=await a.save(published.id,published.draftRevision,{...published.draft,title:'Unpublished changes',slug:'renamed-slug'},'actor-a');assert.equal((await a.publishedBySlug('initial-slug'))?.title,saved.draft.title);assert.equal(await a.publishedBySlug('renamed-slug'),null);assert.equal((await a.activePublished())?.title,saved.draft.title);
  await assert.rejects(a.homepage(draftChanged.id,draftChanged.draftRevision,'actor-a'),conflict);
  const collision=await a.create(createCanvasDocument('Conflicting URL','initial-slug'),'actor-a');await assert.rejects(a.publish(collision.id,collision.draftRevision,'publisher-a'),conflict);assert.equal((await a.get(collision.id)).draftRevision,1);
  const renamed=await a.publish(draftChanged.id,draftChanged.draftRevision,'publisher-a');assert.equal(await a.publishedBySlug('initial-slug'),null);assert.equal((await a.publishedBySlug('renamed-slug'))?.title,'Unpublished changes');assert.equal((await a.activePublished())?.slug,'renamed-slug');
  const unpublished=await a.unpublish(renamed.id,renamed.draftRevision,'actor-a');assert.equal(unpublished.published,null);assert.equal(unpublished.publishedRevision,null);assert.equal(await a.publishedBySlug('renamed-slug'),null);assert.equal(await a.activePublished(),null);assert.equal((await a.list()).homePageID,null);await assert.rejects(a.unpublish(renamed.id,renamed.draftRevision,'actor-a'),conflict);
  const audit=await pool.query(`SELECT updated_by,published_by FROM ${q(schemas[0])}.site_pages WHERE id=$1`,[initial.id]);assert.deepEqual(audit.rows[0],{updated_by:'actor-a',published_by:'publisher-a'});
  const draft=createCanvasDocument('Quota page','quota');await pool.query(`INSERT INTO ${q(schemas[1])}.site_pages(draft,revision,updated_by) SELECT $1::jsonb,1,'quota-test' FROM generate_series(1,99)`,[JSON.stringify(draft)]);assert.equal((await b.list()).pages.length,100);await assert.rejects(b.create(draft,'actor-b'),conflict);
  assert.throws(()=>new CanvasStore({schema:'unsafe"schema',nativePath:'/shop',pool}));
 }finally{for(const schema of schemas)await pool.query(`DROP SCHEMA IF EXISTS ${q(schema)} CASCADE`);await pool.end();}
});
