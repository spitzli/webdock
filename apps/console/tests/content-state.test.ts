import test from 'node:test';
import assert from 'node:assert/strict';
import { contentImageURL, initialContentDraft, savedContentDraft, restoreContentDrafts } from '../src/app/(console)/(portal)/sites/[bindingID]/content/content-state';

test('saving one submitted value preserves a newer local draft and advances the conflict timestamp', () => {
  const draft = initialContentDraft({key:'modern_text_001',variant:'modern',kind:'text',label:'Headline',value:'Published',updatedAt:'2026-10-05T10:00:00.000Z'});
  const next = savedContentDraft({...draft,value:'Next edit'},'Submitted edit','2026-10-05T10:01:00.000Z');
  assert.equal(next.value,'Next edit');
  assert.equal(next.savedValue,'Submitted edit');
  assert.equal(next.updatedAt,'2026-10-05T10:01:00.000Z');
  assert.notEqual(next.value,next.savedValue);
});
test('image previews use the public website origin for local paths and reject unsafe URL forms', () => {
  const origin='https://sample.webdock.dev';
  assert.equal(contentImageURL('/images/photo.webp',origin),origin+'/images/photo.webp');
  assert.equal(contentImageURL('https://cdn.example.com/photo.webp',origin),'https://cdn.example.com/photo.webp');
  for(const value of ['//foreign.test/image.jpg','http://foreign.test/image.jpg','javascript:alert(1)','data:image/svg+xml,test','https://user:pass@foreign.test/image.jpg','image.jpg','/\\foreign.test/image.jpg','']) assert.equal(contentImageURL(value,origin),null);
});

test('restoring tab-local edits keeps unsaved text without bypassing version conflicts', () => {
  const current = {text:{value:'Server value',savedValue:'Server value',updatedAt:'2026-10-05T11:00:00.000Z'}};
  const restored = restoreContentDrafts(current,{text:{value:'My unsaved edit',updatedAt:'2026-10-05T10:00:00.000Z'},foreign:{value:'Foreign',updatedAt:'2026-10-05T10:00:00.000Z'}});
  assert.equal(restored.text.value,'My unsaved edit');
  assert.equal(restored.text.savedValue,'Server value');
  assert.equal(restored.text.updatedAt,'2026-10-05T10:00:00.000Z');
  assert.equal(Object.keys(restored).length,1);
  assert.deepEqual(restoreContentDrafts(current,{text:{value:'Server value',updatedAt:'2026-10-05T10:00:00.000Z'}}),current);
  assert.deepEqual(restoreContentDrafts(current,{text:{value:'My edit',updatedAt:'invalid'}}),current);
});
