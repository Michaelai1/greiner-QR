/* Forklift questions (Tony, October 21 2026; Oct 23 meeting):
 *   - EVERY forklift inspection asks "Confirm you are a trained competent person for this equipment".
 *     No, or no answer, stops the inspection.
 *   - With the operator's manual missing, after that Yes: "Is your supervisor aware of the missing manual?",
 *     then "Is your supervisor still authorizing or recommending use of the equipment?", then "What is the
 *     supervisor's name?" (typed by the inspector; required). No to any of them stops the inspection.
 *
 * This is the requested FORM LOGIC only. The confirmation is the inspector's own answer, recorded as answered;
 * it is not proof of training, and a typed supervisor name is not a supervisor's signature or approval.
 *
 * Demo mode in WebKit at 390 px: nothing leaves the machine, nothing is recorded.
 * Needs playwright-webkit (PLAYWRIGHT_NODE_MODULES). Optional: SCREENS_DIR, JSPDF_PATH.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(new URL('../', import.meta.url).pathname);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let checks = 0, failures = 0;
async function check(name, fn) {
  try { await fn(); checks++; console.log(`  ok  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${name}\n       ${String(e.message).split('\n').join('\n       ')}`); }
}
const Q1 = 'Confirm you are a trained competent person for this equipment';
const DOC_Q1 = 'Inspector confirms they are a trained competent person for this equipment (self-reported)';
const Q2 = 'Is your supervisor aware of the missing manual?';
const Q3 = 'Is your supervisor still authorizing or recommending use of the equipment?';
const Q4 = "What is the supervisor's name?";
const NAME_LABEL = "Supervisor's name (typed by the inspector; not a supervisor signature)";
const GATE = ['fl_manual_supervisor_aware', 'fl_manual_supervisor_authorizes'];

await check('wording and order: the trained question is outside the hidden block; the three supervisor steps are hidden and disabled', () => {
  const a = html.indexOf(Q1), g = html.indexOf('<div class="fl-manual-gate" id="flManualGate" hidden>'), b = html.indexOf(Q2), c = html.indexOf(Q3), d = html.indexOf(Q4);
  assert.ok(a > 0 && a < g && g < b && b < c && c < d, 'order');
  assert.match(html, /<input type="radio" name="fl_competent_person" value="yes" data-display="Yes" required>/, 'always enabled and required');
  assert.equal((html.match(/<input [^>]*name="fl_manual_[a-z_]+"[^>]*disabled[^>]*>/g) || []).length, 5, 'every supervisor-step input starts disabled');
  assert.ok(!/fl_manual_competent_person/.test(html), 'the old manual-only key is gone');
  assert.ok(html.includes('It is not proof of training.'), 'the screen says the confirmation is not proof of training');
});

const req = createRequire(path.join(process.env.PLAYWRIGHT_NODE_MODULES || ROOT, 'noop.js'));
let webkit;
try { ({ webkit } = req('playwright-webkit')); } catch { console.log('Forklift manual gate: browser checks skipped (set PLAYWRIGHT_NODE_MODULES).'); process.exit(failures ? 1 : 0); }
const JSPDF_PATH = process.env.JSPDF_PATH || path.resolve(ROOT, '../greiner-dashboard-tony-feedback-2026-10-02/tools/vendor/jspdf.umd.min.js');
const JSPDF = fs.existsSync(JSPDF_PATH) ? fs.readFileSync(JSPDF_PATH) : null;
const SHOTS = process.env.SCREENS_DIR || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((rq, rs) => {
  const p = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end(); }
  rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
const NOW = encodeURIComponent('2026-10-22T07:30:00-04:00');
const offMachine = [];
const browser = await webkit.launch();
async function open() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
    if (/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\//.test(u)) return JSPDF ? r.fulfill({ body: JSPDF, contentType: 'application/javascript' }) : r.abort();
    offMachine.push(u); return r.abort();
  });
  await page.goto(BASE + '?demo=1&ngform=forklift&demonow=' + NOW);
  await page.waitForTimeout(400);
  // Capture what would be sent (demo mode sends nothing; this only records the payload in-page).
  await page.evaluate(() => {
    const orig = window.handleSaveData; window.__sent = [];
    window.handleSaveData = function (u, p, b, l) { window.__sent.push(JSON.parse(JSON.stringify(p))); return orig(u, p, b, l); };
  });
  return page;
}
const answer = (p, name, value) => p.evaluate(([n, v]) => {
  const el = document.querySelector(`#forkliftInspectionForm input[name="${n}"][value="${v}"]`);
  el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true }));
}, [name, value]);
const allSafe = (p) => p.evaluate(() => document.querySelectorAll('#forkliftInspectionForm input[type=radio][value=safe]').forEach((r) => { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }));
// Fill the ordinary required fields (not the forklift questions: the tests answer those on purpose).
async function fillOrdinary(page) {
  for (let pass = 0; pass < 3; pass++) await page.evaluate(() => {
    const form = document.querySelector('#forkliftInspectionForm'); const seen = {};
    form.querySelectorAll('[required]').forEach((el) => {
      if (el.offsetParent === null || el.closest('.fl-manual-gate') || el.name === 'fl_competent_person') return;
      if (el.type === 'radio') { if (seen[el.name]) return; seen[el.name] = 1; if (![...form.querySelectorAll(`input[name="${el.name}"]`)].some((x) => x.checked)) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); } return; }
      if (el.type === 'checkbox') { if (!el.checked) el.click(); return; }
      if (el.value) return;
      if (el.tagName === 'SELECT') { const o = [...el.options].find((x) => x.value); if (o) { el.value = o.value; el.dispatchEvent(new Event('change', { bubbles: true })); } return; }
      el.value = el.type === 'date' ? '2026-10-22' : el.type === 'time' ? '07:30' : el.type === 'number' ? '1' : (el.name === 'forkliftSignature' ? 'Riley Example (Demo)' : 'Demo ' + (el.name || el.id));
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}
const shownSteps = (p) => p.$$eval('#flManualGate .fl-gate-step', (s) => s.filter((x) => !x.hidden && x.offsetParent !== null).map((x) => +x.dataset.gateStep));
const enabledGateInputs = (p) => p.$$eval('#flManualGate input', (s) => s.filter((x) => !x.disabled).map((x) => x.name + (x.type === 'radio' ? ':' + x.value : '')));
const visible = (p, sel) => p.$eval(sel, (e) => !e.hidden && e.offsetParent !== null);
async function shot(p, name, sel) {
  if (!SHOTS) return;
  if (sel) await p.$eval(sel, (e) => e.scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(100);
  await p.screenshot({ path: path.join(SHOTS, name) });
}
async function trySubmit(p) {
  await p.click('#forkliftSubmitBtn', { force: true }).catch(() => {});
  // Also push a submit through even if the button is disabled.
  await p.evaluate(() => document.getElementById('forkliftInspectionForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })));
  await p.waitForTimeout(400);
  return p.evaluate(() => ({ sent: window.__sent.length, doc: !!NG.demoLastDoc, completion: !!document.getElementById('demoSubmitNotice') && document.querySelector('.view.active') && document.querySelector('.view.active').id === 'successView' }));
}

const fill = async (p, ...pairs) => { for (const [n, v] of pairs) await answer(p, n, v); };
const sentFields = (p) => p.evaluate(() => window.__sent.map((x) => x.fields));
try {
  await check('manual present: the trained question shows and is required; unanswered, nothing is submitted', async () => {
    const p = await open();
    await allSafe(p);
    assert.equal(await visible(p, '#flCompetent'), true);
    assert.equal(await visible(p, '#flManualGate'), false);
    assert.deepEqual(await enabledGateInputs(p), []);
    await fillOrdinary(p);
    const r = await trySubmit(p);
    assert.deepEqual(r, { sent: 0, doc: false, completion: false });
    assert.deepEqual(p.errors, []); await p.close();
  });

  await check('manual present + Yes: it passes as before, and the record says the confirmation is self-reported', async () => {
    const p = await open();
    await allSafe(p);
    await answer(p, 'fl_competent_person', 'yes');
    await fillOrdinary(p);
    await p.click('#forkliftSubmitBtn');
    await p.waitForSelector('#demoSubmitNotice', { timeout: 5000 });
    const r = await p.evaluate(() => ({ title: document.getElementById('successTitle').textContent,
      items: NG.demoLastDoc.sections.flatMap((s) => s.items.map((i) => i.label + ' = ' + i.response)), fields: window.__sent[0].fields }));
    assert.equal(r.title, 'Inspection Passed');
    assert.ok(r.items.includes(`${DOC_Q1} = Yes`), r.items.join('\n'));
    assert.ok(!r.items.some((l) => /supervisor/i.test(l)), 'no supervisor questions on a manual-present record');
    assert.equal(r.fields.fl_competent_person, 'yes');
    assert.deepEqual(Object.keys(r.fields).filter((k) => /^fl_manual_/.test(k)), []);
    await shot(p, 'fl2-01-manual-present-trained-yes.png', '#flCompetent');
    assert.deepEqual(p.errors, []); await p.close();
  });

  for (const manual of ['safe', 'defect']) {
    await check(`"No" to the trained question stops the inspection (manual ${manual === 'safe' ? 'present' : 'missing'}); nothing is submitted`, async () => {
      const p = await open();
      await allSafe(p);
      if (manual === 'defect') await answer(p, 'fl_chk_operator_manual', 'defect');
      await answer(p, 'fl_competent_person', 'no');
      assert.equal(await visible(p, '#flManualGate'), false, 'no supervisor questions after a No');
      assert.equal(await p.$eval('#flManualBlock', (e) => e.innerText), `This inspection can’t be completed. You answered No to “${Q1}”.`);
      assert.equal(await p.$eval('#forkliftSubmitBtn', (b) => b.disabled), true);
      await fillOrdinary(p);
      if (manual === 'safe') await shot(p, 'fl2-02-trained-no-blocks.png', '#flManualBlock');
      assert.deepEqual(await trySubmit(p), { sent: 0, doc: false, completion: false });
      assert.match(await p.$eval('#toast-container', (e) => e.innerText), /Inspection can’t be submitted/);
      await answer(p, 'fl_competent_person', 'yes');
      assert.equal(await visible(p, '#flManualBlock'), false);
      assert.equal(await p.$eval('#forkliftSubmitBtn', (b) => b.disabled), false);
      assert.deepEqual(p.errors, []); await p.close();
    });
  }

  await check('manual missing: the supervisor questions appear only after the trained Yes, one at a time', async () => {
    const p = await open();
    await allSafe(p);
    await answer(p, 'fl_chk_operator_manual', 'defect');
    assert.equal(await visible(p, '#flManualGate'), false, 'nothing yet: the trained question comes first');
    await answer(p, 'fl_competent_person', 'yes');
    assert.deepEqual(await shownSteps(p), [1]);
    await answer(p, 'fl_manual_supervisor_aware', 'yes');
    assert.deepEqual(await shownSteps(p), [1, 2]);
    await answer(p, 'fl_manual_supervisor_authorizes', 'yes');
    assert.deepEqual(await shownSteps(p), [1, 2, 3]);
    const gateText = await p.$eval('#flManualGate', (e) => e.innerText);
    for (const q of [Q2, Q3, Q4]) assert.ok(gateText.includes(q), q);
    await shot(p, 'fl2-03-manual-missing-steps.png', '#flManualGate');
    await p.close();
  });

  for (const [i, name, q] of [[1, GATE[0], Q2], [2, GATE[1], Q3]]) {
    await check(`manual missing: "No" to "${q}" stops the inspection; nothing is submitted`, async () => {
      const p = await open();
      await allSafe(p);
      await fill(p, ['fl_chk_operator_manual', 'defect'], ['fl_competent_person', 'yes'], ...GATE.slice(0, i - 1).map((n) => [n, 'yes']));
      await answer(p, name, 'no');
      assert.deepEqual(await shownSteps(p), Array.from({ length: i }, (_, k) => k + 1), 'later questions stay hidden');
      assert.equal(await p.$eval('#flManualBlock', (e) => e.innerText), `This inspection can’t be completed. You answered No to “${q}”.`);
      await fillOrdinary(p);
      assert.deepEqual(await trySubmit(p), { sent: 0, doc: false, completion: false });
      assert.deepEqual(p.errors, []); await p.close();
    });
  }

  await check('manual missing: unanswered supervisor questions or a blank name cannot be submitted', async () => {
    const p = await open();
    await allSafe(p);
    await fill(p, ['fl_chk_operator_manual', 'defect'], ['fl_competent_person', 'yes']);
    await fillOrdinary(p);
    assert.deepEqual(await trySubmit(p), { sent: 0, doc: false, completion: false }, 'unanswered');
    await fill(p, ...GATE.map((n) => [n, 'yes']));
    assert.deepEqual(await trySubmit(p), { sent: 0, doc: false, completion: false }, 'blank name');
    await p.fill('#flManualSupervisorName', '   ');
    assert.deepEqual(await trySubmit(p), { sent: 0, doc: false, completion: false }, 'spaces only');
    assert.deepEqual(p.errors, []); await p.close();
  });

  await check('the send step itself refuses (a cached copy of this page, or anything bypassing the screen)', async () => {
    const p = await open();
    await allSafe(p);
    const r = await p.evaluate(() => window.handleSaveData('', { form_type: 'inspection', inspection_subtype: 'forklift', fields: {} }, null, 'Submit').then(() => 'sent', (e) => 'refused: ' + e.message));
    assert.match(r, /^refused: Answer “Confirm you are a trained competent person/);
    assert.equal((await sentFields(p)).length, 1, 'the call was attempted once');
    assert.equal(await p.evaluate(() => !!NG.demoLastDoc), false, 'and nothing was recorded');
    await p.close();
  });

  await check('all Yes + name: the record and PDF carry each answer and the name exactly as typed, labelled honestly', async () => {
    const p = await open();
    await allSafe(p);
    await fill(p, ['fl_chk_operator_manual', 'defect'], ['fl_competent_person', 'yes'], ...GATE.map((n) => [n, 'yes']));
    const typed = 'Pat  O’Neil-Example (Demo)';
    await p.fill('#flManualSupervisorName', typed);
    await fillOrdinary(p);
    await p.click('#forkliftSubmitBtn');
    await p.waitForSelector('#demoSubmitNotice', { timeout: 5000 });
    const r = await p.evaluate(() => ({ title: document.getElementById('successTitle').textContent,
      items: NG.demoLastDoc.sections.flatMap((s) => s.items.map((i) => i.label + ' = ' + i.response)), fields: window.__sent[0].fields }));
    assert.equal(r.title, 'Inspection Flagged', 'the missing manual is still recorded and flagged as agreed');
    for (const want of ["Manufacturer Operator's Manual Present and Readable = No", `${DOC_Q1} = Yes`, `${Q2} = Yes`, `${Q3} = Yes`, `${NAME_LABEL} = ${typed}`]) {
      assert.ok(r.items.includes(want), 'missing: ' + want + '\n' + r.items.join('\n'));
    }
    assert.deepEqual([r.fields.fl_competent_person, r.fields.fl_manual_supervisor_aware, r.fields.fl_manual_supervisor_authorizes, r.fields.fl_manual_supervisor_name], ['yes', 'yes', 'yes', typed]);
    if (JSPDF) {
      const pdf = await p.evaluate(async () => { const b = NG.demoLastPdf; const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (const c of u) s += String.fromCharCode(c); return s.replace(/\\([()\\])/g, '$1'); });
      assert.ok(pdf.includes('(self-reported)'), 'the PDF calls the confirmation self-reported');
      assert.ok(pdf.includes('not a supervisor signature'), 'the PDF labels the name as typed by the inspector');
    }
    await shot(p, 'fl2-04-all-yes-name.png', '#flManualSupervisorName');
    assert.deepEqual(p.errors, []); await p.close();
  });

  await check('switching the manual back to present removes the supervisor questions and answers; the trained answer stays', async () => {
    const p = await open();
    await allSafe(p);
    await fill(p, ['fl_chk_operator_manual', 'defect'], ['fl_competent_person', 'yes'], [GATE[0], 'no']);
    await answer(p, 'fl_chk_operator_manual', 'safe');
    assert.equal(await visible(p, '#flManualGate'), false);
    assert.equal(await p.$eval('#forkliftSubmitBtn', (b) => b.disabled), false);
    await fillOrdinary(p);
    await p.click('#forkliftSubmitBtn');
    await p.waitForSelector('#demoSubmitNotice', { timeout: 5000 });
    const f = (await sentFields(p))[0];
    assert.equal(f.fl_competent_person, 'yes');
    assert.deepEqual(Object.keys(f).filter((k) => /^fl_manual_/.test(k)), []);
    await p.close();
  });

  await check('no horizontal overflow at 390 px with every question open', async () => {
    const p = await open();
    await allSafe(p);
    await fill(p, ['fl_chk_operator_manual', 'defect'], ['fl_competent_person', 'yes'], ...GATE.map((n) => [n, 'yes']));
    assert.ok((await p.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth)) <= 1);
    await p.close();
  });
} finally { await browser.close(); server.close(); }
await check('nothing left the machine', () => { assert.deepEqual(offMachine, []); });
if (failures) { console.log(`Forklift questions verification FAILED (${failures} failing, ${checks} passing).`); process.exit(1); }
console.log(`Forklift questions verification passed (${checks} checks${SHOTS ? ', screenshots saved' : ''}; nothing sent or recorded).`);
