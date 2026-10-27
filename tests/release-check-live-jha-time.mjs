/* Release check, run against the LIVE site after a greiner-QR deploy that touches
 * the JHA form. Read only: the JHA opens in review mode (?review=1, Submit is
 * blocked) and every Supabase call is refused before it leaves the machine, so
 * nothing can be created.
 *
 *   node tests/release-check-live-jha-time.mjs [expected-commit]
 *
 * Checks:
 *   1. live index.html is byte-identical to the expected commit (default HEAD);
 *   2. Android phone (Chromium with Clark's Chrome 154 identity, 412 px): Start
 *      Time and Estimated Time of Completion are lists on the page; picking
 *      7 :00 AM and 3 :30 PM fills 07:00 and 15:30 and says "Set to";
 *   3. computer (Windows Chrome) and iPhone (WebKit): the time fields themselves,
 *      no lists;
 *   4. no Supabase call and no page error anywhere.
 * Needs PLAYWRIGHT_NODE_MODULES (playwright-webkit) and PLAYWRIGHT_CHROMIUM_NODE_MODULES.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(new URL('../', import.meta.url).pathname);
const LIVE = process.env.LIVE_URL || 'https://michaelai1.github.io/greiner-QR/';
const commit = process.argv[2] || 'HEAD';
const { webkit } = createRequire(path.join(process.env.PLAYWRIGHT_NODE_MODULES || ROOT, 'noop.js'))('playwright-webkit');
const { chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CHROMIUM_NODE_MODULES || process.env.PLAYWRIGHT_NODE_MODULES || ROOT, 'noop.js'))('playwright-core');

const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const expected = md5(execFileSync('git', ['-C', ROOT, 'show', `${commit}:index.html`]));
const live = md5(Buffer.from(await (await fetch(LIVE + 'index.html?release-check=' + Date.now(), { cache: 'no-store' })).arrayBuffer()));

let failures = 0;
async function check(name, fn) {
  try { await fn(); console.log(`  ok  ${name}`); } catch (e) { failures++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}
await check(`live index.html matches ${commit} (${expected.slice(0, 8)})`, async () => assert.equal(live, expected, `live is ${live.slice(0, 8)}; wait for the cache (10 min) and rerun`));

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36';
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';
const cr = await chromium.launch();
const wk = await webkit.launch();
async function open(ctxPromise) {
  const ctx = await ctxPromise;
  const page = await ctx.newPage();
  page.supabase = []; page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.route(/supabase\.co/, (r) => { page.supabase.push(r.request().url()); return r.abort(); });
  await page.goto(LIVE + '?review=1&ngform=jha', { waitUntil: 'load' });
  await page.waitForTimeout(900);
  page.done = async () => {
    assert.deepEqual(page.supabase, [], 'no Supabase call');
    assert.deepEqual(page.errors, [], 'no page error');
    await ctx.close();
  };
  return page;
}

await check('Android phone: both JHA times are lists; 7 :00 AM and 3 :30 PM fill 07:00 and 15:30', async () => {
  const p = await open(cr.newContext({ userAgent: ANDROID_UA, viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true }));
  for (const [id, h, m, ap, want, said] of [['jhaStartTime', '7', '00', 'AM', '07:00', '7:00 AM'], ['jhaCompleteTime', '3', '30', 'PM', '15:30', '3:30 PM']]) {
    assert.equal(await p.$$eval(`#${id}Pick select`, (ss) => ss.filter((s) => s.offsetParent !== null).length), 3, `${id}: three lists shown`);
    assert.equal(await p.$eval('#' + id, (e) => e.offsetParent !== null), false, `${id}: time field hidden`);
    await p.selectOption(`#${id}Pick select[data-time-part="hour"]`, h);
    await p.selectOption(`#${id}Pick select[data-time-part="minute"]`, m);
    await p.selectOption(`#${id}Pick select[data-time-part="ampm"]`, ap);
    assert.equal(await p.$eval('#' + id, (e) => e.value), want);
    assert.equal(await p.locator(`#${id}Set`).innerText(), '✓ Set to ' + said);
  }
  await p.done();
});
await check('Computer (Windows Chrome): the time fields themselves, no lists', async () => {
  const p = await open(cr.newContext({ userAgent: WINDOWS_UA, viewport: { width: 1280, height: 900 } }));
  assert.equal(await p.$('#jhaStartTimePick'), null);
  assert.deepEqual(await p.$eval('#jhaStartTime', (e) => [e.type, e.offsetParent !== null]), ['time', true]);
  await p.done();
});
await check('iPhone (WebKit): the time fields themselves, no lists', async () => {
  const p = await open(wk.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }));
  assert.equal(await p.$('#jhaStartTimePick'), null);
  assert.deepEqual(await p.$eval('#jhaStartTime', (e) => [e.type, e.offsetParent !== null]), ['time', true]);
  await p.done();
});
await cr.close();
await wk.close();
console.log(`\n${failures ? 'FAILED' : 'PASSED'} release check against ${LIVE}`);
process.exit(failures ? 1 : 0);
