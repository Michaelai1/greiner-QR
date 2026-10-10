/* JHA ladder / aerial / revision behavior, Hot Work, Forklift and Toolbox Talk,
 * including the ladder inspector question (Tony, Oct 9 2026),
 * driven in a real browser (WebKit) against this checkout.
 *
 * Self-contained: serves the worktree from a local port, pins the demo clock
 * with ?demonow= (so weekday behavior is testable on any day), and blocks every
 * request that leaves the machine. jsPDF is served from a local copy when one
 * is available, so the PDF is real and still offline.
 *
 * Needs the playwright-webkit package. Point PLAYWRIGHT_NODE_MODULES at the
 * node_modules folder that has it; otherwise the suite reports a skip.
 * Optional: JSPDF_PATH (defaults to the sibling dashboard worktree's vendored copy).
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
  console.log('JHA runtime verification skipped (playwright-webkit not found; set PLAYWRIGHT_NODE_MODULES).');
  process.exit(0);
}
const JSPDF_PATH = process.env.JSPDF_PATH ||
  path.resolve(ROOT, '../greiner-dashboard-tony-feedback-2026-10-02/tools/vendor/jspdf.umd.min.js');
const JSPDF = fs.existsSync(JSPDF_PATH) ? fs.readFileSync(JSPDF_PATH) : null;

/* ---------- a tiny static server for this checkout ---------- */
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
const WED = encodeURIComponent('2026-09-30T15:00:00-04:00');

const offMachine = [];   // every request that tried to leave the machine
let checks = 0, failures = 0;
async function check(name, fn) {
  try { await fn(); checks++; console.log(`  ok  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${name}\n       ${String(e.message).split('\n').join('\n       ')}`); }
}

const browser = await webkit.launch();
async function open(query, width = 390) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
    if (JSPDF && /cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\//.test(u)) {
      return r.fulfill({ body: JSPDF, contentType: 'application/javascript' });
    }
    offMachine.push(u); return r.abort();
  });
  await page.goto(BASE + '?' + query);
  await page.waitForTimeout(400);
  return page;
}
const text = (page, sel) => page.locator(sel).innerText();
const val = (page, sel) => page.$eval(sel, (e) => e.value);

/* Fill every visible required field that is still empty (JHA, Hot Work, Forklift).
   Repeats, because some answers reveal further required fields. */
