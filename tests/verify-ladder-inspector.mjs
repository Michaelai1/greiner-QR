/* Ladder inspector question (Tony, Oct 9 2026) on the phone's PRODUCTION path,
 * in a real browser (WebKit), with every server call answered inside this test.
 *
 *  - Ladder use = Yes asks one thing: "Who will inspect the ladders prior to
 *    use?", picked from the job crew list with the aerial lift picker.
 *  - No ladder quantity, 30-day or ladder ID question in production.
 *  - The submitted fields, fields.doc and the uploaded PDF carry the names and
 *    the time they were picked. Ladder use = No asks and stores nothing else.
 *
 * Nothing leaves the machine: the Supabase RPCs (including the submit) and the
 * PDF upload are fulfilled here and anything else is blocked and recorded.
 * Needs playwright-webkit (PLAYWRIGHT_NODE_MODULES). JSPDF_PATH: a local jsPDF.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(new URL('../', import.meta.url).pathname);
const req = createRequire(path.join(process.env.PLAYWRIGHT_NODE_MODULES || ROOT, 'noop.js'));
let webkit;
try { ({ webkit } = req('playwright-webkit')); } catch {
  console.log('Ladder inspector production verification skipped (set PLAYWRIGHT_NODE_MODULES).');
  process.exit(0);
}
const JSPDF_PATH = process.env.JSPDF_PATH ||
  path.resolve(ROOT, '../greiner-dashboard-ladder-inspector/tools/vendor/jspdf.umd.min.js');
const JSPDF = fs.existsSync(JSPDF_PATH) ? fs.readFileSync(JSPDF_PATH) : null;

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((rq, rs) => {
  const p = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end(); }
  rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

/* ---------- the server, as this test plays it (fake "(Test)" people) ---------- */
const JOB = 'job-test-1';
const CREW = ['Lead Example (Test)', 'Crew Two (Test)', 'Crew Three (Test)'];
const RPC = {
  cs_portal_field_home: () => ({ user: 'Crew Two (Test)', company: 'Greiner Brothers',
    jobs: [{ id: JOB, job_number: 'T-001', name: 'Test Job (Test)', address: '1 Test St', foreman_name: 'Lead Example (Test)',
      external_hotwork: false, hotwork_locations: [], enabled_forms: null, enabled_permits: null, user_forms: ['jha'] }],
    people: CREW.map((name) => ({ name, phone: null })), hotwork_locations: [], equipment: [], recent: [] }),
  cs_portal_field_equipment: () => ({ user: { id: 'u2', name: 'Crew Two (Test)' }, equipment: [] }),
  cs_portal_field_submit: (b) => { SUBMITS.push(b); return { id: 'sub-' + SUBMITS.length }; }
};
const SUBMITS = [], UPLOADS = [], offMachine = [], rpcCalls = [];

