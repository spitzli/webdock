import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveLocale,preferenceFromCookie,translator,msgid,gettext,ngettext,pgettext} from '../src/core.ts';

test('Explicit preference wins, system uses weighted supported browser languages and defaults to English',()=>{
 for(const [header,preference,expected] of [
  ['de-DE,de;q=0.9','en','en'],['en-US','de','de'],['fr-FR, de-CH;q=0.8, en;q=0.7','system','de'],
  ['de;q=0.4,en-GB;q=0.9',null,'en'],['en;q=0,de-AT;q=1',undefined,'de'],['de;q=0,en;q=0.7','system','en'],
  ['de;q=bad,en;q=0.8','system','en'],['de;q=2,en;q=0.8','system','en'],['de-DE','invalid','de'],
  ['fr-FR','system','en'],[null,null,'en'],['*','system','en'],
 ] as const)assert.equal(resolveLocale(header,preference),expected,`${header}/${preference}`);
 assert.equal(msgid('A source string'),'A source string');
});
test('Only one valid host cookie sets the preference',()=>{
 assert.equal(preferenceFromCookie('other=x; webdock_locale=de'),'de');
 for(const value of [null,'','webdock_locale=fr','webdock_locale=%64e','webdock_locale="de"','webdock_locale=en; webdock_locale=de','webdock_locale=en; webdock_locale=en'])assert.equal(preferenceFromCookie(value),'system');
 assert.equal(preferenceFromCookie('webdock_locale=system'),'system');
});
test('Gettext translates known messages, falls back to English and interpolates plain text literally',()=>{
 assert.equal(gettext('de','Language'),'Sprache');assert.equal(gettext('en','Language'),'Language');
 assert.equal(gettext('de','Missing source message'),'Missing source message');
 assert.equal(translator('de').t('Hello {name}',{name:'<script>$&</script>'}),'Hello <script>$&</script>');
 assert.equal(translator('de').t('Hello {name}'),'Hello {name}');
 assert.equal(translator('de').t('{count} items',{count:0}),'0 items');
 assert.equal(translator('de').t('{constructor}',{}),'{constructor}');
});
test('Plural/context fallbacks and formats are scoped to each translator',()=>{
 assert.equal(ngettext('en','{count} page','{count} pages',1), '1 page');
 assert.equal(ngettext('de','{count} page','{count} pages',2), '2 pages');
 assert.equal(pgettext('de','language selector','System'),'System');
 const de=translator('de'),en=translator('en');assert.equal(de.number(1234.5),'1.234,5');assert.equal(en.number(1234.5),'1,234.5');assert.notEqual(de.date('2026-10-05T12:00:00Z'),en.date('2026-10-05T12:00:00Z'));
 assert.equal(de.date('2026-10-05T12:00:00Z',{year:'numeric',timeZone:'UTC'}),'2026');
 assert.equal(en.t('Language'),'Language');assert.equal(de.t('Language'),'Sprache');
});
test('Only the error boundary maps legacy aliases and suppresses unknown provider messages',()=>{
 const de=translator('de'),en=translator('en');
 assert.equal(de.t('Speichern fehlgeschlagen.'),'Speichern fehlgeschlagen.');
 assert.equal(en.error('Speichern fehlgeschlagen.'),'Saving failed.');
 assert.equal(de.error('Saving failed. Please try again.'),'Speichern fehlgeschlagen. Bitte erneut versuchen.');
 assert.equal(de.error('postgres://private:credential@example'),de.t('Something went wrong. Please try again.'));
 assert.equal(en.error('private-provider-error','Language'),'Language');
 assert.equal(de.error('private-provider-error','unregistered-fallback'),de.t('Something went wrong. Please try again.'));
});

test('product extras remain distinct from tenant plan allowances',()=>{
 assert.equal(gettext('de','Product extras'),'Extras');
 assert.equal(gettext('de','Extras'),'Zusatzkontingente');
 assert.equal(gettext('en','Product extras'),'Product extras');
});
