import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { themeScript } from '../src/lib/theme.ts';

test('Theme bootstrap restores only explicit preferences and tolerates blocked storage', () => {
  for (const saved of [null, 'system', 'light', 'dark', 'invalid']) {
    const dataset = {};
    vm.runInNewContext(themeScript, { localStorage: { getItem: () => saved }, document: { documentElement: { dataset } } });
    assert.equal(dataset.theme, ['light', 'dark'].includes(saved) ? saved : undefined);
  }
  assert.doesNotThrow(() => vm.runInNewContext(themeScript, { localStorage: { getItem() { throw Error('blocked'); } } }));
});
