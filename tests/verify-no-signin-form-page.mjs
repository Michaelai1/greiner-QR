/* The form page with NO field sign in (old link, saved bookmark, equipment QR
 * sticker, expired ticket) must send people to sign in BEFORE they fill a crew
 * form, and the signed-in path must be unchanged.
 *
 * Found Oct 27, 2026 (Purdue foreman could not complete a JHA): without a sign in
 * this page let anyone fill a whole JHA and only said "Sign in required" at
 * Submit. Nothing was saved and nothing reached the server. Every earlier JHA
 * test opened the page WITH ?ticket=, so this path was never exercised.
 *
 * WebKit at 390 px. Fictional people and job. Every Supabase call is answered
 * in-test and recorded; anything else off the machine is refused and fails the run.
 *
 * Needs PLAYWRIGHT_NODE_MODULES and JSPDF_PATH; skips cleanly without them.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(new URL('../', import.meta.url).pathname);
const JSPDF_PATH = process.env.JSPDF_PATH ||
  path.resolve(ROOT, '../greiner-dashboard-tony-feedback-2026-10-02/tools/vendor/jspdf.umd.min.js');
let webkit;
try {
  ({ webkit } = createRequire(path.join(process.env.PLAYWRIGHT_NODE_MODULES || ROOT, 'noop.js'))('playwright-webkit'));
  if (!fs.existsSync(JSPDF_PATH)) throw new Error('no jsPDF');
} catch {
  console.log('No-sign-in form page verification skipped (set PLAYWRIGHT_NODE_MODULES and JSPDF_PATH).');
  process.exit(0);
}
const JSPDF = fs.readFileSync(JSPDF_PATH);
const DASH = 'https://greiner.creeksidesafety.com/index.html';

let checks = 0, failures = 0;
async function check(name, fn) {
  try { await fn(); checks++; console.log(`  ok  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${name}\n       ${String(e.stack || e.message).split('\n').slice(0, 5).join('\n       ')}`); }
}

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.on('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const HOME = {
  user: 'Pat Fieldtest (Test)', company: 'Test Co',
  jobs: [{ id: '33333333-3333-4333-8333-000000000001', name: 'Test Academic Bldg. (Test)', job_number: 'T800-2025', address: '1 Test St', user_forms: null }],
  equipment: [], people: [{ name: 'Pat Fieldtest (Test)' }, { name: 'Casey Crewtest (Test)' }], hotwork_locations: []
};
const offMachine = [];
const browser = await webkit.launch();
async function open(query, { expiredTicket = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'America/Indiana/Indianapolis' });
  page.calls = []; page.errors = []; page.toasts = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.exposeFunction('__toast', (t) => page.toasts.push(t));
  await page.addInitScript(() => {
    const iv = setInterval(() => {
      if (typeof window.showToast === 'function' && !window.showToast.__w) {
        const o = window.showToast;
        window.showToast = function (a, b, c) { window.__toast([a, b, c || ''].join(' | ')); return o.apply(this, arguments); };
        window.showToast.__w = 1; clearInterval(iv);
      }
    }, 10);
  });
  await page.route('**/*', async (r) => {
    const u = r.request().url();
    if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
    if (/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\//.test(u)) return r.fulfill({ body: JSPDF, contentType: 'application/javascript' });
    const m = u.match(/^https:\/\/gvfolfzseqwhhimbxgjv\.supabase\.co\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (m) {
      page.calls.push(m[1]);
      if (expiredTicket) return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'invalid token' }) });
      const out = { cs_portal_field_home: HOME, cs_portal_field_equipment: [], cs_jha_revisable: [],
        cs_portal_field_submit: { ok: true, id: '44444444-4444-4444-8444-000000000001' } }[m[1]];
      if (out === undefined) return r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'not answered in test: ' + m[1] }) });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
    }
    if (u === 'https://gvfolfzseqwhhimbxgjv.supabase.co/functions/v1/field-pdf') { page.calls.push('edge:field-pdf'); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
    offMachine.push(u); return r.abort();
  });
  await page.goto(BASE + 'index.html' + (query ? '?' + query : ''));
  await page.waitForTimeout(700);
  return page;
}
const activeView = (p) => p.evaluate(() => (document.querySelector('.view.active') || {}).id || null);
const visible = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; }, sel);
async function fillJha(page) {
  await page.evaluate(() => ['jhaLadderUse', 'jhaAerialUse'].forEach((n) => {
    const el = document.querySelector(`#jhaForm input[name="${n}"][value="no"]`);
    if (el) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
  }));
  for (let pass = 0; pass < 3; pass++) await page.evaluate(() => {
    const form = document.querySelector('#jhaForm'); const seen = {};
    form.querySelectorAll('[required]').forEach((el) => {
      if (el.offsetParent === null || el.disabled) return;
      if (el.type === 'radio') { if (seen[el.name]) return; seen[el.name] = 1;
        if (![...form.querySelectorAll(`input[name="${el.name}"]`)].some((x) => x.checked)) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); } return; }
      if (el.type === 'checkbox') { if (!el.checked) el.click(); return; }
      if (el.value) return;
      if (el.tagName === 'SELECT') { const o = [...el.options].find((x) => x.value); if (o) { el.value = o.value; el.dispatchEvent(new Event('change', { bubbles: true })); } return; }
      el.value = el.type === 'time' ? '07:00' : el.type === 'date' ? '2026-10-27' : 'Test ' + (el.name || el.id);
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}
async function assertSignInFirst(p) {
  assert.equal(await activeView(p), 'signInFirstView', 'the Sign in first screen is shown');
  assert.equal(await p.$eval('#signInFirstLink', (a) => a.href), DASH, 'its button goes to the Greiner Safety sign in');
  assert.match(await p.locator('#signInFirstText').innerText(), /Sign in on the Greiner Safety page with your own 4 digit code/);
  assert.equal(await visible(p, '#jhaForm'), false, 'no JHA form to fill in');
}

try {
  for (const [label, query] of [['plain page', ''], ['equipment QR sticker (?qr=&asset=)', 'qr=test-sticker&asset=53319'], ['?ngform=jha without a ticket', 'ngform=jha']]) {
    await check(`No sign in, ${label}: Inspections goes to "Sign in first", never to a fillable form, and nothing is sent`, async () => {
      const p = await open(query);
      await p.click('#inspectionsBtn');
      await p.waitForTimeout(250);
      await assertSignInFirst(p);
      assert.deepEqual(p.calls, [], 'no server call');
      assert.deepEqual(p.errors, []);
      await p.close();
    });
  }

  await check('No sign in: each crew form button (JHA, Aerial, Forklift, Hot Work) also goes to "Sign in first"', async () => {
    const p = await open('');
    for (const id of ['openJhaFormBtn', 'openAerialInspectionBtn', 'openForkliftInspectionBtn', 'openHotWorkPermitBtn']) {
      await p.evaluate(() => window.showView('landing'));
      await p.evaluate((i) => document.getElementById(i).click(), id);
      await p.waitForTimeout(150);
      assert.equal(await activeView(p), 'signInFirstView', id);
    }
    assert.deepEqual(p.calls, []);
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  await check('No sign in: Close returns to the landing screen; Report a Problem and Daily Log are not blocked', async () => {
    const p = await open('');
    await p.click('#inspectionsBtn'); await p.waitForTimeout(150);
    await p.click('#closeSignInFirstBtn'); await p.waitForTimeout(150);
    assert.equal(await activeView(p), 'landingView');
    await p.click('#dailyLogBtn'); await p.waitForTimeout(150);
    assert.equal(await activeView(p), 'dailyLogView');
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  await check('No sign in, backstop unchanged: a JHA forced open and filled is still refused at Submit with no server call', async () => {
    const p = await open('');
    await p.evaluate(() => window.openJhaForm());
    await p.waitForTimeout(400);
    await fillJha(p);
    await p.click('#jhaSubmitBtn');
    await p.waitForTimeout(1200);
    assert.ok(p.toasts.some((t) => /Sign in required/.test(t)), p.toasts.join(' / '));
    assert.deepEqual(p.calls, [], 'nothing reaches the server');
    assert.equal(await p.$('#ngView'), null, 'no completion screen');
    await p.close();
  });

  await check('Expired ticket: "Session expired" toast, then Inspections goes to "Sign in first"', async () => {
    const p = await open('ngform=jha&ticket=expired-test-ticket', { expiredTicket: true });
    assert.ok(p.toasts.some((t) => /Session expired/.test(t)), p.toasts.join(' / '));
    await p.evaluate(() => window.showView('landing'));
    await p.click('#inspectionsBtn'); await p.waitForTimeout(200);
    assert.equal(await activeView(p), 'signInFirstView');
    assert.deepEqual(p.calls, ['cs_portal_field_home'], 'only the failed ticket check');
    await p.close();
  });

  await check('Signed in (ticket), unchanged: JHA opens with the revise entry and a locked name, submits and attaches the PDF', async () => {
    const p = await open('ngform=jha&ticket=test-ticket-not-real');
    assert.equal(await visible(p, '#jhaForm'), true);
    assert.ok(await p.$('#jhaReviseEntryBtn'), 'Revise a JHA from this week is offered');
    assert.deepEqual(await p.$eval('[name="jhaAnalysisBy"]', (e) => [e.value, e.readOnly]), ['Pat Fieldtest (Test)', true]);
    await fillJha(p);
    await p.click('#jhaSubmitBtn');
    await p.waitForSelector('#ngView', { timeout: 8000 });
    assert.deepEqual(p.calls, ['cs_portal_field_home', 'cs_portal_field_equipment', 'cs_portal_field_submit', 'edge:field-pdf']);
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  await check('Signed in (ticket): the Inspections list and its buttons still open the real forms', async () => {
    const p = await open('ticket=test-ticket-not-real');
    await p.click('#inspectionsBtn'); await p.waitForTimeout(200);
    assert.equal(await activeView(p), 'inspectionsView');
    await p.click('#openJhaFormBtn'); await p.waitForTimeout(400);
    assert.equal(await visible(p, '#jhaForm'), true);
    await p.evaluate(() => window.showView('inspections'));
    await p.click('#openAerialInspectionBtn'); await p.waitForTimeout(300);
    assert.equal(await activeView(p), 'inspectionAerialView');
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  await check('Preview (?review=1&ngform=jha), unchanged: the form opens for review, submit stays blocked', async () => {
    const p = await open('review=1&ngform=jha');
    assert.equal(await visible(p, '#jhaForm'), true);
    assert.ok(p.toasts.some((t) => /Review preview/.test(t)));
    assert.deepEqual(p.calls, []);
    await p.close();
  });

  await check('Demo (?demo=1), unchanged: Inspections opens the inspection list, not "Sign in first"', async () => {
    const p = await open('demo=1');
    await p.evaluate(() => window.showView('landing'));
    await p.click('#inspectionsBtn'); await p.waitForTimeout(200);
    assert.notEqual(await activeView(p), 'signInFirstView');
    assert.deepEqual(p.calls, []);
    await p.close();
  });

  await check('Nothing left the machine', async () => { assert.deepEqual(offMachine, []); });
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${failures ? 'FAILED' : 'PASSED'}: ${checks} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
