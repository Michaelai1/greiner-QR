/* JHA ladder / aerial / revision behavior, Hot Work, Forklift and Toolbox Talk,
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

  await check('Part 1: two entry routes, no New/Revised question, Estimated Time of Completion', async () => {
    const tiles = await page.$$eval('[data-demoform]', (b) => b.map((x) => x.textContent));
    assert.ok(tiles.includes('Complete New JHA') && tiles.includes('Revise Submitted JHA'));
    await newJha(page);
    const form = await text(page, '#jhaForm');
    assert.ok(!/New or Revised/.test(form), 'New or Revised must not be asked');
    assert.ok(form.includes('Estimated Time of Completion') && !/Complete Time/.test(form));
    assert.equal(await page.$('#openJobSiteAnalysisBtn'), null, 'the checklist JHA tile is gone');
  });

  await check('1. Ladder No hides and clears every ladder child field', async () => {
    await page.check('input[name=jhaLadderUse][value=yes]');
    await page.fill('#jhaLadderId', 'LAD-101');
    assert.ok((await val(page, '#jhaLadderInspection')).includes('LAD-101'));
    await page.check('input[name=jhaLadderUse][value=no]');
    assert.equal(await page.isVisible('#jhaLadderPanel'), false);
    assert.equal(await val(page, '#jhaLadderId'), '');
    assert.equal(await val(page, '#jhaLadderInspection'), '');
    assert.equal(await page.$eval('#jhaLadderCard', (e) => e.innerHTML), '');
    assert.equal(await page.$eval('#jhaLadderId', (e) => e.required), false);
  });

  await check('2. Ladder Yes requires a Ladder ID (label and helper text as approved)', async () => {
    await page.check('input[name=jhaLadderUse][value=yes]');
    assert.equal(await page.$eval('#jhaLadderId', (e) => e.required), true);
    const panel = await text(page, '#jhaLadderPanel');
    assert.ok(panel.includes('Ladder ID') && panel.includes('Enter or scan the ID displayed on the ladder.'));
  });

  await check('3. Known ID shows the last inspection and inspector', async () => {
    await page.fill('#jhaLadderId', 'lad-101');
    const card = await text(page, '#jhaLadderCard');
    for (const bit of ['Ladder inspection', 'LAD-101', 'Last inspection date', 'Last inspected by',
      'Alex Rivera (Demo)', 'Inspection status', 'No open defects reported', 'Record inspection']) {
      assert.ok(card.includes(bit), `card is missing "${bit}"`);
    }
    assert.ok(!/approved|OSHA|ready for use|certified|compliant/i.test(card), 'no approval or OSHA claims');
  });

  await check('4. Unknown ID shows no history and never matches another ladder', async () => {
    await page.fill('#jhaLadderId', 'LAD-10');
    const card = await text(page, '#jhaLadderCard');
    assert.ok(card.includes('No inspection history was found for Ladder LAD-10'));
    assert.ok(!card.includes('Alex Rivera'), 'LAD-10 must not pick up LAD-101');
  });

  await check('5. Duplicate ladder IDs fail clearly in the card', async () => {
    await page.evaluate(() => { NG.demoJha.ladders().registry.push({ ladder_id: 'LAD-555', category: 'Ladder' },
      { ladder_id: 'lad-555', category: 'Ladder' }); });
    await page.fill('#jhaLadderId', 'LAD-555');
    const card = await text(page, '#jhaLadderCard');
    assert.ok(card.includes('More than one ladder is registered as LAD-555'));
    assert.ok(!card.includes('Record inspection'), 'no inspection may be recorded against an ambiguous ID');
  });

  await check('6-7. Recording an inspection: signed-in inspector, automatic time, no way to backdate', async () => {
    await page.fill('#jhaLadderId', 'LAD-204');
    await page.click('#jhaLadRecOpen');
    assert.equal(await text(page, '#jhaLadRecWho'), 'Demo Foreman', 'inspector defaults to the signed-in user');
    assert.equal(await page.$('#jhaLadRecWhoInput'), null, 'no name box when the user is known');
    assert.equal(await page.$$eval('#jhaLadRec input[type=date], #jhaLadRec input[type=time], #jhaLadRec input[type=datetime-local]', (x) => x.length), 0,
      'there is no date or time field to backdate with');
    await page.click('#jhaLadRecSave');
    assert.ok((await text(page, '#jhaLadRecErr')).includes('Confirm that you inspected this ladder before use.'));
    await page.check('#jhaLadRecAck');
    await page.click('#jhaLadRecSave');
    const card = await text(page, '#jhaLadderCard');
    assert.ok(card.includes('Demo Foreman'), 'the new inspection names the inspector');
    assert.ok(card.includes('Sep 30, 2026') && card.includes('3:00 PM'), 'the time is the application clock');
    const rec = await page.evaluate(() => { const i = NG.demoJha.ladders().inspections; return i[i.length - 1]; });
    assert.equal(rec.inspected_at, '2026-09-30T19:00:00.000Z');
    assert.equal(rec.defect, null, '8. no defect answer was required');
  });

  await check('8-9. Optional defect: required only once opened, then Do Not Use is shown', async () => {
    await page.click('#jhaLadRecOpen');
    await page.check('#jhaLadRecAck');
    await page.click('#jhaLadRecDefOpen');
    await page.click('#jhaLadRecSave');
    assert.ok((await text(page, '#jhaLadRecErr')).includes('Describe the defect'));
    await page.fill('#jhaLadRecDefDesc', 'Bent rung on step 4');
    await page.click('#jhaLadRecSave');
    assert.ok((await text(page, '#jhaLadRecErr')).includes('removed from service'));
    await page.click('[data-lad-removed="yes"]');
    await page.click('#jhaLadRecSave');
    const card = await text(page, '#jhaLadderCard');
    assert.ok(card.includes('DO NOT USE') && card.includes('Bent rung on step 4'), card);
    await page.fill('#jhaLadderId', 'LAD-317');
    assert.ok((await text(page, '#jhaLadderCard')).includes('DO NOT USE'), 'an existing open defect also shows Do Not Use');
  });

  await check('12-13. Aerial lifts: several responsible people; No clears them', async () => {
    await page.check('input[name=jhaAerialUse][value=yes]');
    const panel = await text(page, '#jhaAerialPanel');
    assert.ok(panel.includes('What competent person or persons will conduct the lift inspections?'));
    assert.ok(panel.includes('Select every person who may conduct an inspection today.'));
    await page.click('[data-aerial-person="Alex Rivera (Demo)"]');
    await page.click('[data-aerial-person="Jordan Blake (Demo)"]');
    assert.deepEqual(JSON.parse(await val(page, '#jhaAerialInspectors')), ['Alex Rivera (Demo)', 'Jordan Blake (Demo)']);
    await page.check('input[name=jhaAerialUse][value=no]');
    assert.equal(await val(page, '#jhaAerialInspectors'), '');
    await page.check('input[name=jhaAerialUse][value=yes]');
    assert.equal(await page.locator('#jhaAerialRoster .is-on').count(), 0, 'selections do not come back after No');
  });

  await check('A Do Not Use ladder cannot be submitted on a JHA', async () => {
    await page.click('[data-aerial-person="Alex Rivera (Demo)"]');
    await page.click('[data-aerial-person="Jordan Blake (Demo)"]');
    await fillRequired(page, '#jhaForm');
    await page.fill('#jhaLadderId', 'LAD-317');
    const before = await page.evaluate(() => NG.demoJha.store().length);
    await page.click('#jhaSubmitBtn');
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => NG.demoJha.store().length), before, 'nothing was submitted');
    assert.ok(/marked Do Not Use/.test(await page.locator('body').innerText()));
  });

  let submitted;
  await check('10, 25. New JHA submits; review, PDF document and PDF bytes carry the same answers', async () => {
    await page.fill('#jhaLadderId', 'LAD-101');
    await fillRequired(page, '#jhaForm');
    await page.click('#jhaSubmitBtn');
    await page.waitForSelector('#jhaSubmittedReview', { timeout: 5000 });
    submitted = await page.evaluate(() => { const s = NG.demoJha.store(); return JSON.parse(JSON.stringify(s[s.length - 1])); });
    for (const k of ['jhaLadderSafe', 'jhaLadderWhyNotLift', 'jhaLadderObstacle1', 'jhaLadderGreaterRisk', 'jhaNewRevised']) {
      assert.ok(!(k in submitted.data), `retired field ${k} must not be stored`);
    }
    assert.equal(submitted.data.jhaLadderId, 'LAD-101');
    assert.deepEqual(submitted.data.jhaAerialInspectors, ['Alex Rivera (Demo)', 'Jordan Blake (Demo)']);
    const review = await reviewPairs(page), doc = await docPairs(page);
    assert.deepEqual(review, doc, 'phone review and the PDF document must list the same answers');
    for (const must of ['Ladder ID = LAD-101', 'Last inspected by = Alex Rivera (Demo)',
      'What competent person or persons will conduct the lift inspections? = Alex Rivera (Demo), Jordan Blake (Demo)',
      'Estimated Time of Completion = 08:00']) {
      assert.ok(review.includes(must), `review is missing "${must}"`);
    }
    if (JSPDF) {
      const pdf = await pdfText(page);
      assert.ok(pdf.startsWith('%PDF'), 'a real PDF was produced');
      for (const s of ['LAD-101', 'Alex Rivera (Demo), Jordan Blake (Demo)', 'Estimated Time of Completion']) {
        assert.ok(pdf.includes(s), `the PDF text is missing "${s}"`);
      }
      assert.ok(!pdf.includes('one-man scissor lift'), 'the PDF must not carry retired questions');
      assert.ok(pdf.includes('Sep 30, 2026'), 'the PDF header uses the record\u2019s server time, not the device clock');
    }
  });

  await check('16. Revision picker groups Today and Earlier this workweek', async () => {
    await page.evaluate(() => { document.querySelector('[data-demoform="revisejha"]') ? document.querySelector('[data-demoform="revisejha"]').click() : null; });
    await page.evaluate(() => window.showView('landing'));
    await page.click('[data-demoform="revisejha"]');
    const v = await text(page, '#reviseJhaView');
    for (const bit of ['Choose a JHA to revise',
      'Choose a JHA from this job. Your changes will create a new time-stamped version. The original will not change.',
      'TODAY', 'EARLIER THIS WORKWEEK', 'Original submitted', 'Latest revision', 'Foreman', 'Crew',
      'Current version', 'Remaining', 'Create revision', 'VIEW ONLY']) {
      assert.ok(v.toUpperCase().includes(bit.toUpperCase()), `picker is missing "${bit}"`);
    }
    const groups = await page.evaluate(() => { const c = NG.demoJha.candidates();
      return { today: c.today.map((x) => x.rootId), earlier: c.earlier.map((x) => x.rootId) }; });
    assert.ok(groups.today.includes('demo-jha-a') && groups.today.includes('demo-jha-b'));
    assert.ok(groups.earlier.includes('demo-jha-c') && groups.earlier.includes('demo-jha-d'));
  });

  await check('11, 18. Prior-week JHA is view-only and still shows its original variance answers', async () => {
    await page.click('[data-view-root="demo-jha-e"]');
    const sheet = await text(page, '#jhaSheet');
    assert.ok(sheet.includes("can’t be revised"));
    assert.ok(sheet.includes('Can this work be done safely from a ladder?'));
    assert.ok(sheet.includes('Corridor too narrow for a scissor lift at this location.'));
    await page.click('#jhaSheet [data-sheet="close"]');
    assert.equal(await page.$('[data-revise-root="demo-jha-e"]'), null, 'no Create revision for a prior-week JHA');
  });

  await check('20. A JHA with three revisions offers Complete New JHA instead', async () => {
    const card = await text(page, '[data-revise-card="demo-jha-c"]');
    assert.ok(card.includes('This JHA already has 3 revisions. Start a new JHA to document additional changes.'));
    assert.ok(card.includes('Complete New JHA') && !card.includes('Create revision'));
    assert.ok(card.includes('No revisions left'));
  });

  await check('14-15, 19, 21-22. Revision prefills the latest version and submits as a new record', async () => {
    const v1 = await page.evaluate(() => JSON.stringify(NG.demoJha.history('demo-jha-a')));
    await page.click('[data-revise-root="demo-jha-a"]');
    const banner = await text(page, '#jhaRevisionBanner');
    assert.ok(banner.includes('Creating Revision 1'));
    assert.ok(banner.includes('Changes apply when this revision is submitted. Earlier versions stay in the history.'));
    assert.equal(await val(page, '#jhaLadderId'), 'LAD-101', '15. Ladder ID restored');
    const card = await text(page, '#jhaLadderCard');
    assert.ok(card.includes('Alex Rivera (Demo)') && card.includes('Last inspection date'), '15. inspection info visible');
    assert.equal(await page.isChecked('input[name=jhaAerialUse][value=no]'), true);
    assert.equal(await text(page, '#jhaSubmitBtn'), 'Submit Revision 1');
    // 14. Same conditional logic on the revision route.
    await page.check('input[name=jhaLadderUse][value=no]');
    assert.equal(await val(page, '#jhaLadderId'), '');
    await page.check('input[name=jhaLadderUse][value=yes]');
    await page.fill('#jhaLadderId', 'LAD-101');
    await fillRequired(page, '#jhaForm');
    await page.click('#jhaSubmitBtn');
    await page.waitForTimeout(150);
    assert.equal(await page.$('#jhaSheet'), null, 'no submit before "What changed?" is answered');
    await page.click('[data-change-type="Hazard or site condition"]');
    await page.fill('#jhaRevNote', 'Ceiling opened up near column C4');
    await page.click('#jhaSubmitBtn');
    const sheet = await text(page, '#jhaSheet');
    assert.ok(sheet.includes('This creates a new record with the current time. It does not replace or backdate the original JHA.'));
    assert.ok(sheet.includes('Hazard or site condition'));
    await page.click('#jhaSheet [data-sheet="confirm"]');
    await page.waitForSelector('#jhaSubmittedReview', { timeout: 5000 });
    const done = await text(page, '#demoSubmitNotice');
    assert.ok(done.includes('Revision 1 submitted. The new version is active as of Sep 30, 2026'));
    const hist = await page.evaluate(() => NG.demoJha.history('demo-jha-a'));
    assert.deepEqual(hist.map((h) => h.revision_number), [1, 2]);
    assert.equal(hist[1].previous_revision_id, hist[0].id);
    assert.equal(hist[1].revised_at, '2026-09-30T19:00:00.000Z');
    assert.equal(hist[1].revision_change_type, 'Hazard or site condition');
    assert.equal(JSON.stringify([hist[0]]), JSON.stringify(JSON.parse(v1)), '22. the original is unchanged');
  });

  await check('23. A stale revision is refused and nothing is duplicated', async () => {
    await page.evaluate(() => window.showView('landing'));
    await page.click('[data-demoform="revisejha"]');
    await page.click('[data-revise-root="demo-jha-b"]');
    // Someone else revises demo-jha-b while this form is open.
    await page.evaluate(() => {
      const s = NG.demoJha.store(), h = JhaModel.familyHead(s, 'demo-jha-b');
      JhaModel.submitRevision(s, { rootId: 'demo-jha-b', baseVersionId: h.id, jobId: 'demo-job-001',
        companyId: 'demo-greiner', by: 'Other Foreman', changeType: 'Crew assignment', data: h.data }, new Date(NG.demoJha.clock()));
    });
    await fillRequired(page, '#jhaForm');
    await page.click('[data-change-type="Work scope"]');
    await page.click('#jhaSubmitBtn');
    await page.click('#jhaSheet [data-sheet="confirm"]');
    await page.waitForTimeout(150);
    const sheet = await text(page, '#jhaSheet');
    assert.ok(sheet.includes('This JHA was revised after you opened it. Refresh to load the latest version'));
    const nums = await page.evaluate(() => NG.demoJha.history('demo-jha-b').map((h) => h.revision_number));
    assert.deepEqual(nums, [1, 2, 3], 'only the other foreman’s revision was added');
    await page.click('#jhaSheet [data-sheet="refresh"]');
    assert.ok((await text(page, '#jhaRevisionBanner')).includes('Creating Revision 3'), 'refresh loads the latest version');
  });

  await check('24. Compliance still counts each family once', async () => {
    const n = await page.evaluate(() => NG.demoJha.compliance());
    const fams = await page.evaluate(() => new Set(NG.demoJha.store().filter((r) => r.work_date === '2026-09-30').map((r) => r.root_jha_id)).size);
    assert.equal(n, fams);
  });

  await check('Weekend: revising routes to Complete New JHA', async () => {
    const p = await open('demo=1&demonow=' + encodeURIComponent('2026-10-03T10:00:00-04:00'));
    await p.click('[data-demoform="revisejha"]');
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

  await check('28. Toolbox Talk: foreman-led for Greiner, foreman picks the week\u2019s talk', async () => {
    const p = await open('demo=1&demonow=' + WED);
    await p.click('[data-demoform="toolbox"]');
    const t = await p.locator('body').innerText();
    assert.ok(t.includes('Greiner currently uses the foreman-led group workflow.'));
    assert.equal(await p.evaluate(() => typeof TBT_MODE === 'undefined' ? null : TBT_MODE), null, 'state stays private');
    // The foreman picks this week's talk; the default is the scheduled one.
    const opts = await p.$$eval('#tbtTalkPick option', (o) => o.map((x) => x.textContent));
    assert.ok(opts.length >= 2 && /\(scheduled\)$/.test(opts[0]), 'Greiner shows the weekly talk chooser');
    await p.selectOption('#tbtTalkPick', '1');
    const title = await p.locator('#tbtBody .tbt-doc-title').innerText();
    assert.equal(title + ' ', opts[1].replace(' (scheduled)', '') + ' ', 'the chosen talk is the one presented');
    await p.close();
    const peine = await open('demo=1&company=peine&demonow=' + WED);
    await peine.click('[data-demoform="toolbox"]');
    assert.equal(await peine.$('#tbtTalkPick'), null, "Peine's scheduled workflow is unchanged");
    await peine.close();
  });

  await check('29. No horizontal overflow at 390, 820, 1024 and 1440 px', async () => {
    for (const w of [390, 820, 1024, 1440]) {
      const p = await open('demo=1&demonow=' + WED, w);
      await p.click('[data-demoform="revisejha"]');
      const pick = await p.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
      await p.click('[data-revise-root="demo-jha-a"]');
      await p.check('input[name=jhaAerialUse][value=yes]');
      await p.click('[data-aerial-person="Alex Rivera (Demo)"]');
      await p.fill('#jhaLadderId', 'LAD-317');
      await p.click('#jhaLadRecOpen'); await p.click('#jhaLadRecDefOpen');
      const form = await p.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
      await p.fill('#jhaLadderId', 'LAD-101');
      await fillRequired(p, '#jhaForm');
      await p.click('[data-change-type="Work scope"]');
      await p.click('#jhaSubmitBtn');
      const sheet = await p.evaluate(() => { const s = document.querySelector('.jha-sheet'); return s.scrollWidth - s.clientWidth; });
      assert.ok(pick <= 1 && form <= 1 && sheet <= 1, `overflow at ${w}px: picker ${pick}, form ${form}, sheet ${sheet}`);
      await p.close();
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
