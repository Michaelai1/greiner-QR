/* Forklift: a missing or unreadable operator's manual (Greiner, October 12).
 * The issue is recorded and flagged for supervisor review, and the person doing
 * the inspection is told to raise it with their foreman. Demo mode in a real
 * browser: nothing leaves the machine and nothing is recorded anywhere.
 * Needs playwright-webkit (PLAYWRIGHT_NODE_MODULES).
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
  catch (e) { failures++; console.log(`  FAIL ${name}\n       ${String(e.message).split('\n')[0]}`); }
}
await check('a "No" on the operator\'s manual still flags a defect (the record keeps it)', () => {
  assert.ok(html.includes('name="fl_chk_operator_manual" value="defect" data-display="No"> No</label>'));
});

const req = createRequire(path.join(process.env.PLAYWRIGHT_NODE_MODULES || ROOT, 'noop.js'));
let webkit;
try { ({ webkit } = req('playwright-webkit')); } catch { console.log('Forklift manual verification: browser checks skipped (set PLAYWRIGHT_NODE_MODULES).'); process.exit(failures ? 1 : 0); }

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((rq, rs) => {
  const p = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end(); }
  rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
const WED = encodeURIComponent('2026-09-30T15:00:00-04:00');
const offMachine = [];
const browser = await webkit.launch();
async function open() {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
    if (/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\//.test(u)) return r.abort();
    offMachine.push(u); return r.abort();
  });
  await page.goto(BASE + '?demo=1&ngform=forklift&demonow=' + WED);
  await page.waitForTimeout(400);
  return page;
}
const answer = (p, name, value) => p.evaluate(([n, v]) => {
  const el = document.querySelector(`#forkliftInspectionForm input[name="${n}"][value="${v}"]`);
  el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true }));
}, [name, value]);
async function fillRequired(page) {
  for (let pass = 0; pass < 3; pass++) await page.evaluate(() => {
    const form = document.querySelector('#forkliftInspectionForm'); const seen = {};
    form.querySelectorAll('[required]').forEach((el) => {
      if (el.offsetParent === null) return;
      if (el.type === 'radio') { if (seen[el.name]) return; seen[el.name] = 1; if (![...form.querySelectorAll(`input[name="${el.name}"]`)].some((x) => x.checked)) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); } return; }
      if (el.type === 'checkbox') { if (!el.checked) el.click(); return; }
      if (el.value) return;
      if (el.tagName === 'SELECT') { const o = [...el.options].find((x) => x.value); if (o) { el.value = o.value; el.dispatchEvent(new Event('change', { bubbles: true })); } return; }
      el.value = el.type === 'date' ? '2026-09-30' : el.type === 'time' ? '08:00' : el.type === 'number' ? '1' : 'QA ' + (el.name || el.id);
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}
const allSafe = (p) => p.evaluate(() => document.querySelectorAll('#forkliftInspectionForm input[type=radio][value=safe]').forEach((r) => { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }));
const visible = (p, sel) => p.$eval(sel, (e) => !e.hidden && e.offsetParent !== null);
async function submit(p) {
  await fillRequired(p);
  await p.click('#forkliftSubmitBtn');
  await p.waitForSelector('#demoSubmitNotice', { timeout: 5000 });
  return p.evaluate(() => ({ notice: document.getElementById('successDefectNotice').innerText, shown: document.getElementById('successDefectNotice').style.display !== 'none',
    title: document.getElementById('successTitle').textContent, items: NG.demoLastDoc.sections.flatMap((s) => s.items.map((i) => i.label + ' = ' + i.response)) }));
}

try {
  await check('choosing "No" shows the note to tell the foreman; "Yes" hides it', async () => {
    const p = await open();
    await allSafe(p);
    assert.equal(await visible(p, '#flManualNote'), false, 'hidden while Yes');
    await answer(p, 'fl_chk_operator_manual', 'defect');
    assert.equal(await visible(p, '#flManualNote'), true, 'shown for No');
    assert.match(await p.$eval('#flManualNote', (e) => e.innerText), /recorded and flagged for supervisor review\. Tell your foreman so it can be replaced\./);
    await answer(p, 'fl_chk_operator_manual', 'safe');
    assert.equal(await visible(p, '#flManualNote'), false, 'hidden again for Yes');
    await p.close();
  });
  await check('manual missing alone: recorded as flagged, the inspector is told to raise it with their foreman (no do-not-operate wording)', async () => {
    const p = await open();
    await allSafe(p);
    await answer(p, 'fl_chk_operator_manual', 'defect');
    const r = await submit(p);
    assert.ok(r.items.includes("Manufacturer Operator's Manual Present and Readable = No"), r.items.join('\n'));
    assert.equal(r.title, 'Inspection Flagged');
    assert.ok(r.shown);
    assert.match(r.notice, /Operator's manual missing or unreadable\. It is recorded and flagged for supervisor review\. Tell your foreman so it can be replaced\./);
    assert.doesNotMatch(r.notice, /Do not operate/);
    assert.equal(await visible(p, '#flManualNote'), false, 'the note resets with the form');
    assert.deepEqual(p.errors, []);
    await p.close();
  });
  await check('manual missing with another defect: the do-not-operate notice stays, with the manual line added', async () => {
    const p = await open();
    await allSafe(p);
    await answer(p, 'fl_chk_operator_manual', 'defect');
    await answer(p, 'fl_chk_overhead', 'defect');
    const r = await submit(p);
    assert.match(r.notice, /Do not operate this equipment until a manager has acknowledged this report[\s\S]*Operator's manual missing or unreadable/);
    await p.close();
  });
  await check('manual present: the usual pass, no manual wording', async () => {
    const p = await open();
    await allSafe(p);
    const r = await submit(p);
    assert.equal(r.title, 'Inspection Passed');
    assert.equal(r.shown, false);
    assert.doesNotMatch(r.notice, /Operator's manual missing/);
    await p.close();
  });
  await check('nothing left the machine', () => { assert.deepEqual(offMachine, []); });
} finally { await browser.close(); server.close(); }
if (failures) { console.log(`Forklift manual verification FAILED (${failures} failing, ${checks} passing).`); process.exit(1); }
console.log(`Forklift manual verification passed (${checks} checks, nothing sent or recorded).`);
