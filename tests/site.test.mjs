import test from 'node:test';
import assert from 'node:assert/strict';
const origin = process.env.TEST_BASE_URL || 'http://localhost:3101';
test('Landing page serves English content, matching FAQ data and SEO assets', async () => {
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<html[^>]+lang="en"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/webdock.dev"/);
  assert.match(html, /href="https:\/\/spitzli.dev"/);
  assert.match(html, /mailto:dominik@spitzli.dev/);
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
  const data = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  const faq = data['@graph'].find(item => item['@type'] === 'FAQPage');
  assert.equal(faq.mainEntity.length, 6);
  for (const item of faq.mainEntity) {
    assert.ok(html.includes(item.name));
    assert.ok(html.includes(item.acceptedAnswer.text));
  }
  for (const path of ['/robots.txt', '/sitemap.xml', '/icon.svg', '/og.png', '/favicon.ico']) {
    const asset = await fetch(origin + path);
    assert.equal(asset.status, 200, path);
    assert.ok((await asset.arrayBuffer()).byteLength > 30, path);
  }
  assert.match(await (await fetch(origin + '/sitemap.xml')).text(), /https:\/\/webdock.dev/);
});
