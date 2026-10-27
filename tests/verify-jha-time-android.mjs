/* JHA Start Time and Estimated Time of Completion on an Android phone.
 *
 * Found Oct 27, 2026 (Tony's video; Clark's phone the same morning): Android's
 * own clock dialog saves a time only through its OK button. On their phones
 * that button didn't show, so closing the dialog left the field blank and
 * Submit stopped on "Please fill out this field." Not one JHA had ever been
 * filed from an Android phone. Every earlier JHA test set the time field's
 * value directly in WebKit, so the Android path was never exercised.
 *
 * Android = Chromium with Clark's real browser identity (Android 10; K,
 * Chrome/154) at 412 px with touch, plus Samsung Internet's identity. Headless
 * Chromium cannot draw Android's clock dialog, so this asserts what removes the
 * dependency on it: on Android both times are picked from lists on the page, and
 * the lists fill the same HH:MM value. Desktop (Windows Chrome) and iPhone
 * (WebKit) must be unchanged: the time field itself, the same saved values, the
 * same PDF.
 *
 * Fictional people and job. Every Supabase call is answered in-test and
 * recorded; anything else off the machine is refused and fails the run.
 *
 * Needs PLAYWRIGHT_NODE_MODULES (playwright-webkit), PLAYWRIGHT_CHROMIUM_NODE_MODULES
 * (playwright-core with its Chromium installed) and JSPDF_PATH; skips cleanly
 * without them. SCREENSHOT_DIR saves screenshots.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(new URL('../', import.meta.url).pathname);
const JSPDF_PATH = process.env.JSPDF_PATH ||
  path.resolve(ROOT, '../greiner-dashboard-tony-feedback-2026-10-02/tools/vendor/jspdf.umd.min.js');
let webkit, chromium;
try {
  ({ webkit } = createRequire(path.join(process.env.PLAYWRIGHT_NODE_MODULES || ROOT, 'noop.js'))('playwright-webkit'));
  ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CHROMIUM_NODE_MODULES || process.env.PLAYWRIGHT_NODE_MODULES || ROOT, 'noop.js'))('playwright-core'));
  if (!fs.existsSync(JSPDF_PATH)) throw new Error('no jsPDF');
} catch {
  console.log('JHA time on Android verification skipped (set PLAYWRIGHT_NODE_MODULES, PLAYWRIGHT_CHROMIUM_NODE_MODULES and JSPDF_PATH).');
  process.exit(0);
}
const JSPDF = fs.readFileSync(JSPDF_PATH);
const SHOTS = process.env.SCREENSHOT_DIR || null;

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

/* ---------------- the server, as this test plays it ---------------- */
const JOB = '33333333-3333-4333-8333-000000000001';
const USER = 'Pat Fieldtest (Test)';
const ORIGINAL = '11111111-1111-4111-8111-000000000001';
const HOUR = 3600e3;
let HEAD_FIELDS = null;   // a real new JHA's fields (captured below), with the head's own times
let seq = 0;
const RPC = {
  cs_portal_field_home: () => ({ user: USER, company: 'Test Co',
    jobs: [{ id: JOB, name: 'Test Academic Bldg. (Test)', job_number: 'T800-2025', address: '1 Test St', user_forms: null }],
    equipment: [], people: [{ name: USER }, { name: 'Casey Crewtest (Test)' }], hotwork_locations: [] }),
  cs_portal_field_equipment: () => [],
  cs_jha_revisable: () => [{ id: ORIGINAL, submitted_at: new Date(Date.now() - 2 * HOUR).toISOString(), inspector_name: USER,
    head_revision: 0, deadline_at: new Date(Date.now() + 48 * HOUR).toISOString(), window_open: true }],
  cs_jha_current: () => ({ original: { id: ORIGINAL, submitted_at: new Date(Date.now() - 2 * HOUR).toISOString(), inspector_name: USER, fields: HEAD_FIELDS },
    head: null, deadline_at: new Date(Date.now() + 48 * HOUR).toISOString(), window_open: true, window_reason: 'open' }),
  cs_jha_revise: () => ({ ok: true, revision_id: `22222222-2222-4222-8222-${String(++seq).padStart(12, '0')}`, revision_number: 1,
    deadline_at: new Date(Date.now() + 48 * HOUR).toISOString(), submitted_at: new Date().toISOString() }),
  cs_jha_revision_attach_pdf: () => ({ ok: true }),
  cs_portal_field_submit: () => ({ ok: true, id: `44444444-4444-4444-8444-${String(++seq).padStart(12, '0')}` })
};

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36';
const SAMSUNG_UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/30.0 Chrome/138.0.0.0 Mobile Safari/537.36';
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';
const offMachine = [];
const cr = await chromium.launch();
const wk = await webkit.launch();
const PROFILES = {
  android: () => cr.newContext({ userAgent: ANDROID_UA, viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, timezoneId: 'America/Indiana/Indianapolis' }),
  samsung: () => cr.newContext({ userAgent: SAMSUNG_UA, viewport: { width: 384, height: 854 }, deviceScaleFactor: 2.8125, isMobile: true, hasTouch: true, timezoneId: 'America/Indiana/Indianapolis' }),
  desktop: () => cr.newContext({ userAgent: WINDOWS_UA, viewport: { width: 1280, height: 900 }, timezoneId: 'America/Indiana/Indianapolis' }),
  iphone: () => wk.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'America/Indiana/Indianapolis' })
};
async function open(profile, query = 'ngform=jha&ticket=test-ticket-not-real') {
  const ctx = await PROFILES[profile]();
  const page = await ctx.newPage();
  page.calls = []; page.errors = []; page.pdfs = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.route('**/*', async (r) => {
    const u = r.request().url();
    if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
    if (/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\//.test(u)) return r.fulfill({ body: JSPDF, contentType: 'application/javascript' });
    const m = u.match(/^https:\/\/gvfolfzseqwhhimbxgjv\.supabase\.co\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (m) {
      const body = JSON.parse(r.request().postData() || '{}');
      page.calls.push({ fn: m[1], body });
      const f = RPC[m[1]];
      if (!f) return r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'not answered in test: ' + m[1] }) });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f(body)) });
    }
    if (u === 'https://gvfolfzseqwhhimbxgjv.supabase.co/functions/v1/field-pdf') {
      const body = JSON.parse(r.request().postData() || '{}');
      page.calls.push({ fn: 'edge:' + body.action, body: { id: body.id } });
      if (body.action === 'upload') page.pdfs.push(Buffer.from(body.pdf_base64 || '', 'base64').toString('latin1').replace(/\\([()\\])/g, '$1'));
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
    offMachine.push(u); return r.abort();
  });
  await page.goto(BASE + 'index.html?' + query);
  await page.waitForTimeout(700);
  page.done = async () => { assert.deepEqual(page.errors, [], 'no page errors'); await ctx.close(); };
  return page;
}
const fns = (p) => p.calls.map((c) => c.fn);
const call = (p, fn) => p.calls.filter((c) => c.fn === fn).pop();
const value = (p, id) => p.$eval('#' + id, (e) => e.value);
const shown = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; }, sel);
async function shot(p, name, sel) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  if (sel) await p.$eval(sel, (e) => e.scrollIntoView({ block: 'center' })).catch(() => {});
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(SHOTS, name + '.png') });
}
// What a foreman picks from the lists on an Android phone.
async function pickTime(p, id, hour, minute, ampm) {
  await p.selectOption(`#${id}Pick select[data-time-part="hour"]`, hour);
  await p.selectOption(`#${id}Pick select[data-time-part="minute"]`, minute);
  await p.selectOption(`#${id}Pick select[data-time-part="ampm"]`, ampm);
}
const lists = (p, id) => p.$$eval(`#${id}Pick select`, (ss) => ss.map((s) => s.value));
const note = (p, id) => p.locator(`#${id}Set`).innerText();
// The time field itself, as a computer or an iPhone sets it.
async function typeTime(p, id, v) {
  await p.$eval('#' + id, (e, x) => { e.value = x; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
}
async function fillRest(p) {
  await p.evaluate(() => ['jhaLadderUse', 'jhaAerialUse'].forEach((n) => {
    const el = document.querySelector(`#jhaForm input[name="${n}"][value="no"]`);
    if (el && !document.querySelector(`#jhaForm input[name="${n}"]:checked`)) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
  }));
  for (let pass = 0; pass < 3; pass++) await p.evaluate(() => {
    const form = document.querySelector('#jhaForm'); const seen = {};
    form.querySelectorAll('[required]').forEach((el) => {
      if (el.offsetParent === null || el.disabled || el.type === 'time' || el.closest('.jha-time-pick')) return;
      if (el.type === 'radio') { if (seen[el.name]) return; seen[el.name] = 1;
        if (![...form.querySelectorAll(`input[name="${el.name}"]`)].some((x) => x.checked)) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); } return; }
      if (el.type === 'checkbox') { if (!el.checked) el.click(); return; }
      if (el.value) return;
      if (el.tagName === 'SELECT') { const o = [...el.options].find((x) => x.value); if (o) { el.value = o.value; el.dispatchEvent(new Event('change', { bubbles: true })); } return; }
      el.value = el.type === 'date' ? '2026-10-27' : 'Test ' + (el.name || el.id);
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}
async function submitNew(p) {
  await p.click('#jhaSubmitBtn');
  await p.waitForSelector('#ngView', { timeout: 8000 });
  const sub = call(p, 'cs_portal_field_submit').body;
  return { fields: sub.p_fields, pdf: p.pdfs.at(-1) || '' };
}
const withoutDoc = (f) => { const o = Object.assign({}, f); delete o.doc; return o; };
const saved = {};

try {
  await check('Computer (Windows Chrome), unchanged: the time fields themselves, no lists, saved values 07:00 and 15:30, both in the PDF', async () => {
    const p = await open('desktop');
    assert.equal(await p.$('#jhaStartTimePick'), null, 'no lists on a computer');
    for (const id of ['jhaStartTime', 'jhaCompleteTime']) {
      assert.deepEqual(await p.$eval('#' + id, (e) => [e.type, e.required, e.offsetParent !== null]), ['time', true, true]);
    }
    await typeTime(p, 'jhaStartTime', '07:00');
    await typeTime(p, 'jhaCompleteTime', '15:30');
    await shot(p, 'D-01-desktop-unchanged', '#jhaStartTime');
    await fillRest(p);
    saved.desktop = await submitNew(p);
    assert.equal(saved.desktop.fields.jhaStartTime, '07:00');
    assert.equal(saved.desktop.fields.jhaCompleteTime, '15:30');
    assert.match(saved.desktop.pdf, /Start Time[\s\S]{0,400}07:00/);
    assert.match(saved.desktop.pdf, /Estimated Time of Completion[\s\S]{0,400}15:30/);
    HEAD_FIELDS = Object.assign({}, saved.desktop.fields, { jhaStartTime: '06:38', jhaCompleteTime: '16:30', jhaDescriptionOfWork: 'Original: set hangers, Level 2 (Test)' });
    await p.done();
  });

  await check('iPhone (WebKit), unchanged: the time fields themselves, no lists, same saved values', async () => {
    const p = await open('iphone');
    assert.equal(await p.$('#jhaStartTimePick'), null, 'no lists on an iPhone');
    assert.deepEqual(await p.$eval('#jhaStartTime', (e) => [e.type, e.offsetParent !== null]), ['time', true]);
    await typeTime(p, 'jhaStartTime', '07:00');
    await typeTime(p, 'jhaCompleteTime', '15:30');
    await shot(p, 'I-01-iphone-unchanged', '#jhaStartTime');
    await fillRest(p);
    const s = await submitNew(p);
    assert.deepEqual(withoutDoc(s.fields), withoutDoc(saved.desktop.fields), 'an iPhone saves what a computer saves');
    await p.done();
  });

  await check('Android (Clark’s Chrome 154): both JHA times are lists on the page (hour, minutes, AM/PM); no Android clock field is shown', async () => {
    const p = await open('android');
    for (const id of ['jhaStartTime', 'jhaCompleteTime']) {
      assert.ok(await p.$(`#${id}Pick`), `${id}: lists are on the page`);
      assert.deepEqual(await p.$$eval(`#${id}Pick select`, (ss) => ss.map((s) => [s.getAttribute('data-time-part'), s.offsetParent !== null, s.required, s.options[s.selectedIndex].text])),
        [['hour', true, true, 'Hour'], ['minute', true, true, 'Minutes'], ['ampm', true, true, 'AM / PM']]);
      assert.equal(await shown(p, '#' + id), false, `${id}: the time field itself is hidden`);
      assert.equal(await note(p, id), 'Not set yet');
    }
    assert.equal(await p.$$eval('#jhaForm input[type="time"]', (xs) => xs.filter((x) => x.offsetParent !== null).length), 0, 'no visible time field anywhere in the JHA');
    // Guard for the next form: the only Android clock fields on the whole page are these two, and both are behind lists.
    assert.deepEqual(await p.$$eval('input[type="time"]', (xs) => xs.map((x) => x.id + (x.classList.contains('jha-time-native-hidden') ? ':behind-lists' : ':SHOWN'))),
      ['jhaStartTime:behind-lists', 'jhaCompleteTime:behind-lists'], 'a new clock field needs the same lists on Android');
    assert.deepEqual(await p.$$eval('#jhaStartTimePick select[data-time-part="minute"] option', (os) => os.map((o) => o.value)),
      ['', '00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']);
    await shot(p, 'A-01-android-times-not-set', '#jhaStartTimePick');
    await p.done();
  });

  await check('Android: picking 7 :00 AM and 3 :30 PM fills 07:00 and 15:30 and says so under each time; 12 AM is 00:xx and 12 PM is 12:xx', async () => {
    const p = await open('android');
    await pickTime(p, 'jhaStartTime', '12', '15', 'AM');
    assert.equal(await value(p, 'jhaStartTime'), '00:15');
    await pickTime(p, 'jhaStartTime', '12', '00', 'PM');
    assert.equal(await value(p, 'jhaStartTime'), '12:00');
    await pickTime(p, 'jhaStartTime', '7', '00', 'AM');
    await pickTime(p, 'jhaCompleteTime', '3', '30', 'PM');
    assert.equal(await value(p, 'jhaStartTime'), '07:00');
    assert.equal(await value(p, 'jhaCompleteTime'), '15:30');
    assert.equal(await note(p, 'jhaStartTime'), '✓ Set to 7:00 AM');
    assert.equal(await note(p, 'jhaCompleteTime'), '✓ Set to 3:30 PM');
    await shot(p, 'A-02-android-times-set', '#jhaStartTimePick');
    await p.done();
  });

  await check('Android: the hour alone fills :00 and asks for AM or PM; Submit stops on the AM/PM list and nothing is sent', async () => {
    const p = await open('android');
    await p.selectOption('#jhaStartTimePick select[data-time-part="hour"]', '6');
    assert.deepEqual(await lists(p, 'jhaStartTime'), ['6', '00', '']);
    assert.equal(await value(p, 'jhaStartTime'), '', 'no time saved until AM or PM is picked');
    assert.equal(await note(p, 'jhaStartTime'), 'Not set yet: choose AM or PM');
    await pickTime(p, 'jhaCompleteTime', '4', '30', 'PM');
    await fillRest(p);
    const before = p.calls.length;
    await p.click('#jhaSubmitBtn');
    await p.waitForTimeout(600);
    assert.deepEqual(p.calls.slice(before).map((c) => c.fn), [], 'nothing sent');
    assert.equal(await p.evaluate(() => document.activeElement.getAttribute('data-time-part') + '@' + document.activeElement.closest('.jha-time-pick').id), 'ampm@jhaStartTimePick',
      'the browser stops on the AM/PM list you can tap, not on a hidden field');
    await shot(p, 'A-03-android-submit-stops-on-ampm', '#jhaStartTimePick');
    await p.selectOption('#jhaStartTimePick select[data-time-part="ampm"]', 'AM');
    assert.equal(await value(p, 'jhaStartTime'), '06:00');
    await p.done();
  });

  await check('Android, complete new JHA: submits with jhaStartTime 07:00 and jhaCompleteTime 15:30, attaches the PDF, and the PDF shows both times', async () => {
    const p = await open('android');
    await pickTime(p, 'jhaStartTime', '7', '00', 'AM');
    await pickTime(p, 'jhaCompleteTime', '3', '30', 'PM');
    await fillRest(p);
    saved.android = await submitNew(p);
    assert.deepEqual(fns(p), ['cs_portal_field_home', 'cs_portal_field_equipment', 'cs_portal_field_submit', 'edge:upload']);
    assert.equal(saved.android.fields.jhaStartTime, '07:00');
    assert.equal(saved.android.fields.jhaCompleteTime, '15:30');
    assert.deepEqual(withoutDoc(saved.android.fields), withoutDoc(saved.desktop.fields), 'Android saves exactly what a computer saves');
    assert.match(saved.android.pdf, /Start Time[\s\S]{0,400}07:00/);
    assert.match(saved.android.pdf, /Estimated Time of Completion[\s\S]{0,400}15:30/);
    await shot(p, 'A-04-android-submitted');
    // Start a second JHA: the times are empty again.
    await p.evaluate(() => window.openJhaForm());
    await p.waitForTimeout(300);
    assert.deepEqual(await lists(p, 'jhaStartTime'), ['', '', '']);
    assert.deepEqual(await lists(p, 'jhaCompleteTime'), ['', '', '']);
    assert.equal(await note(p, 'jhaStartTime'), 'Not set yet');
    assert.equal(await value(p, 'jhaStartTime'), '');
    await p.done();
  });

  await check('Samsung Internet (Android) also gets the lists', async () => {
    const p = await open('samsung');
    assert.equal(await shown(p, '#jhaStartTimePick'), true);
    assert.equal(await shown(p, '#jhaStartTime'), false);
    await p.done();
  });


  async function openRevision(p) {
    await p.click('#jhaReviseEntryBtn');
    await p.waitForSelector(`[data-revise-root="${ORIGINAL}"]`, { timeout: 5000 });
    await p.click(`[data-revise-root="${ORIGINAL}"]`);
    await p.waitForSelector('#jhaRevisionBanner', { timeout: 5000 });
    await p.waitForTimeout(200);
  }
  async function submitRevision(p) {
    await p.click('#jhaSubmitBtn');
    await p.waitForSelector('#jhaRevSaved', { timeout: 8000 });
    return call(p, 'cs_jha_revise').body.p_fields;
  }
  // The revision's change list, worked out the way the phone does it (JhaModel.diffJhaData, head vs sent).
  const diffLabels = (p, sent) => p.evaluate(([head, next]) => {
    const M = window.JhaModel;
    return M.diffJhaData(M.normalizeJhaData(head), M.normalizeJhaData(next)).map((d) => d.label).join(' | ');
  }, [HEAD_FIELDS, sent]);

  await check('Android revision: an earlier JHA’s 6:38 AM and 4:30 PM show in the lists (keeping :38), and a revision that doesn’t touch them sends them unchanged', async () => {
    const p = await open('android');
    await openRevision(p);
    assert.deepEqual(await lists(p, 'jhaStartTime'), ['6', '38', 'AM']);
    assert.deepEqual(await lists(p, 'jhaCompleteTime'), ['4', '30', 'PM']);
    assert.equal(await note(p, 'jhaStartTime'), '✓ Set to 6:38 AM');
    assert.equal(await note(p, 'jhaCompleteTime'), '✓ Set to 4:30 PM');
    const mins = await p.$$eval('#jhaStartTimePick select[data-time-part="minute"] option', (os) => os.map((o) => o.value));
    assert.deepEqual(mins.slice(mins.indexOf('35'), mins.indexOf('35') + 3), ['35', '38', '40'], ':38 is kept, in order');
    await shot(p, 'A-05-android-revision-prefilled', '#jhaStartTimePick');
    await p.fill('#jhaDescriptionOfWork', 'Revised: set hangers, Level 2 and 3 (Test)');
    const f = await submitRevision(p);
    assert.equal(f.jhaStartTime, '06:38');
    assert.equal(f.jhaCompleteTime, '16:30');
    assert.ok(fns(p).includes('edge:upload') && fns(p).includes('cs_jha_revision_attach_pdf'), 'revised PDF uploaded and attached');
    const diff = await diffLabels(p, f);
    assert.equal(diff, 'Description of Work', 'only the description changed');
    assert.match(p.pdfs.at(-1), /1 field changed/, 'the revised PDF says one field changed');
    assert.match(p.pdfs.at(-1), /Start Time[\s\S]{0,400}06:38/);
    await p.done();
  });

  await check('Android revision: changing only the completion time to 5:00 PM sends 17:00, keeps 06:38, and the change list names only that time', async () => {
    const p = await open('android');
    await openRevision(p);
    await pickTime(p, 'jhaCompleteTime', '5', '00', 'PM');
    const f = await submitRevision(p);
    assert.equal(f.jhaStartTime, '06:38');
    assert.equal(f.jhaCompleteTime, '17:00');
    const diff = await diffLabels(p, f);
    assert.equal(diff, 'Estimated Time of Completion', 'only the completion time changed');
    assert.match(p.pdfs.at(-1), /1 field changed/, 'the revised PDF says one field changed');
    assert.match(p.pdfs.at(-1), /Estimated Time of Completion[\s\S]{0,400}17:00/);
    await p.done();
  });

  await check('Computer revision, unchanged: the same JHA opens with the time fields at 06:38 and 16:30', async () => {
    const p = await open('desktop');
    await openRevision(p);
    assert.equal(await value(p, 'jhaStartTime'), '06:38');
    assert.equal(await value(p, 'jhaCompleteTime'), '16:30');
    assert.equal(await p.$('#jhaStartTimePick'), null);
    await p.done();
  });

  await check('Android, Close then reopen: the times start empty again', async () => {
    const p = await open('android');
    await pickTime(p, 'jhaStartTime', '8', '15', 'AM');
    await p.click('#closeInspectionJhaBtn');
    await p.waitForTimeout(200);
    await p.evaluate(() => window.openJhaForm());
    await p.waitForTimeout(300);
    assert.deepEqual(await lists(p, 'jhaStartTime'), ['', '', '']);
    assert.equal(await value(p, 'jhaStartTime'), '');
    assert.equal(await note(p, 'jhaStartTime'), 'Not set yet');
    await p.done();
  });

  await check('Nothing left the machine', async () => { assert.deepEqual(offMachine, []); });
} finally {
  await cr.close();
  await wk.close();
  server.close();
}
console.log(`\n${failures ? 'FAILED' : 'PASSED'}: ${checks} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
