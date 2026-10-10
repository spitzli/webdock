import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {I18nProvider,useI18n} from '../src/react.tsx';
function Label(){const {t,locale,preference}=useI18n();return createElement('span',{'data-locale':locale,'data-preference':preference},t('Language'));}
test('Provider uses server-selected locale without leaking state between renders',()=>{
 const render=(locale:'en'|'de',preference:'system'|'en'|'de')=>renderToStaticMarkup(createElement(I18nProvider,{locale,preference},createElement(Label)));
 assert.match(render('de','system'),/data-locale="de" data-preference="system">Sprache/);
 assert.match(render('en','en'),/data-locale="en" data-preference="en">Language/);
 assert.throws(()=>renderToStaticMarkup(createElement(Label)),/I18nProvider/);
});