let checks = 0, failures = 0;
async function check(name, fn) {
  try { await fn(); checks++; console.log(`  ok  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${name}\n       ${String(e.stack || e.message).split('\n').slice(0, 4).join('\n       ')}`); }
}
const browser = await webkit.launch();
async function open(width = 390) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
    if (JSPDF && /cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\//.test(u)) return r.fulfill({ body: JSPDF, contentType: 'application/javascript' });
    if (/^https:\/\/gvfolfzseqwhhimbxgjv\.supabase\.co\/functions\/v1\/field-pdf$/.test(u)) {
      UPLOADS.push(JSON.parse(r.request().postData() || '{}'));
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
    const m = u.match(/^https:\/\/gvfolfzseqwhhimbxgjv\.supabase\.co\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (m) {
      const body = JSON.parse(r.request().postData() || '{}');
      rpcCalls.push(m[1]);
      const f = RPC[m[1]], out = f ? f(body) : null;
      if (out == null) return r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'not found' }) });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
    }
    offMachine.push(u); return r.abort();
  });
  await page.goto(BASE + 'index.html?ticket=test-ticket-not-real&ngform=jha');
  await page.waitForTimeout(700);
  return page;
}
const text = (p, sel) => p.locator(sel).innerText();
const val = (p, sel) => p.$eval(sel, (e) => e.value);
// Fill every visible required field that is still empty. Repeats, because some answers reveal more.
async function fillRequired(page) {
  for (let pass = 0; pass < 3; pass++) {
    await page.evaluate(() => {
      const form = document.querySelector('#jhaForm'), seen = {};
      form.querySelectorAll('[required]').forEach((el) => {
        if (el.offsetParent === null) return;
        if (el.type === 'radio') {
          if (seen[el.name]) return; seen[el.name] = 1;
          if (![...form.querySelectorAll(`input[name="${el.name}"]`)].some((x) => x.checked)) {
            el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true }));
          }
          return;
        }
        if (el.value) return;
        el.value = el.type === 'time' ? '08:00' : el.type === 'date' ? '2026-10-09' : 'QA ' + (el.name || el.id);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  }
}
function pdfText(b64) {
  const s = Buffer.from(b64 || '', 'base64').toString('latin1');
  return s.replace(/\\([()\\])/g, '$1');   // PDF string literals escape ( ) and backslash
}
const ladderDoc = (fields) => (fields.doc.sections.find((s) => s.title === 'Ladder Use') || { items: [] })
  .items.map((i) => i.label + ' = ' + i.response);

try {
  await check('Ladder Yes shows one question: who will inspect the ladders, from the job crew list like aerial lifts', async () => {
    const p = await open();
    assert.equal(await p.evaluate(() => !!window.NG.demo), false, 'production path, not demo');
    await p.check('input[name=jhaLadderUse][value=yes]');
    await p.check('input[name=jhaAerialUse][value=yes]');
    const panel = await text(p, '#jhaLadderPanel');
    assert.ok(panel.startsWith('Who will inspect the ladders prior to use?'), panel);
    for (const gone of ['Which ladder', 'How many', '30 days', 'Ladder ID', 'quantity']) {
      assert.ok(!panel.toLowerCase().includes(gone.toLowerCase()), `production must not ask "${gone}"`);
    }
    assert.equal(await p.$eval('#jhaLadderIdPanel', (e) => e.style.display), 'none', 'the ladder ID picker stays demo-only');
    const visible = await p.$$eval('#jhaLadderPanel input, #jhaLadderPanel select, #jhaLadderPanel textarea',
      (x) => x.filter((e) => e.type !== 'hidden' && e.offsetParent !== null).length);
    assert.equal(visible, 0, 'nothing to type: only the crew chips');
    const ladder = await p.$$eval('[data-ladder-person]', (b) => b.map((x) => x.getAttribute('data-ladder-person')));
    const aerial = await p.$$eval('[data-aerial-person]', (b) => b.map((x) => x.getAttribute('data-aerial-person')));
    assert.deepEqual(ladder, CREW, 'the crew list from the server');
    assert.deepEqual(ladder, aerial, 'the same list the aerial lift picker offers');
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  await check('Ladder Yes with nobody picked is not submitted', async () => {
    const p = await open();
    await p.check('input[name=jhaLadderUse][value=yes]');
    await p.check('input[name=jhaAerialUse][value=no]');
    await fillRequired(p);
    const before = SUBMITS.length;
    await p.click('#jhaSubmitBtn');
    await p.waitForTimeout(300);
    assert.equal(SUBMITS.length, before, 'no submit reached the server');
    assert.ok((await text(p, 'body')).includes('Select at least one person who will inspect the ladders prior to use.'));
    await p.close();
  });

  await check('Submit: fields, fields.doc and the PDF carry the inspectors and the time they were picked', async () => {
    const p = await open();
    await p.check('input[name=jhaLadderUse][value=yes]');
    await p.check('input[name=jhaAerialUse][value=no]');
    const t0 = Date.now();
    await p.click('[data-ladder-person="Lead Example (Test)"]');
    await p.click('[data-ladder-person="Crew Three (Test)"]');
    const t1 = Date.now();
    const pickedAt = await val(p, '#jhaLadderInspectorsAt');
    assert.ok(Date.parse(pickedAt) >= t0 - 1000 && Date.parse(pickedAt) <= t1 + 1000, 'the pick time is now: ' + pickedAt);
    assert.match(await text(p, '#jhaLadderInspectorsAtNote'), /^Selected \w{3} \d{1,2}, \d{4}/);
    await fillRequired(p);
    await p.click('#jhaSubmitBtn');
    await p.waitForFunction(() => window.NG && window.NG.last && window.NG.last.id, null, { timeout: 8000 });
    const sub = SUBMITS.at(-1), f = sub.p_fields;
    assert.equal(sub.p_form_type, 'jha');
    assert.deepEqual(f.jhaLadderInspectors, ['Lead Example (Test)', 'Crew Three (Test)']);
    assert.equal(f.jhaLadderInspectorsAt, pickedAt);
    for (const k of ['jhaLadderCount', 'jhaLaddersInspected30Days', 'jhaLadderId']) assert.ok(!(k in f), `${k} is never stored`);
    assert.deepEqual(f.jhaLadderIds || [], [], 'no ladder IDs in production');
    const when = await p.evaluate((iso) => window.JhaModel.fmtIndy(iso), pickedAt);
    assert.deepEqual(ladderDoc(f), ['Is any ladder use planned or expected today? = Yes',
      'Who will inspect the ladders prior to use? = Lead Example (Test), Crew Three (Test)',
      'Ladder inspector selected at = ' + when], 'fields.doc (what the office and the phone dashboard show)');
    const up = UPLOADS.at(-1);
    assert.equal(up.action, 'upload'); assert.equal(up.id, 'sub-' + SUBMITS.length);
    if (JSPDF) {
      const pdf = pdfText(up.pdf_base64);
      assert.ok(pdf.startsWith('%PDF'));
      for (const s of ['Who will inspect the ladders prior to use?', 'Lead Example (Test), Crew Three (Test)', 'Ladder inspector selected at', when]) {
        assert.ok(pdf.includes(s), `PDF is missing "${s}"`);
      }
    }
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  await check('Ladder No: nothing else is asked or stored about ladders', async () => {
    const p = await open();
    await p.check('input[name=jhaLadderUse][value=yes]');
    await p.click('[data-ladder-person="Crew Two (Test)"]');
    await p.check('input[name=jhaLadderUse][value=no]');       // picks are cleared on No
    assert.equal(await p.$eval('#jhaLadderPanel', (e) => e.style.display), 'none');
    await p.check('input[name=jhaAerialUse][value=no]');
    await fillRequired(p);
    const next = SUBMITS.length + 1;
    await p.click('#jhaSubmitBtn');
    await p.waitForFunction((n) => window.NG && window.NG.last && window.NG.last.id === 'sub-' + n, next, { timeout: 8000 });
    const f = SUBMITS.at(-1).p_fields;
    for (const k of ['jhaLadderInspectors', 'jhaLadderInspectorsAt', 'jhaLadderIds', 'jhaLadderChecks', 'jhaLadderDefects']) {
      assert.ok(!(k in f), `${k} must not be stored on No`);
    }
    assert.deepEqual(ladderDoc(f), ['Is any ladder use planned or expected today? = No']);
    if (JSPDF) assert.ok(!pdfText(UPLOADS.at(-1).pdf_base64).includes('Who will inspect the ladders'));
    await p.close();
  });

  await check('No horizontal overflow at 390, 820, 1024 and 1440 px with the inspector picker open', async () => {
    for (const w of [390, 820, 1024, 1440]) {
      const p = await open(w);
      await p.check('input[name=jhaLadderUse][value=yes]');
      await p.click('[data-ladder-person="Crew Three (Test)"]');
      const o = await p.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
      assert.ok(o <= 1, `overflow at ${w}px: ${o}`);
      await p.close();
    }
  });

  await check('Only the stubbed server calls were made, and nothing left the machine', async () => {
    assert.deepEqual([...new Set(rpcCalls)].sort(), ['cs_portal_field_equipment', 'cs_portal_field_home', 'cs_portal_field_submit']);
    assert.deepEqual(offMachine, []);
  });
} finally {
  await browser.close();
  server.close();
}
if (failures) { console.log(`Ladder inspector production verification FAILED (${failures} failing, ${checks} passing).`); process.exit(1); }
console.log(`Ladder inspector production verification passed (${checks} checks, server answered in-test${JSPDF ? ', real PDFs rendered offline' : ', PDF bytes not checked: no local jsPDF'}, no network).`);
