import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PathnameContext, SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { I18nProvider } from '@webdock/i18n/react';
import { MailNavigation } from '../src/components/mail/mail-navigation';
import { TenantNavigation } from '../src/components/navigation';
import { AreaNavigation } from '../src/components/area-navigation';

function render(path: string, element: ReturnType<typeof h>, query = '') {
  return renderToStaticMarkup(h(I18nProvider, {locale:'en',preference:'en'}, h(PathnameContext.Provider,{value:path},h(SearchParamsContext.Provider,{value:new URLSearchParams(query)},element))));
}
test('Mail uses one area group and highlights only the current sending tool', () => {
  const html = render('/tenants/12/mail/emails/42', h(MailNavigation,{customerID:'12',canManage:true}), 'connection=34');
  assert.equal((html.match(/class="area-navigation"/g)||[]).length,1);
  assert.equal((html.match(/aria-current="page"/g)||[]).length,2); // Desktop and mobile render the same selected destination.
  assert.match(html,/href="\/tenants\/12\/mail\/emails\?connection=34"/);
  assert.match(html,/area-link-nested/);
  assert.doesNotMatch(html,/Sending tools/);
});
test('Mail hides administration tools from members without losing inbox and domains', () => {
  const html=render('/tenants/12/mail/emails',h(MailNavigation,{customerID:'12',canManage:false}));
  assert.doesNotMatch(html,/\/api-keys|\/webhooks|\/suppressions|\/settings|\/tracking/);
  assert.match(html,/\/mailboxes/);assert.match(html,/\/domains/);
});
test('workspace navigation preserves database, billing and preview access rules', () => {
  const html=render('/tenants/12',h(TenantNavigation,{customerID:'12',canManage:true}));
  assert.match(html,/\/databases/);assert.match(html,/\/billing/);assert.match(html,/\/team/);
  const preview=render('/tenants/12',h(TenantNavigation,{customerID:'12',canManage:false,preview:true}));
  assert.match(preview,/\/managed-databases/);assert.doesNotMatch(preview,/\/mail|\/billing|\/team/);
});
test('website sections retain their exact query selection in the sidebar',()=>{
  const html=render('/sites/12/shop',h(AreaNavigation,{links:[{href:'/sites/12/shop?kind=products',label:'Products',exact:true},{href:'/sites/12/shop?kind=orders',label:'Orders',exact:true}]}),'kind=orders');
  assert.equal((html.match(/aria-current="page"/g)||[]).length,2);
  assert.doesNotMatch(html,/href="\/sites\/12\/shop\?kind=products"[^>]*aria-current/);
});
