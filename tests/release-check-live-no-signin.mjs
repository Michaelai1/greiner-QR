/* Release check, run against the LIVE site after every greiner-QR deploy (and
 * any time a crew member says a form "won't submit"). Read only: every Supabase
 * call is refused before it leaves the machine, so nothing can be created.
 *
 *   node tests/release-check-live-no-signin.mjs [expected-commit]
 *
 * Checks, at 390 px in WebKit:
 *   1. live index.html is byte-identical to the expected commit (default HEAD);
 *   2. with no sign in, plain page and equipment QR style, Inspections shows
 *      "Sign in first" with the Greiner Safety sign in button, and no crew form;
 *   3. the page made no Supabase call and threw no error.
 * The signed-in path is covered by the local suite (it needs a real ticket here).
 * Needs PLAYWRIGHT_NODE_MODULES.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(new URL('../', import.meta.url).pathname);
const LIVE = process.env.LIVE_URL || 'https://michaelai1.github.io/greiner-QR/';
const DASH = 'https://greiner.creeksidesafety.com/index.html';
const commit = process.argv[2] || 'HEAD';
const { webkit } = createRequire(path.join(process.env.PLAYWRIGHT_NODE_MODULES || ROOT, 'noop.js'))('playwright-webkit');

const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const expected = md5(execFileSync('git', ['-C', ROOT, 'show', `${commit}:index.html`]));
const live = md5(Buffer.from(await (await fetch(LIVE + 'index.html?release-check=' + Date.now(), { cache: 'no-store' })).arrayBuffer()));

let failures = 0;
async function check(name, fn) {
  try { await fn(); console.log(`  ok  ${name}`); } catch (e) { failures++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}
await check(`live index.html matches ${commit} (${expected.slice(0, 8)})`, async () => assert.equal(live, expected, `live is ${live.slice(0, 8)}; wait for the cache (10 min) and rerun`));

const browser = await webkit.launch();
for (const [label, query] of [['plain page', ''], ['equipment QR style', '?qr=release-check&asset=release-check']]) {
  await check(`no sign in, ${label}: Inspections shows "Sign in first", no crew form, no server call`, async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const supabase = [], errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route(/supabase\.co/, (r) => { supabase.push(r.request().url()); return r.abort(); });
    await page.goto(LIVE + query, { waitUntil: 'load' });
    await page.waitForTimeout(800);
    await page.click('#inspectionsBtn');
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => (document.querySelector('.view.active') || {}).id), 'signInFirstView');
    assert.equal(await page.$eval('#signInFirstLink', (a) => a.href), DASH);
    assert.equal(await page.evaluate(() => { const f = document.querySelector('#jhaForm'); return !!f && f.offsetParent !== null; }), false);
    assert.deepEqual(supabase, [], 'no Supabase call');
    assert.deepEqual(errors, [], 'no page error');
    await page.close();
  });
}
await browser.close();
console.log(`\n${failures ? 'FAILED' : 'PASSED'} release check against ${LIVE}`);
process.exit(failures ? 1 : 0);
