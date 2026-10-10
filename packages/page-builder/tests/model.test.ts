import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvasDocument,createCanvasNode,parseCanvasDocument,safeCanvasURL} from '../src/model.ts';

test('Canvas defaults have independent responsive frames and fresh stable IDs',()=>{
 const doc=createCanvasDocument('A page','a-page'),node=createCanvasNode('text');doc.nodes.push(node);
 assert.deepEqual(parseCanvasDocument(doc),doc);
 assert.equal(doc.artboards.desktop.width,1440);assert.equal(doc.artboards.tablet.width,768);assert.equal(doc.artboards.mobile.width,390);
 assert.notEqual(node.id,createCanvasNode('text').id);
 node.frames.mobile.x=77;assert.notEqual(node.frames.desktop.x,77);
 node.styles.mobile.color='#123';assert.notEqual(node.styles.desktop.color,'#123');
 const parsed=parseCanvasDocument(doc);parsed.nodes[0].frames.mobile.x=80;assert.equal(doc.nodes[0].frames.mobile.x,77,'Parsing detaches mutable nested data');
});
test('Strict model rejects unknown keys, duplicate IDs, invalid versions, colors and geometry',()=>{
 const mutations=[
  (d:any)=>d.schemaVersion=2,(d:any)=>d.script='alert(1)',(d:any)=>d.title='',(d:any)=>d.title='x'.repeat(121),
  (d:any)=>d.slug='../bad',(d:any)=>d.nodes[0].id='bad id',(d:any)=>d.nodes.push(structuredClone(d.nodes[0])),
  (d:any)=>d.nodes[0].frames.desktop.x=Infinity,(d:any)=>d.nodes[0].frames.mobile.width=0,
  (d:any)=>d.nodes[0].frames.mobile.hidden='false',(d:any)=>d.nodes[0].frames.desktop.transform='rotate(1)',
  (d:any)=>d.nodes[0].styles.desktop.background='red;position:fixed',(d:any)=>d.nodes[0].styles.tablet.fontWeight=401.5,
  (d:any)=>d.nodes[0].styles.mobile.fontFamily='url(evil)',(d:any)=>d.nodes[0].styles.mobile.opacity=1.1,
  (d:any)=>d.artboards.desktop.width=1023,(d:any)=>d.artboards.tablet.width=1024,(d:any)=>d.artboards.mobile.width=319,
  (d:any)=>d.artboards.mobile.height=20001,(d:any)=>delete d.nodes[0].alt,(d:any)=>d.nodes[0].text='x'.repeat(8001),
  (d:any)=>d.nodes[0].src='https://a.test/'+ 'x'.repeat(2000),(d:any)=>d.nodes[0].href='javascript:alert(1)',
 ];
 for(const mutate of mutations){const doc=createCanvasDocument();doc.nodes.push(createCanvasNode('text'));mutate(doc);assert.throws(()=>parseCanvasDocument(doc));}
});
test('Slugs use the same canonical form accepted by page lists and public routes',()=>{
 for(const slug of ['-', '-start', 'end-', 'a--b', 'UPPER', 'two words'])assert.throws(()=>parseCanvasDocument({...createCanvasDocument(),slug}),/slug/);
 for(const slug of ['a', '123', 'my-page-2', 'x'.repeat(64)])assert.equal(createCanvasDocument('Page',slug).slug,slug);
});
test('Document limits count UTF-8 bytes and reject excessive nodes and cyclic input',()=>{
 const doc=createCanvasDocument();doc.nodes=Array.from({length:100},()=>createCanvasNode('text'));
 assert.doesNotThrow(()=>parseCanvasDocument(doc));doc.nodes.push(createCanvasNode('box'));assert.throws(()=>parseCanvasDocument(doc));
 doc.nodes=Array.from({length:30},()=>({...createCanvasNode('text'),text:'界'.repeat(6000)}));assert.throws(()=>parseCanvasDocument(doc),/512/);
 const cyclic:any=createCanvasDocument();cyclic.nodes=[cyclic];assert.throws(()=>parseCanvasDocument(cyclic));
});
test('URLs permit only authored safe schemes and origin-local paths',()=>{
 const origin='https://site.example';
 assert.equal(safeCanvasURL('/media/a.png','image',origin),'https://site.example/media/a.png');
 assert.equal(safeCanvasURL('#contact','link',origin),'#contact');
 assert.equal(safeCanvasURL('mailto:hello@example.test','link',origin),'mailto:hello@example.test');
 assert.equal(safeCanvasURL('tel:+491234','link',origin),'tel:+491234');
 assert.equal(safeCanvasURL('https://images.example/a.png','image',origin),'https://images.example/a.png');
 for(const value of ['', '//evil.test/a', '/\\evil.test', 'javascript:alert(1)', 'data:image/svg+xml,<svg/>','http://evil.test','https:evil.test','https:/evil.test','https:///evil.test','https://user:pass@example.test/a','https://example.test/a\\b',' /ok','java\nscript:alert(1)','/%5cevil.test','https://example.test/%0a'])assert.equal(safeCanvasURL(value,'link',origin),null,value);
 for(const value of ['#image','mailto:a@b.test','tel:123'])assert.equal(safeCanvasURL(value,'image',origin),null);
 assert.equal(safeCanvasURL('/asset.png','image','javascript:bad'),null);
});
