import test from 'node:test';
import assert from 'node:assert/strict';
import { translator } from '@webdock/i18n';
import { billingProductText } from '@webdock/i18n/billing-products';

test('catalog text follows the selected language and preserves custom product copy', () => {
  const german = 'PostgreSQL eigene Instanz Starter';
  assert.equal(billingProductText(translator('en'), german), 'PostgreSQL Dedicated Starter');
  assert.equal(billingProductText(translator('de'), german), german);
  const description = 'Ein zusätzlicher CMS-Bearbeiter für eine berechtigte Website. Keine Betreuungszeit enthalten.';
  assert.equal(billingProductText(translator('en'), description), 'One additional CMS editor for an eligible website. Support time is not included.');
  assert.equal(billingProductText(translator('de'), description), description);
  for (const locale of ['en', 'de'] as const) {
    for (const custom of ['Custom Enterprise 2027', german + ' – custom terms', '<script>alert(1)</script>', 'constructor']) {
      assert.equal(billingProductText(translator(locale), custom), custom);
    }
  }
});