async function fillRequired(page, formSel) {
  for (let pass = 0; pass < 3; pass++) await fillOnce(page, formSel);
}
async function fillOnce(page, formSel) {
  await page.evaluate((sel) => {
    const form = document.querySelector(sel);
    const seen = {};
    form.querySelectorAll('[required]').forEach((el) => {
      if (el.offsetParent === null) return;
      if (el.type === 'radio') {
        if (seen[el.name]) return; seen[el.name] = 1;
        const group = form.querySelectorAll(`input[name="${el.name}"]`);
        if (![...group].some((x) => x.checked)) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
        return;
      }
      if (el.type === 'checkbox') { if (!el.checked) el.click(); return; }
      if (el.value) return;
      if (el.tagName === 'SELECT') {
        const opt = [...el.options].find((o) => o.value);
        if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); }
        return;
      }
      el.value = el.type === 'time' ? '08:00' : el.type === 'date' ? '2026-09-30'
        : el.type === 'datetime-local' ? '2026-09-30T08:00' : el.type === 'number' ? '1' : 'QA ' + (el.name || el.id);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }, formSel);
}
async function newJha(page) {
  await page.evaluate(() => { document.querySelector('[data-demoform="jha"]').click(); });
  await page.waitForTimeout(150);
}
async function reviewPairs(page) {
  return page.$$eval('#jhaSubmittedReview .jha-review-row', (rows) => rows.map((r) =>
    r.querySelector('.jha-review-q').textContent + ' = ' + r.querySelector('.jha-review-a').textContent));
}
async function docPairs(page) {
  return page.evaluate(() => {
    const d = window.NG && NG.demoJha.lastDoc();
    return d.sections.filter((s) => !s.aux).flatMap((s) => s.items.map((i) => i.label + ' = ' + i.response));
  });
}
async function pdfText(page) {
  return page.evaluate(async () => {
    const b = NG.demoLastPdf; if (!b || !b.size) return '';
    const buf = new Uint8Array(await b.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
    return s.replace(/\\([()\\])/g, '$1');   // PDF string literals escape ( ) and \\
  });
}

try {
  /* ---------------- boot at awkward clock times ---------------- */
  await check('Demo boots cleanly at every edge of the workweek', async () => {
    for (const now of ['2026-09-28T00:30:00-04:00', '2026-09-28T10:00:00-04:00', '2026-10-02T23:30:00-04:00',
      '2026-10-03T10:00:00-04:00', '2026-10-04T23:59:00-04:00', '2026-11-02T00:30:00-05:00', '']) {
      const p = await open('demo=1' + (now ? '&demonow=' + encodeURIComponent(now) : ''));
      assert.deepEqual(p.errors, [], `page errors at ${now || 'real time'}`);
      assert.ok(await p.$('#demoQuick'), `demo home missing at ${now || 'real time'}`);
      await p.close();
    }
  });

  const page = await open('demo=1&demonow=' + WED);
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64');
  const photo = (name) => ({ name, mimeType: 'image/png', buffer: PNG });

  await check('Part 1: two entry routes, no New/Revised question, Estimated Time of Completion', async () => {
    const tiles = await page.$$eval('[data-demoform]', (b) => b.map((x) => x.textContent));
    assert.ok(tiles.includes('Complete New JHA') && tiles.includes('Revise Submitted JHA'));
    await newJha(page);
    const form = await text(page, '#jhaForm');
    assert.ok(!/New or Revised/.test(form), 'New or Revised must not be asked');
    assert.ok(form.includes('Estimated Time of Completion') && !/Complete Time/.test(form));
    assert.equal(await page.$('#openJobSiteAnalysisBtn'), null, 'the checklist JHA tile is gone');
  });

  await check('1-2. Aerial lifts: question present; several inspectors; No clears them', async () => {
    const sec = await text(page, '[data-jha-model="aerial"]');
    assert.ok(sec.includes('Will any aerial lift devices be used today?'));
    await page.check('input[name=jhaAerialUse][value=yes]');
    const panel = await text(page, '#jhaAerialPanel');
    assert.ok(panel.includes('Who will conduct the lift inspections?'));
    assert.ok(panel.includes('Select every person who may conduct an inspection today.'));
    assert.equal(await page.$$eval('#jhaAerialPanel input, #jhaAerialPanel textarea, #jhaAerialPanel select', (x) => x.filter((e) => e.type !== 'hidden').length), 0,
      'no further questions in the aerial section');
    await page.click('[data-aerial-person="Alex Rivera (Demo)"]');
    await page.click('[data-aerial-person="Jordan Blake (Demo)"]');
    assert.deepEqual(JSON.parse(await val(page, '#jhaAerialInspectors')), ['Alex Rivera (Demo)', 'Jordan Blake (Demo)']);
    await page.check('input[name=jhaAerialUse][value=no]');
    assert.equal(await val(page, '#jhaAerialInspectors'), '');
    await page.check('input[name=jhaAerialUse][value=yes]');
    await page.click('[data-aerial-person="Alex Rivera (Demo)"]');
    await page.click('[data-aerial-person="Jordan Blake (Demo)"]');
  });

  // Demo clock: Wed Sep 30, 2026 3:00 PM in Indianapolis.
  const WED_3PM_ISO = '2026-09-30T19:00:00.000Z';
  await check('L1-L3. Ladder Yes asks who will inspect the ladders, with the same crew picker as aerial lifts', async () => {
    const sec = await text(page, '[data-jha-model="ladder"]');
    assert.ok(sec.includes('Is any ladder use planned or expected today?'));
    await page.check('input[name=jhaLadderUse][value=yes]');
    const panel = await text(page, '#jhaLadderPanel');
    assert.ok(panel.includes('Who will inspect the ladders prior to use?'));
    assert.ok(panel.indexOf('Who will inspect the ladders prior to use?') < panel.indexOf('Which ladder or ladders will be used today?'),
      'the inspector question comes first; the demo-only ladder ID picker sits under it');
    // Same component as the aerial lift inspectors: same chips, same crew list, same container.
    const aerial = await page.$$eval('#jhaAerialRoster [data-aerial-person]', (b) => b.map((x) => x.getAttribute('data-aerial-person')));
    const ladder = await page.$$eval('#jhaLadderRoster [data-ladder-person]', (b) => b.map((x) => x.getAttribute('data-ladder-person')));
    const crew = await page.evaluate(() => (NG.people || []).map((p) => p.name || String(p)).filter(Boolean));
    assert.ok(ladder.length >= 5, 'the job crew list is offered');
    assert.deepEqual(ladder.filter((n) => crew.includes(n)), crew, 'every crew member is offered');
    assert.deepEqual(ladder.filter((n) => !aerial.includes(n)), [], 'the same names as the aerial picker');
    assert.equal(await page.$eval('#jhaLadderRoster', (e) => e.className), await page.$eval('#jhaAerialRoster', (e) => e.className));
    assert.ok(await page.$$eval('#jhaLadderRoster button', (b) => b.every((x) => x.className.includes('jha-crew-chip'))));
    assert.equal(await page.$('#jhaLadderRoster input[type=text], #jhaLadderPanel input[type=number]'), null, 'nothing is typed');
    await page.click('[data-ladder-person="Alex Rivera (Demo)"]');
    await page.click('[data-ladder-person="Jordan Blake (Demo)"]');
    assert.deepEqual(JSON.parse(await val(page, '#jhaLadderInspectors')), ['Alex Rivera (Demo)', 'Jordan Blake (Demo)']);
    assert.equal(await val(page, '#jhaLadderInspectorsAt'), WED_3PM_ISO, 'the pick time is recorded (demo clock)');
    assert.equal(await page.$eval('[data-ladder-person="Alex Rivera (Demo)"]', (b) => b.getAttribute('aria-pressed')), 'true');
    assert.equal(await text(page, '#jhaLadderInspectorsAtNote'), 'Selected Sep 30, 2026 at 3:00 PM');
    await page.click('[data-ladder-person="Jordan Blake (Demo)"]');
    assert.deepEqual(JSON.parse(await val(page, '#jhaLadderInspectors')), ['Alex Rivera (Demo)'], 'tapping again removes a person');
    // No clears the picks and the time; Yes starts fresh.
    await page.check('input[name=jhaLadderUse][value=no]');
    assert.equal(await page.$eval('#jhaLadderPanel', (e) => e.style.display), 'none');
    assert.equal(await val(page, '#jhaLadderInspectors'), '');
    assert.equal(await val(page, '#jhaLadderInspectorsAt'), '');
    const visibleLadderInputs = await page.$$eval('[data-jha-model="ladder"] input, [data-jha-model="ladder"] select, [data-jha-model="ladder"] textarea, [data-jha-model="ladder"] button',
      (x) => x.filter((e) => e.type !== 'hidden' && e.type !== 'radio' && e.offsetParent !== null).length);
    assert.equal(visibleLadderInputs, 0, 'No asks nothing else about ladders');
    await page.check('input[name=jhaLadderUse][value=yes]');
    assert.equal(await val(page, '#jhaLadderInspectors'), '');
    await page.click('[data-ladder-person="Alex Rivera (Demo)"]');
    await page.click('[data-ladder-person="Jordan Blake (Demo)"]');
  });

  await check('L4. Ladder Yes without an inspector cannot be submitted', async () => {
    const p = await open('demo=1&ngform=jha&demonow=' + WED);
    await p.check('input[name=jhaLadderUse][value=yes]');
    await p.click('[data-ladder-opt="LAD-101"]');
    await p.check('input[name=jhaAerialUse][value=no]');
    await fillRequired(p, '#jhaForm');
    const before = await p.evaluate(() => NG.demoJha.store().length);
    assert.equal(await p.evaluate(() => NG.jhaSubmitCheck()), 'Select at least one person who will inspect the ladders prior to use.');
    await p.click('#jhaSubmitBtn'); await p.waitForTimeout(200);
    assert.equal(await p.evaluate(() => NG.demoJha.store().length), before, 'nothing was stored');
    assert.ok(await p.$eval('#jhaLadderRoster', (e) => e.closest('.form-group').classList.contains('error')), 'the question is marked');
    await p.click('[data-ladder-person="Sam Whitfield (Demo)"]');
    assert.equal(await p.evaluate(() => NG.jhaSubmitCheck()), '');
    await p.close();
  });

  await check('3, 5. Ladder choices are the job’s assigned ladders only; no free-text ID', async () => {
    await page.check('input[name=jhaLadderUse][value=yes]');
    assert.ok((await text(page, '#jhaLadderPanel')).includes('Which ladder or ladders will be used today?'));
    const ids = await page.$$eval('[data-ladder-opt]', (b) => b.map((x) => x.getAttribute('data-ladder-opt')));
    assert.deepEqual(ids, ['LAD-101', 'LAD-120', 'LAD-204', 'LAD-317']);
    assert.ok(!ids.includes('LAD-550'), 'a ladder on another job is never offered');
    assert.equal(await page.$('#jhaLadderId'), null, 'there is no free-text Ladder ID field');
    const opt = await text(page, '[data-ladder-opt="LAD-317"]');
    assert.ok(opt.includes('DO NOT USE') && opt.includes('10 ft fiberglass step ladder'));
    assert.ok((await text(page, '[data-ladder-opt="LAD-101"]')).includes('Last inspected Sep 29, 2026'));
    await page.fill('#jhaLadderSearch', '204');
    assert.deepEqual(await page.$$eval('[data-ladder-opt]', (b) => b.map((x) => x.getAttribute('data-ladder-opt'))), ['LAD-204']);
    await page.fill('#jhaLadderSearch', '');
  });

  await check('4, 7-8. Several ladders; each gets its own card with exactly its history', async () => {
    await page.click('[data-ladder-opt="LAD-101"]');
    await page.click('[data-ladder-opt="LAD-204"]');
    assert.deepEqual(await page.$$eval('[data-ladder-card]', (c) => c.map((x) => x.getAttribute('data-ladder-card'))), ['LAD-101', 'LAD-204']);
    const a = await text(page, '[data-ladder-card="LAD-101"]'), b = await text(page, '[data-ladder-card="LAD-204"]');
    assert.ok(a.startsWith('Ladder LAD-101') && a.includes('Alex Rivera (Demo)') && a.includes('Current status'));
    assert.ok(b.includes('Jordan Blake (Demo)') && !b.includes('Alex Rivera (Demo)'), 'no history crosses between ladders');
    assert.ok(a.includes('Inspect for today’s use') && a.includes('Report a defect or unsafe condition'));
    await page.click('[data-ladder-opt="LAD-120"]');
    assert.ok((await text(page, '[data-ladder-card="LAD-120"]')).includes('No previous inspection is recorded for this ladder.'));
    await page.click('[data-ladder-opt="LAD-120"]');
  });

  await check('9-12. Inspect for today’s use: session inspector, automatic time, exact attestation', async () => {
    await page.click('[data-lad-inspect="LAD-101"]');
    const panel = await text(page, '[data-ladder-card="LAD-101"] [data-lad-panel="inspect"]');
    assert.ok(panel.includes('Inspector') && panel.includes('Demo Foreman'));
    assert.ok(panel.includes('Inspection time') && panel.includes('Sep 30, 2026') && panel.includes('set automatically'));
    assert.equal(await page.$$eval('[data-lad-panel="inspect"] input:not([type=checkbox]), [data-lad-panel="inspect"] textarea', (x) => x.length), 0,
      'no editable name, date or time');
    assert.ok(panel.includes('I inspected this ladder before use today and found it safe to use.'));
    assert.equal(await page.$eval('[data-lad-confirm="LAD-101"]', (b) => b.disabled), true, 'Confirm stays disabled until the box is ticked');
    await page.check('[data-lad-attest="LAD-101"]');
    await page.click('[data-lad-confirm="LAD-101"]');
    assert.ok((await text(page, '[data-ladder-card="LAD-101"]')).includes('Confirmed safe for use today · Demo Foreman'));
    const rec = await page.evaluate(() => { const i = NG.demoJha.ladders().inspections; return i[i.length - 1]; });
    assert.equal(rec.inspected_at, '2026-09-30T19:00:00.000Z');
    assert.equal(rec.inspected_by_user_id, 'demo-user-foreman');
    assert.equal(rec.attestation_text, 'I inspected this ladder before use today and found it safe to use.');
    assert.equal(rec.attestation_version, 'ladder-safe-use-v1');
    assert.equal(rec.job_id, 'demo-job-001'); assert.equal(rec.company_id, 'demo-greiner');
    assert.ok(rec.jha_root_id && rec.jha_revision_number === 1, 'linked to the JHA being written');
  });

  await check('10. Signed out: no typed name can stand in for identity', async () => {
    const p = await open('demo=1&ngform=jha&demouser=none&demonow=' + WED);
    await p.check('input[name=jhaLadderUse][value=yes]');
    await p.click('[data-ladder-opt="LAD-101"]');
    await p.click('[data-lad-inspect="LAD-101"]');
    const c = await text(p, '[data-ladder-card="LAD-101"]');
    assert.ok(c.includes('Sign in with your employee access before recording an inspection.'));
    assert.equal(await p.$('[data-ladder-card="LAD-101"] input[type=text]'), null);
    assert.equal(await p.$('[data-lad-confirm="LAD-101"]'), null);
    await p.close();
  });

  await check('13-16. Defect report: hidden until chosen; camera-first photo; acknowledgment', async () => {
    assert.equal(await page.$('[data-ladder-card="LAD-204"] [data-lad-panel="defect"]'), null, 'hidden until selected');
    await page.click('[data-lad-defect="LAD-204"]');
    const panel = await text(page, '[data-ladder-card="LAD-204"]');
    assert.ok(panel.includes('Describe the defect or unsafe condition'));
    assert.ok(panel.includes('I marked or tagged this ladder ‘Do Not Use’ and removed it from service.'));
    assert.ok(!/removed from service\?|Was the ladder removed/.test(panel), 'the old Yes/No question is gone');
    assert.ok(panel.includes('Save defect report') && panel.includes('Cancel defect report') && !panel.includes('Remove defect'));
    const file = await page.$eval('[data-lad-file="LAD-204"]', (f) => ({ accept: f.accept, capture: f.getAttribute('capture'), hidden: f.hidden, visible: f.offsetParent !== null }));
    assert.deepEqual(file, { accept: 'image/*', capture: 'environment', hidden: true, visible: false }, 'native file control stays hidden');
    assert.ok(panel.includes('Take photo'));
    await page.setInputFiles('[data-lad-file="LAD-204"]', photo('a.png'));
    await page.waitForSelector('[data-ladder-card="LAD-204"] .jha-lad-photo img');
    assert.ok((await text(page, '[data-ladder-card="LAD-204"]')).includes('Retake photo'));
    await page.setInputFiles('[data-lad-file="LAD-204"]', photo('b.png'));
    await page.waitForTimeout(200);
    await page.click('[data-lad-rmphoto="LAD-204"]');
    assert.equal(await page.$('[data-ladder-card="LAD-204"] .jha-lad-photo img'), null, 'Remove photo clears it');
    await page.setInputFiles('[data-lad-file="LAD-204"]', photo('c.png'));
    await page.waitForSelector('[data-ladder-card="LAD-204"] .jha-lad-photo img');
    await page.click('[data-lad-savedef="LAD-204"]');
    assert.ok((await text(page, '[data-ladder-card="LAD-204"]')).includes('Describe the defect'), 'description required');
    await page.fill('[data-lad-desc="LAD-204"]', 'Bent rung on step 4');
    await page.click('[data-lad-savedef="LAD-204"]');
    assert.ok((await text(page, '[data-ladder-card="LAD-204"]')).includes('Confirm that you marked or tagged'), 'acknowledgment required');
    await page.check('[data-lad-defack="LAD-204"]');
    await page.click('[data-lad-savedef="LAD-204"]');
    const card = await text(page, '[data-ladder-card="LAD-204"]');
    assert.ok(card.includes('DO NOT USE') && card.includes('Bent rung on step 4'));
    assert.equal(await page.$('[data-lad-inspect="LAD-204"]'), null, '17. a defective ladder cannot be confirmed safe');
    assert.ok(!/resolve|delete defect|clear defect/i.test(card), 'no field-side resolve or delete');
    const rec = await page.evaluate(() => { const i = NG.demoJha.ladders().inspections; return i[i.length - 1]; });
    assert.equal(rec.defect.photo.mime, 'image/jpeg', 'the photo went through the same compression as other inspection photos');
  });

  await check('17. A Do Not Use ladder blocks the JHA until a different ladder is used', async () => {
    await fillRequired(page, '#jhaForm');
    const before = await page.evaluate(() => NG.demoJha.store().length);
    await page.click('#jhaSubmitBtn');
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => NG.demoJha.store().length), before);
    assert.ok(/LAD-204 is marked Do Not Use/.test(await page.locator('body').innerText()));
    await page.click('[data-ladder-opt="LAD-204"]');   // swap it out …
    await page.click('[data-ladder-opt="LAD-120"]');   // … for another assigned ladder
  });

  let submitted;
  await check('31. Submit: review, PDF document and PDF bytes carry the same ladder values', async () => {
    await fillRequired(page, '#jhaForm');
    await page.click('#jhaSubmitBtn');
    await page.waitForSelector('#jhaSubmittedReview', { timeout: 5000 });
    submitted = await page.evaluate(() => { const s = NG.demoJha.store(); return JSON.parse(JSON.stringify(s[s.length - 1])); });
    for (const k of ['jhaLadderSafe', 'jhaLadderWhyNotLift', 'jhaLadderObstacle1', 'jhaLadderGreaterRisk', 'jhaNewRevised', 'jhaLadderId']) {
      assert.ok(!(k in submitted.data), `${k} must not be stored`);
    }
    assert.deepEqual(submitted.data.jhaLadderInspectors, ['Alex Rivera (Demo)', 'Jordan Blake (Demo)']);
    assert.equal(submitted.data.jhaLadderInspectorsAt, WED_3PM_ISO);
    assert.deepEqual(submitted.data.jhaLadderIds, ['LAD-101', 'LAD-120']);
    assert.equal(submitted.data.jhaLadderChecks.find((c) => c.ladder_id === 'LAD-101').todays_check.by, 'Demo Foreman');
    assert.equal(submitted.data.jhaLadderDefects[0].ladder_id, 'LAD-204', 'the defect stays on the JHA after the swap');
    assert.ok(submitted.root_jha_id && submitted.data.jhaLadderChecks[0].todays_check.record_id);
    const review = await reviewPairs(page), doc = await docPairs(page);
    assert.deepEqual(review, doc, 'phone review and the PDF document list the same answers');
    for (const must of ['Who will inspect the ladders prior to use? = Alex Rivera (Demo), Jordan Blake (Demo)',
      'Ladder inspector selected at = Sep 30, 2026 at 3:00 PM',
      'Which ladder or ladders will be used today? = LAD-101, LAD-120',
      'Ladder LAD-101 — Inspection for today’s use = Confirmed safe for use by Demo Foreman · Sep 30, 2026 at 3:00 PM',
      'Ladder LAD-120 — Last inspected = No previous inspection is recorded for this ladder.',
      'Who will conduct the lift inspections? = Alex Rivera (Demo), Jordan Blake (Demo)']) {
      assert.ok(review.includes(must), `review is missing "${must}"`);
    }
    assert.ok(review.some((r) => r.startsWith('Ladder LAD-204 — Defect reported = Bent rung on step 4')));
    if (JSPDF) {
      const pdf = await pdfText(page);
      assert.ok(pdf.startsWith('%PDF'));
      for (const s of ['LAD-101, LAD-120', 'Bent rung on step 4', 'Who will conduct the lift inspections?',
        'Who will inspect the ladders prior to use?', 'Alex Rivera (Demo), Jordan Blake (Demo)', 'Ladder inspector selected at']) {
        assert.ok(pdf.includes(s), `PDF is missing "${s}"`);
      }
      assert.ok(!pdf.includes('one-man scissor lift'));
      assert.ok(pdf.includes('Sep 30, 2026'), 'the PDF header uses the record’s server time');
    }
  });

  await check('6. No assigned ladders: clear message and the JHA cannot be submitted with ladder use', async () => {
    const p = await open('demo=1&ngform=jha&demonow=' + WED);
    await p.evaluate(() => { const r = NG.demoJha.ladders().registry; r.splice(0, r.length); });
    await p.check('input[name=jhaLadderUse][value=yes]');
    assert.equal(await text(p, '#jhaNoLadders'), 'No ladders are assigned to this job. Contact the office before using a ladder.');
    assert.equal(await p.$('#jhaLadderSearch:visible'), null, 'no search box and no free-text fallback');
    await p.check('input[name=jhaAerialUse][value=no]');
    await fillRequired(p, '#jhaForm');
    await p.click('#jhaSubmitBtn'); await p.waitForTimeout(200);
    assert.equal(await p.$('#jhaSubmittedReview'), null, 'blocked');
    await p.close();
  });

  await check('16 (picker). Rows grouped Today / Earlier this workweek; prior week view-only', async () => {
    await page.evaluate(() => window.showView('landing'));
    await page.click('[data-demoform="revisejha"]');
    await page.waitForSelector('[data-revise-root]');
    const v = await text(page, '#reviseJhaView');
    for (const bit of ['Choose a JHA to revise', 'Choose a JHA from this job. Your changes will create a new time-stamped version. The original will not change.',
      'TODAY', 'EARLIER THIS WORKWEEK', 'VIEW ONLY', 'Tap to revise']) {
      assert.ok(v.toUpperCase().includes(bit.toUpperCase()), `picker is missing "${bit}"`);
    }
    assert.ok(!/Create revision/.test(v), 'no separate small action button');
    const row = await page.$eval('[data-revise-root="demo-jha-a"]', (b) => ({ tag: b.tagName, w: b.getBoundingClientRect().width, vw: window.innerWidth }));
    assert.equal(row.tag, 'BUTTON'); assert.ok(row.w >= row.vw - 40, 'rows are full width');
  });

  await check('11, 18. Prior-week JHA is view-only and still shows its original variance answers', async () => {
    await page.click('[data-view-root="demo-jha-e"]');
    const sheet = await text(page, '#jhaSheet');
    assert.ok(sheet.includes("can’t be revised"));
    assert.ok(sheet.includes('Can this work be done safely from a ladder?'));
    assert.ok(sheet.includes('Corridor too narrow for a scissor lift at this location.'));
    await page.click('#jhaSheet [data-sheet="close"]');
    assert.equal(await page.$('[data-revise-root="demo-jha-e"]'), null);
  });

  await check('20. A JHA with three revisions routes to Complete New JHA', async () => {
    const row = await text(page, '[data-capped-root="demo-jha-c"]');
    assert.ok(row.includes('This JHA already has 3 revisions. Start a new JHA to document additional changes.'));
    await page.click('[data-capped-root="demo-jha-c"]');
    assert.ok((await text(page, '#jhaSheet')).includes('Complete New JHA'));
    await page.click('#jhaSheet [data-sheet="close"]');
  });

  await check('19-23. Tapping a JHA opens the populated editor; revision stores an automatic diff', async () => {
    const v1 = await page.evaluate(() => JSON.stringify(NG.demoJha.history('demo-jha-a')));
    await page.click('[data-revise-root="demo-jha-a"]');
    await page.waitForSelector('#jhaRevisionBanner');
    assert.equal(await page.evaluate(() => (document.querySelector('.view.active') || {}).id), 'inspectionJhaView', '19. straight into the editor');
    const banner = await text(page, '#jhaRevisionBanner');
    assert.ok(banner.includes('Revising JHA submitted Sep 30, 2026'));
    assert.ok(banner.includes('Your submission will create Revision 1. The earlier versions will remain unchanged.'));
    assert.equal(await page.$('[data-change-type]'), null, '21. no "What changed?" selector');
    assert.equal(await val(page, '#jhaDescriptionOfWork'), 'Set overhead pipe hangers, Level 2 east corridor', '20. latest values loaded');
    assert.deepEqual(await page.$$eval('[data-ladder-card]', (c) => c.map((x) => x.getAttribute('data-ladder-card'))), ['LAD-101'], 'ladder selection restored');
    assert.deepEqual(await page.$$eval('#jhaLadderRoster [aria-pressed="true"]', (b) => b.map((x) => x.getAttribute('data-ladder-person'))),
      ['Alex Rivera (Demo)'], 'the ladder inspector is restored');
    const pickedAt = await val(page, '#jhaLadderInspectorsAt');
    assert.ok(pickedAt && pickedAt < '2026-09-30T19:00:00.000Z', 'the original pick time is restored');
    assert.equal(await page.isChecked('input[name=jhaAerialUse][value=no]'), true, 'conditional state restored');
    assert.equal(await text(page, '#jhaSubmitBtn'), 'Submit Revision 1');
    await page.fill('#jhaDescriptionOfWork', 'Set overhead pipe hangers, Level 2 east and west corridors');
    await page.fill('#jhaRevNote', 'West corridor opened up after lunch');
    await fillRequired(page, '#jhaForm');
    await page.click('#jhaSubmitBtn');
    const sheet = await text(page, '#jhaSheet');
    assert.ok(sheet.includes('This creates a new, time-stamped version. It does not replace or change the original JHA.'));
    assert.ok(sheet.includes('Description of Work'), 'the computed changes are listed');
    await page.click('#jhaSheet [data-sheet="confirm"]');
    await page.waitForSelector('#jhaSubmittedReview', { timeout: 5000 });
    const hist = await page.evaluate(() => NG.demoJha.history('demo-jha-a'));
    assert.deepEqual(hist.map((h) => h.revision_number), [1, 2]);
    assert.equal(hist[1].previous_revision_id, hist[0].id);
    assert.equal(hist[1].revised_at, '2026-09-30T19:00:00.000Z');
    assert.equal(hist[1].revision_note, 'West corridor opened up after lunch');
    const d = hist[1].revision_diff.find((x) => x.key === 'jhaDescriptionOfWork');
    assert.deepEqual([d.from, d.to], ['Set overhead pipe hangers, Level 2 east corridor', 'Set overhead pipe hangers, Level 2 east and west corridors']);
    assert.equal(JSON.stringify([hist[0]]), JSON.stringify(JSON.parse(v1)), '24. the original is unchanged');
    assert.deepEqual([hist[1].data.jhaLadderInspectors, hist[1].data.jhaLadderInspectorsAt],
      [hist[0].data.jhaLadderInspectors, hist[0].data.jhaLadderInspectorsAt], 'an untouched ladder inspector keeps its pick time');
    assert.ok(!hist[1].revision_diff.some((x) => /^jhaLadderInspectors/.test(x.key)), 'and is not listed as a change');
  });

  await check('L5. Revising a JHA stored before Oct 9 asks for the ladder inspector', async () => {
    await page.evaluate(() => window.showView('landing'));
    await page.evaluate(() => {
      const M = window.JhaModel, s = NG.demoJha.store();
      // Stored the way production stored ladder Yes before this change: no inspector, empty ID lists.
      M.createOriginal(s, { rootId: 'demo-jha-old-ladder', jobId: 'demo-job-001', companyId: 'demo-greiner', by: 'Demo Foreman',
        data: { jhaProjectName: 'Demo Greiner Job', jhaDescriptionOfWork: 'Stored before the ladder inspector question',
          jhaDate: '2026-09-30', jhaStartTime: '07:00', jhaCompleteTime: '15:30', jhaLocation: 'Demo Greiner Job (DEMO-001)',
          jhaAnalysisBy: 'Demo Foreman', jhaPmSupervisor: 'Demo Project Manager', jhaSubcontractors: 'N/A', jhaJobsiteSafety: 'Hard hat.',
          jhaTask1: 'Ladders / Stairways Use', jhaHazard1: 'Falls / Loss of footing', jhaAction1: 'Maintain three points of contact',
          jhaLadderUse: 'yes', jhaLadderIds: [], jhaLadderChecks: [], jhaLadderDefects: [], jhaAerialUse: 'no' },
        crew: { employees: ['Demo Foreman'], groups: [] }, photos: [] }, new Date('2026-09-30T12:00:00.000Z'));
    });
    const old = await page.evaluate(() => JhaModel.jhaSections(NG.demoJha.history('demo-jha-old-ladder')[0].data)
      .flatMap((s) => s.items.map((i) => i.label + ' = ' + i.value)));
    assert.ok(old.includes('Is any ladder use planned or expected today? = Yes'));
    assert.ok(!old.some((r) => /inspect the ladders|inspector selected/.test(r)), 'the old JHA shows no inspector line');
    await page.click('[data-demoform="revisejha"]');
    await page.waitForSelector('[data-revise-root="demo-jha-old-ladder"]');
    await page.click('[data-revise-root="demo-jha-old-ladder"]');
    await page.waitForSelector('#jhaRevisionBanner');
    assert.equal(await page.isChecked('input[name=jhaLadderUse][value=yes]'), true);
    assert.ok((await text(page, '#jhaLadderPanel')).includes('Who will inspect the ladders prior to use?'));
    assert.equal(await page.$$eval('#jhaLadderRoster [aria-pressed="true"]', (b) => b.length), 0, 'nobody is picked yet');
    await page.click('[data-ladder-opt="LAD-101"]');
    await fillRequired(page, '#jhaForm');
    await page.click('#jhaSubmitBtn'); await page.waitForTimeout(200);
    assert.equal(await page.$('#jhaSheet [data-sheet="confirm"]'), null, 'blocked before the confirm sheet');
    assert.deepEqual(await page.evaluate(() => NG.demoJha.history('demo-jha-old-ladder').length), 1);
    await page.click('[data-ladder-person="Morgan Ellis (Demo)"]');
    await page.click('#jhaSubmitBtn');
    await page.click('#jhaSheet [data-sheet="confirm"]');
    await page.waitForSelector('#jhaSubmittedReview', { timeout: 5000 });
    const hist = await page.evaluate(() => NG.demoJha.history('demo-jha-old-ladder'));
    assert.deepEqual(hist[1].data.jhaLadderInspectors, ['Morgan Ellis (Demo)']);
    assert.equal(hist[1].data.jhaLadderInspectorsAt, WED_3PM_ISO);
    assert.ok(!('jhaLadderInspectors' in hist[0].data), 'the stored original is unchanged');
  });

  await check('24. A stale revision is refused and nothing is duplicated', async () => {
    await page.evaluate(() => window.showView('landing'));
    await page.click('[data-demoform="revisejha"]');
    await page.waitForSelector('[data-revise-root="demo-jha-b"]');
    await page.click('[data-revise-root="demo-jha-b"]');
    await page.waitForSelector('#jhaRevisionBanner');
    await page.evaluate(() => {
      const s = NG.demoJha.store(), h = JhaModel.familyHead(s, 'demo-jha-b');
      JhaModel.submitRevision(s, { rootId: 'demo-jha-b', baseVersionId: h.id, jobId: 'demo-job-001',
        companyId: 'demo-greiner', by: 'Other Foreman', data: h.data, crew: h.crew }, new Date(NG.demoJha.clock()));
    });
    await fillRequired(page, '#jhaForm');
    await page.click('#jhaSubmitBtn');
    await page.click('#jhaSheet [data-sheet="confirm"]');
    await page.waitForTimeout(200);
    assert.ok((await text(page, '#jhaSheet')).includes('This JHA was revised after you opened it. Refresh to load the latest version'));
    assert.deepEqual(await page.evaluate(() => NG.demoJha.history('demo-jha-b').map((h) => h.revision_number)), [1, 2, 3]);
    await page.click('#jhaSheet [data-sheet="refresh"]');
    await page.waitForTimeout(200);
    assert.ok((await text(page, '#jhaRevisionBanner')).includes('create Revision 3'), 'refresh loads the latest version');
  });

  await check('18. Revision prefill keeps the reported defect and the Do Not Use ladder', async () => {
    await page.evaluate(() => window.showView('landing'));
    await page.click('[data-demoform="revisejha"]');
    await page.waitForSelector('[data-revise-root="' + submitted.root_jha_id + '"]');
    await page.click('[data-revise-root="' + submitted.root_jha_id + '"]');
    await page.waitForSelector('#jhaRevisionBanner');
    const defects = JSON.parse(await val(page, '#jhaLadderDefects'));
    assert.equal(defects[0].ladder_id, 'LAD-204'); assert.equal(defects[0].description, 'Bent rung on step 4');
    assert.deepEqual(await page.$$eval('[data-ladder-card]', (c) => c.map((x) => x.getAttribute('data-ladder-card'))), ['LAD-101', 'LAD-120']);
    assert.ok((await text(page, '[data-ladder-opt="LAD-204"]')).includes('DO NOT USE'));
    assert.ok((await text(page, '[data-ladder-card="LAD-101"]')).includes('Confirmed safe for use today'), 'today\u2019s check is restored too');
  });

  await check('24. Compliance still counts each family once', async () => {
    const n = await page.evaluate(() => NG.demoJha.compliance());
    const fams = await page.evaluate(() => new Set(NG.demoJha.store().filter((r) => r.work_date === '2026-09-30').map((r) => r.root_jha_id)).size);
    assert.equal(n, fams);
  });

  await check('Weekend: revising routes to Complete New JHA', async () => {
    const p = await open('demo=1&demonow=' + encodeURIComponent('2026-10-03T10:00:00-04:00'));
    await p.click('[data-demoform="revisejha"]');
    await p.waitForSelector('#reviseJhaList [data-new-jha]');
    const v = await text(p, '#reviseJhaView');
    assert.ok(v.includes('JHAs can be revised Monday through Friday.'));
    assert.equal(await p.$('[data-revise-root]'), null);
    await p.click('#reviseJhaList [data-new-jha]');
    assert.equal(await text(p, '#jhaSubmitBtn'), 'Submit JHA');
    await p.close();
  });

  await check('26. Hot Work: type of hot work sits above the description and reaches the PDF', async () => {
    const p = await open('demo=1&ngform=hotwork&demonow=' + WED);
    const labels = await p.$$eval('#hotWorkForm .form-label', (l) => l.map((x) => x.textContent.replace(/\*/g, '').trim()));
    const ti = labels.indexOf('Type of Hot Work Being Performed'), di = labels.indexOf('Description of Work Being Performed');
    assert.ok(ti > -1 && di === ti + 1, 'Type must sit immediately above Description');
    await p.fill('#hotWorkType', 'Welding');
    await fillRequired(p, '#hotWorkForm');
    await p.click('#hotWorkSubmitBtn');
    await p.waitForSelector('#demoSubmitNotice', { timeout: 5000 });
    const items = await p.evaluate(() => NG.demoLastDoc.sections.flatMap((s) => s.items.map((i) => i.label + ' = ' + i.response)));
    assert.ok(items.includes('Type of Hot Work Being Performed = Welding'));
    if (JSPDF) assert.ok((await pdfText(p)).includes('Type of Hot Work Being Performed'));
    await p.close();
  });

  await check("27. Forklift: required Yes/No operator's-manual question reaches the PDF", async () => {
    const p = await open('demo=1&ngform=forklift&demonow=' + WED);
    const row = await text(p, '#forkliftInspectionForm .inspection-checklist-row:has(input[name=fl_chk_operator_manual])');
    assert.ok(row.includes("Manufacturer Operator's Manual Present and Readable") && row.includes('Yes') && row.includes('No'));
    assert.equal(await p.$eval('input[name=fl_chk_operator_manual][value=safe]', (e) => e.required), true);
    await p.evaluate(() => {
      document.querySelectorAll('#forkliftInspectionForm input[type=radio][value=safe]').forEach((r) => { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
    });
    await fillRequired(p, '#forkliftInspectionForm');
    await p.click('#forkliftSubmitBtn');
    await p.waitForSelector('#demoSubmitNotice', { timeout: 5000 });
    const items = await p.evaluate(() => NG.demoLastDoc.sections.flatMap((s) => s.items.map((i) => i.label + ' = ' + i.response)));
    assert.ok(items.includes("Manufacturer Operator's Manual Present and Readable = Yes"), items.join('\n'));
    if (JSPDF) assert.ok((await pdfText(p)).includes('Operator'));
    await p.close();
  });

  const SELECTOR_TEXT = /Foreman Leads Group Talk|Each Employee Completes Individually|USES THIS|Switch demo workflow|employees do not choose|possible future option/;
  await check('25-26, 28-29. Lead phone: assigned Purdue / Fall Protection, attendance + presentation', async () => {
    const p = await open('demo=1&demonow=' + WED);
    await p.click('[data-demoform="toolbox"]');
    const t1 = await text(p, '#toolboxTalkView');
    assert.ok(!SELECTOR_TEXT.test(t1), '25. no workflow selector or its explanations');
    assert.equal(await p.$('[data-tbt-method]'), null);
    assert.equal(await p.$('#tbtTalkPick'), null, '29. the talk is fixed — no picker');
    const role = await text(p, '#tbtRole');
    assert.ok(role.includes('Leading this talk') && role.includes('Fall Protection') && role.includes('Purdue Academic Building'));
    assert.deepEqual(await p.$$eval('.tbt-fmtbtn', (b) => b.map((x) => x.textContent)), ['View Original Document', 'Guided Talk'], '28');
    await p.click('.tbt-fmtbtn:has-text("View Original Document")');
    for (let i = 0; i < 6; i++) { const n = await p.$('#tbtNext:not([disabled])'); if (!n) break; await n.click(); }
    await p.click('#tbtToComplete');
    const t2 = await text(p, '#toolboxTalkView');
    assert.ok(t2.includes('I presented this Toolbox Talk to the people listed above.'), '26. lead sees the presentation attestation');
    assert.ok(t2.includes('Crew present') && t2.includes('Add someone not listed'));
    await p.click('#tbtAll'); await p.check('#tbtPresented'); await p.click('#tbtSubmitLead');
    const rec = await p.evaluate(() => JSON.parse(localStorage.getItem('cs_tbt_mobile_demo_v1')).records.pop());
    assert.equal(rec.kind, 'lead_presentation'); assert.equal(rec.job, 'Purdue Academic Building');
    assert.equal(rec.talkId, 'fall'); assert.equal(rec.present.length, 3);
    assert.ok(typeof rec.engagementSeconds === 'number');
    await p.close();
  });

  await check('27. Participant phone: follow along + own acknowledgment only', async () => {
    const p = await open('demo=1&tbtas=participant&demonow=' + WED);
    await p.click('[data-demoform="toolbox"]');
    const role = await text(p, '#tbtRole');
    assert.ok(role.includes('Following along') && role.includes('led by Demo Lead Foreman') && role.includes('Purdue Academic Building'));
    assert.deepEqual(await p.$$eval('.tbt-fmtbtn', (b) => b.map((x) => x.textContent)), ['View Original Document', 'Guided Talk']);
    await p.click('.tbt-fmtbtn:has-text("Guided Talk")');
    assert.ok((await text(p, '#toolboxTalkView')).includes('I followed this section'), 'section-by-section follow-along');
    const n = await p.evaluate(() => document.querySelectorAll('#tbtSecCount').length ? +document.querySelector('#tbtSecCount').textContent.split(' of ')[1] : 0);
    for (let i = 0; i < n; i++) { await p.check('#tbtSecDone'); const nx = await p.$('#tbtSecNext:not([disabled])'); if (nx) await nx.click(); }
    await p.click('#tbtToComplete');
    const t = await text(p, '#toolboxTalkView');
    assert.ok(t.includes('I followed along with this Toolbox Talk and had the opportunity to ask questions.'));
    assert.ok(!t.includes('I presented this Toolbox Talk'), 'participants never see the presentation attestation');
    assert.equal(await p.$('#tbtAll'), null); assert.equal(await p.$('#tbtManual'), null);
    assert.ok(!SELECTOR_TEXT.test(t));
    await p.check('#tbtAckConfirm'); await p.click('#tbtSubmitAck');
    const rec = await p.evaluate(() => JSON.parse(localStorage.getItem('cs_tbt_mobile_demo_v1')).records.pop());
    assert.equal(rec.kind, 'participant_ack'); assert.equal(rec.employee, 'Alex Rivera (Demo)');
    assert.equal(rec.format, 'guided'); assert.ok(!('present' in rec) && !('presented' in rec), 'an acknowledgment is not a presentation');
    await p.close();
    const peine = await open('demo=1&company=peine&demonow=' + WED);
    await peine.click('[data-demoform="toolbox"]');
    assert.ok(await peine.$('[data-tbt-method]'), "Peine's demo flow is unchanged");
    await peine.close();
  });

  await check('32. No horizontal overflow at 390, 820, 1024 and 1440 px', async () => {
    for (const w of [390, 820, 1024, 1440]) {
      const p = await open('demo=1&demonow=' + WED, w);
      await p.click('[data-demoform="revisejha"]');
      await p.waitForSelector('[data-revise-root]');
      const pick = await p.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
      await p.click('[data-revise-root="demo-jha-a"]');
      await p.waitForSelector('#jhaRevisionBanner');
      await p.check('input[name=jhaAerialUse][value=yes]');
      await p.click('[data-aerial-person="Alex Rivera (Demo)"]');
      await p.click('[data-ladder-opt="LAD-204"]');
      await p.click('[data-lad-defect="LAD-204"]');
      await p.setInputFiles('[data-lad-file="LAD-204"]', photo('w.png'));
      await p.waitForSelector('.jha-lad-photo img');
      const form = await p.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
      await p.click('[data-lad-cancel="LAD-204"]');
      await p.click('[data-ladder-opt="LAD-204"]');
      await fillRequired(p, '#jhaForm');
      await p.click('#jhaSubmitBtn');
      await p.waitForSelector('.jha-sheet');
      const sheet = await p.evaluate(() => { const s = document.querySelector('.jha-sheet'); return s.scrollWidth - s.clientWidth; });
      await p.close();
      const tb = await open('demo=1&tbtas=participant&demonow=' + WED, w);
      await tb.click('[data-demoform="toolbox"]');
      const talk = await tb.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
      await tb.close();
      assert.ok(pick <= 1 && form <= 1 && sheet <= 1 && talk <= 1, `overflow at ${w}px: picker ${pick}, form ${form}, sheet ${sheet}, talk ${talk}`);
    }
  });

  await check('No page errors anywhere in the run', async () => {
    assert.deepEqual(page.errors, []);
  });
} finally {
  await browser.close();
  server.close();
}

await check('30. No request left the machine during the run', async () => {
  assert.deepEqual(offMachine, [], 'blocked requests: ' + offMachine.join(', '));
});

if (failures) { console.log(`JHA runtime verification FAILED (${failures} of ${checks + failures}).`); process.exit(1); }
console.log(`JHA runtime verification passed (${checks} checks${JSPDF ? ', real PDFs rendered offline' : ', PDF bytes not checked: no local jsPDF'}).`);
