import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvasDocument,createCanvasNode} from '../src/model.ts';
import {renderCanvasHTML,renderCanvasFragment} from '../src/render.ts';
const origin='https://site.example';
test('Renderer escapes transient authored content and makes unsafe URLs inert',()=>{
 const doc=createCanvasDocument('</title><script>alert(1)</script>','test');
 const text=createCanvasNode('text');text.text='<img src=x onerror="evil()">\nUnsaved & current';
 const button=createCanvasNode('button');button.text='Click <script>evil()</script>';button.href='javascript:alert(1)';
 const image=createCanvasNode('image');image.src='data:image/svg+xml,<svg onload=evil()>';image.alt='" onerror="evil()';
 doc.nodes=[text,button,image];
 const html=renderCanvasHTML(doc,{origin,favicon:'javascript:alert(1)'});
 assert.ok(html.includes('&lt;img src=x onerror=&quot;evil()&quot;&gt;\nUnsaved &amp; current'));
 assert.ok(html.includes('&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;'));
 assert.equal(html.includes('<script'),false);assert.equal(html.includes('src="data:'),false);assert.equal(html.includes('href="javascript:'),false);
 assert.ok(html.includes('<html lang="de">'));assert.ok(html.includes('aria-disabled="true"'));assert.ok(html.includes('name="robots" content="noindex,nofollow"'));
 assert.equal(html.includes('rel="icon"'),false);
});
test('Forced editor and responsive public output share geometry, scaling and layer order',()=>{
 const doc=createCanvasDocument();const first=createCanvasNode('text'),second=createCanvasNode('box');
 first.frames.mobile={x:39,y:100,width:195,height:50,hidden:false};first.styles.mobile.fontSize=39;doc.nodes=[first,second];
 const forced=renderCanvasFragment(doc,{origin,breakpoint:'mobile',interactive:false});
 assert.equal((forced.match(/<section /g)||[]).length,1);
 assert.ok(forced.includes('aspect-ratio:390/1000'));assert.ok(forced.includes('left:10%'));assert.ok(forced.includes('top:10%'));assert.ok(forced.includes('width:50%'));assert.ok(forced.includes('font-size:10cqw'));
 assert.ok(forced.indexOf(`data-canvas-node="${first.id}"`)<forced.indexOf(`data-canvas-node="${second.id}"`));
 const publicHTML=renderCanvasFragment(doc,{origin});assert.equal((publicHTML.match(/<section /g)||[]).length,3);
 assert.ok(publicHTML.includes('@media(min-width:768px)'));assert.ok(publicHTML.includes('@media(min-width:1024px)'));
 assert.ok(publicHTML.includes('font-size:10cqw'));assert.equal(forced.includes('body{'),false);
});
test('Preview never navigates; public safe links and origin-resolved images remain usable',()=>{
 const doc=createCanvasDocument();const button=createCanvasNode('button'),image=createCanvasNode('image');button.href='/contact';image.src='/media/photo.webp';image.alt='Product';doc.nodes=[button,image];
 const live=renderCanvasFragment(doc,{origin,breakpoint:'desktop'}),preview=renderCanvasFragment(doc,{origin,breakpoint:'desktop',interactive:false});
 assert.ok(live.includes('href="https://site.example/contact"'));assert.equal(preview.includes('href='),false);
 assert.ok(preview.includes('src="https://site.example/media/photo.webp"'));assert.equal(preview.includes('<script'),false);
 doc.nodes[0].text='Unsaved latest value';assert.ok(renderCanvasFragment(doc,{origin,breakpoint:'mobile'}).includes('Unsaved latest value'));
 image.frames.mobile.hidden=true;assert.equal(renderCanvasFragment(doc,{origin,breakpoint:'mobile'}).includes(`data-canvas-node="${image.id}"`),false);
 const full=renderCanvasHTML(doc,{origin,favicon:'/icon.png'});assert.ok(full.includes('href="https://site.example/icon.png"'));
});
test('Transient CSS injection and invalid numbers fail before HTML is emitted',()=>{
 const doc=createCanvasDocument();doc.nodes=[createCanvasNode('box')];
 doc.nodes[0].styles.desktop.color='";background:url(javascript:evil())';assert.throws(()=>renderCanvasFragment(doc,{origin}));
 doc.nodes[0].styles.desktop.color='#fff';doc.nodes[0].frames.desktop.width=NaN;assert.throws(()=>renderCanvasHTML(doc,{origin}));
});
