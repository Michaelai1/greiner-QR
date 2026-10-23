/* Revised JHA window (Tony, Oct 21 2026):
 *   "Instead of only allowing 3 revisions now allow them up to the end of the
 *    week from the original submission. Example: original JHA sent on Monday
 *    now they can do revisions on that same JHA until the 6 PM Friday. If the
 *    original was submitted on Wednesday they still only have until that Friday."
 *
 * "End of the week" = 6:00 PM Indianapolis local time on the Friday of the ISO
 * week (Monday to Sunday) of the ORIGINAL submission, DST-safe. The revision
 * count no longer limits anything.
 *
 * Part 1 drives the shared JHA model in Node (and once more in a child process
 * with a different system time zone). Part 2 drives the phone in WebKit at
 * 390 px in demo mode: nothing leaves the machine, nothing is recorded.
 * Needs playwright-webkit (PLAYWRIGHT_NODE_MODULES) for part 2.
 * Optional: SCREENS_DIR (save review screenshots), JSPDF_PATH (local jsPDF).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const ROOT = path.resolve(new URL('../', import.meta.url).pathname);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const modelSrc = html.slice(html.indexOf('/* JHA-MODEL:BEGIN'), html.indexOf('/* JHA-MODEL:END */'));
function loadModel() { const c = vm.createContext({}); vm.runInContext(modelSrc, c); return c.JhaModel; }

/* Child mode: print deadlines computed under whatever TZ the parent set. */
if (process.argv[2] === '--child') {
  const M = loadModel();
  const out = ['2026-10-19T11:00:00Z', '2026-10-21T11:00:00Z', '2026-11-01T15:00:00Z', '2026-11-02T12:00:00Z', '2026-03-09T11:00:00Z']
    .map((x) => M.revisionDeadline(x));
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

const M = loadModel();
let checks = 0, failures = 0;
async function check(name, fn) {
  try { await fn(); checks++; console.log(`  ok  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${name}\n       ${String(e.message).split('\n').join('\n       ')}`); }
}
const iso = (s) => new Date(s).toISOString();
// Week of Mon Oct 19 - Sun Oct 25, 2026 (EDT, UTC-4).
const MON = '2026-10-19', WED = '2026-10-21', FRI = '2026-10-23', SAT = '2026-10-24', SUN = '2026-10-25';
const FRI_6PM = iso(`${FRI}T18:00:00-04:00`);
const base = { jhaDescriptionOfWork: 'Hang pipe', jhaLadderUse: 'no', jhaAerialUse: 'no' };
function fam(store, rootId, origAt, revs = []) {
  M.createOriginal(store, { rootId, jobId: 'j1', companyId: 'c1', by: 'Demo Foreman', data: base }, origAt);
  for (const when of revs) {
    const h = M.familyHead(store, rootId);
    const r = M.submitRevision(store, { rootId, baseVersionId: h.id, jobId: 'j1', companyId: 'c1', by: 'Demo Foreman',
      data: Object.assign({}, h.data, { jhaDescriptionOfWork: 'v' + (h.revision_number + 1) }) }, when);
    if (!r.ok) return r;
  }
  return { ok: true };
}
const elig = (store, rootId, now) => M.reviseEligibility(store, rootId, { now, jobId: 'j1', companyId: 'c1' });

console.log('Part 1: the rule (shared JHA model)');
await check('the rule is one object: no count limit, Friday 6:00 PM, Indianapolis', () => {
  assert.equal(M.JHA_REVISION_RULES.maxRevisions, null);
  assert.deepEqual(JSON.parse(JSON.stringify(M.JHA_REVISION_RULES.deadline)), { isoWeekday: 5, hour: 18, minute: 0 });
  assert.equal(M.JHA_REVISION_RULES.timeZone, 'America/Indiana/Indianapolis');
});
await check('Monday original: open until Friday 5:59:59 PM, closed at Friday 6:00 PM', () => {
  const s = []; fam(s, 'mon', iso(`${MON}T07:00:00-04:00`));
  assert.equal(M.revisionDeadline(iso(`${MON}T07:00:00-04:00`)), FRI_6PM);
  assert.equal(elig(s, 'mon', iso(`${MON}T07:01:00-04:00`)).ok, true, 'Monday right after');
  assert.equal(elig(s, 'mon', iso(`${WED}T12:00:00-04:00`)).ok, true, 'Wednesday');
  assert.equal(elig(s, 'mon', iso(`${FRI}T17:59:59-04:00`)).ok, true, 'Friday 5:59:59 PM');
  const c = elig(s, 'mon', FRI_6PM);
  assert.equal(c.ok, false); assert.equal(c.code, 'window-closed', 'Friday 6:00 PM');
  assert.equal(c.message, 'This JHA could be revised until Fri, Oct 23, 6:00 PM (6:00 PM Friday of the week it was submitted). That time has passed. You can view it or start a new JHA.');
});
await check('Wednesday original: still only until THAT Friday 6:00 PM (not five days later)', () => {
  const s = []; fam(s, 'wed', iso(`${WED}T07:00:00-04:00`));
  assert.equal(elig(s, 'wed', iso(`${WED}T07:00:00-04:00`)).deadline, FRI_6PM);
  assert.equal(elig(s, 'wed', iso(`${FRI}T17:59:00-04:00`)).ok, true);
  assert.equal(elig(s, 'wed', FRI_6PM).code, 'window-closed');
  assert.equal(elig(s, 'wed', iso('2026-10-26T09:00:00-04:00')).code, 'window-closed', 'next Monday');
});
await check('Friday original before 6 PM: revisable until 6:00 PM that day', () => {
  const s = []; fam(s, 'fri', iso(`${FRI}T17:30:00-04:00`));
  assert.equal(elig(s, 'fri', iso(`${FRI}T17:59:00-04:00`)).ok, true);
  assert.equal(elig(s, 'fri', FRI_6PM).code, 'window-closed');
});
await check('Friday-after-6 PM original: never revisable (its deadline came first)', () => {
  const s = []; fam(s, 'late', iso(`${FRI}T18:00:00-04:00`)); fam(s, 'later', iso(`${FRI}T21:15:00-04:00`));
  for (const id of ['late', 'later']) {
    assert.equal(elig(s, id, iso(`${FRI}T21:30:00-04:00`)).code, 'after-deadline', id);
    assert.equal(elig(s, id, iso('2026-10-26T09:00:00-04:00')).code, 'after-deadline', id + ' next Monday');
  }
  assert.match(elig(s, 'late', iso(`${FRI}T21:30:00-04:00`)).message, /submitted after 6:00 PM Friday of its week, so it can’t be revised/);
});
await check('Saturday: nothing from that week is revisable; Saturday/Sunday originals are past their window', () => {
  const s = []; fam(s, 'mon', iso(`${MON}T07:00:00-04:00`)); fam(s, 'sat', iso(`${SAT}T09:00:00-04:00`)); fam(s, 'sun', iso(`${SUN}T09:00:00-04:00`));
  assert.equal(elig(s, 'mon', iso(`${SAT}T10:00:00-04:00`)).code, 'window-closed');
  assert.equal(elig(s, 'sat', iso(`${SAT}T10:00:00-04:00`)).code, 'after-deadline');
  assert.equal(elig(s, 'sun', iso(`${SUN}T10:00:00-04:00`)).code, 'after-deadline');
  assert.equal(M.revisionDeadline(iso(`${SUN}T09:00:00-04:00`)), FRI_6PM, 'Sunday belongs to the ISO week that started Monday');
  const c = M.revisionCandidates(s, { now: iso(`${SAT}T10:00:00-04:00`), jobId: 'j1', companyId: 'c1' });
  assert.equal(c.windowOpen, false); assert.equal(c.today.length + c.earlier.length, 0); assert.equal(c.hiddenCount, 3);
});
await check('the revision count no longer limits: ten revisions Monday to Friday all succeed', () => {
  const s = [];
  const times = ['08', '09', '10', '11', '12', '13', '14', '15', '16', '17'].map((h, i) =>
    iso(`${['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', FRI][Math.floor(i / 2)]}T${h}:00:00-04:00`));
  const r = fam(s, 'many', iso(`${MON}T07:00:00-04:00`), times);
  assert.equal(r.ok, true, 'refused: ' + r.code);
  assert.deepEqual(M.familyVersions(s, 'many').map((v) => v.revision_number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  const e = elig(s, 'many', iso(`${FRI}T17:30:00-04:00`));
  assert.equal(e.ok, true); assert.equal(e.remaining, null); assert.equal(e.nextNumber, 11);
  const late = M.submitRevision(s, { rootId: 'many', baseVersionId: e.head.id, jobId: 'j1', companyId: 'c1', by: 'F', data: base }, FRI_6PM);
  assert.equal(late.ok, false); assert.equal(late.code, 'window-closed'); assert.equal(s.length, 11, 'nothing written after 6 PM');
});
await check('a revision keeps the ORIGINAL submission time; the deadline never moves with later revisions', () => {
  const s = []; fam(s, 'm', iso(`${MON}T07:00:00-04:00`), [iso(`${FRI}T17:00:00-04:00`)]);
  const head = M.familyHead(s, 'm');
  assert.equal(head.original_submitted_at, iso(`${MON}T07:00:00-04:00`));
  assert.equal(elig(s, 'm', iso(`${FRI}T17:59:00-04:00`)).deadline, FRI_6PM);
  assert.equal(elig(s, 'm', FRI_6PM).code, 'window-closed');
});
await check('DST-safe: EST weeks close at 23:00 UTC, EDT weeks at 22:00 UTC; Sunday Nov 1 (fall back) belongs to the EDT week', () => {
  assert.equal(M.revisionDeadline(iso('2026-11-02T07:00:00-05:00')), '2026-11-06T23:00:00.000Z', 'first EST week');
  assert.equal(M.revisionDeadline(iso('2026-11-01T10:00:00-05:00')), '2026-10-30T22:00:00.000Z', 'Sun Nov 1 -> Fri Oct 30 6 PM EDT');
  assert.equal(M.revisionDeadline(iso('2026-03-09T07:00:00-04:00')), '2026-03-13T22:00:00.000Z', 'first EDT week');
  assert.equal(M.revisionDeadline(iso('2026-03-08T10:00:00-04:00')), '2026-03-06T23:00:00.000Z', 'Sun Mar 8 (spring forward) -> Fri Mar 6 6 PM EST');
  assert.equal(M.indyWallTime('2026-11-06', 18, 0), '2026-11-06T23:00:00.000Z');
});
await check('the deadline does not depend on the phone’s own time zone', () => {
  const want = JSON.stringify(['2026-10-23T22:00:00.000Z', '2026-10-23T22:00:00.000Z', '2026-10-30T22:00:00.000Z', '2026-11-06T23:00:00.000Z', '2026-03-13T22:00:00.000Z']);
  for (const tz of ['UTC', 'Pacific/Auckland', 'America/Los_Angeles']) {
    const got = execFileSync(process.execPath, [new URL(import.meta.url).pathname, '--child'], { env: { ...process.env, TZ: tz } }).toString();
    assert.equal(got, want, tz);
  }
});

/* ---------------- Part 2: the phone, WebKit at 390 px ---------------- */
const req = createRequire(path.join(process.env.PLAYWRIGHT_NODE_MODULES || ROOT, 'noop.js'));
let webkit;
try { ({ webkit } = req('playwright-webkit')); } catch {
  console.log(`Revised JHA window: ${checks} model checks${failures ? `, ${failures} FAILED` : ' passed'}; browser part skipped (set PLAYWRIGHT_NODE_MODULES).`);
  process.exit(failures ? 1 : 0);
}
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
const offMachine = [];
const browser = await webkit.launch();
async function open(now) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
    if (/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\//.test(u)) return JSPDF ? r.fulfill({ body: JSPDF, contentType: 'application/javascript' }) : r.abort();
    offMachine.push(u); return r.abort();
  });
  await page.goto(BASE + '?demo=1&demonow=' + encodeURIComponent(now));
  await page.waitForTimeout(400);
  return page;
}
const text = (p, sel) => p.locator(sel).innerText();
async function shot(p, name, top) {
  if (!SHOTS) return;
  if (top) await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(150);
  await p.screenshot({ path: path.join(SHOTS, name) });
}
// A fictional original JHA placed at a chosen time (the demo store is in-page memory).
async function inject(p, rootId, at, desc) {
  await p.evaluate(([rootId, at, desc]) => {
    JhaModel.createOriginal(NG.demoJha.store(), { rootId, jobId: 'demo-job-001', companyId: 'demo-greiner', by: 'Demo Foreman',
      data: { jhaProjectName: 'Demo Greiner Job', jhaDescriptionOfWork: desc, jhaDate: at.slice(0, 10), jhaStartTime: '07:00',
        jhaCompleteTime: '15:30', jhaLocation: 'Demo Greiner Job (DEMO-001)', jhaAnalysisBy: 'Demo Foreman',
        jhaPmSupervisor: 'Demo Project Manager', jhaSubcontractors: 'N/A', jhaJobsiteSafety: 'Hard hat, glasses, gloves.',
        jhaTask1: 'Material Handling', jhaHazard1: 'Cuts, abrasions, and lacerations', jhaAction1: 'Cut-resistant gloves',
        jhaLadderUse: 'no', jhaAerialUse: 'no' },
      crew: { employees: ['Demo Foreman', 'Alex Rivera (Demo)'], groups: [] }, photos: [] }, new Date(at));
  }, [rootId, at, desc]);
}
async function openPicker(p) {
  await p.evaluate(() => window.showView('landing'));
  await p.click('[data-demoform="revisejha"]');
  await p.waitForTimeout(250);
}
async function fillRequired(p) {
  for (let pass = 0; pass < 3; pass++) await p.evaluate(() => {
    const form = document.querySelector('#jhaForm'); const seen = {};
    form.querySelectorAll('[required]').forEach((el) => {
      if (el.offsetParent === null) return;
      if (el.type === 'radio') { if (seen[el.name]) return; seen[el.name] = 1; if (![...form.querySelectorAll(`input[name="${el.name}"]`)].some((x) => x.checked)) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); } return; }
      if (el.type === 'checkbox') { if (!el.checked) el.click(); return; }
      if (el.value) return;
      if (el.tagName === 'SELECT') { const o = [...el.options].find((x) => x.value); if (o) { el.value = o.value; el.dispatchEvent(new Event('change', { bubbles: true })); } return; }
      el.value = el.type === 'time' ? '08:00' : el.type === 'date' ? '2026-10-23' : el.type === 'number' ? '1' : 'QA ' + (el.name || el.id);
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}
async function submitRevisionVia(p, rootId, wantLabel, bannerShot) {
  await p.click(`[data-revise-root="${rootId}"]`);
  await p.waitForSelector('#jhaRevisionBanner');
  if (bannerShot) await shot(p, bannerShot, true);
  const banner = await text(p, '#jhaRevisionBanner');
  assert.equal(await text(p, '#jhaSubmitBtn'), 'Submit ' + wantLabel);
  await fillRequired(p);
  await p.click('#jhaSubmitBtn');
  await p.waitForSelector('#jhaSheet [data-sheet="confirm"]', { timeout: 5000 });
  await p.click('#jhaSheet [data-sheet="confirm"]');
  await p.waitForSelector('#jhaSubmittedReview', { timeout: 5000 });
  return banner;
}
const overflow = (p) => p.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);

console.log('Part 2: the phone (WebKit, 390 px, demo mode)');
try {
  await check('Wednesday 3 PM: a Wednesday JHA shows "Revise until Fri, Oct 23, 6:00 PM"', async () => {
    const p = await open(`${WED}T15:00:00-04:00`);
    await inject(p, 'wed-orig', iso(`${WED}T07:00:00-04:00`), 'Set pump pad anchors, Mechanical Room 302');
    await openPicker(p);
    const row = await text(p, '[data-revise-root="wed-orig"]');
    assert.ok(row.includes('Revise until Fri, Oct 23, 6:00 PM'), row);
    assert.ok(!/revisions? left/.test(await text(p, '#reviseJhaView')), 'no count left shown');
    assert.ok((await overflow(p)) <= 1, 'no horizontal overflow');
    await shot(p, 'item1-01-picker-wednesday.png');
    assert.deepEqual(p.errors, []); await p.close();
  });

  await check('Friday 5:30 PM: a Monday JHA and a JHA with 3 revisions are both still revisable; Revision 4 and Revision 5 submit', async () => {
    const p = await open(`${FRI}T17:30:00-04:00`);
    await inject(p, 'mon-orig', iso(`${MON}T07:00:00-04:00`), 'Rough-in domestic water, Level 1 restrooms');
    await openPicker(p);
    assert.ok((await text(p, '[data-revise-root="mon-orig"]')).includes('Revise until Fri, Oct 23, 6:00 PM'));
    const c = await text(p, '[data-revise-root="demo-jha-c"]');
    assert.ok(c.includes('Revision 3') && c.includes('Revise until Fri, Oct 23, 6:00 PM'), c);
    assert.equal(await p.$('[data-capped-root]'), null, 'nothing is capped');
    await shot(p, 'item1-02-picker-friday-530pm.png');
    const banner = await submitRevisionVia(p, 'demo-jha-c', 'Revision 4', 'item1-03-revision4-editor-banner.png');
    assert.ok(banner.includes('Your submission will create Revision 4.') && banner.includes('This JHA can be revised until Fri, Oct 23, 6:00 PM.'), banner);
    await shot(p, 'item1-03b-revision4-submitted.png', true);
    await openPicker(p);
    await submitRevisionVia(p, 'demo-jha-c', 'Revision 5');
    const nums = await p.evaluate(() => NG.demoJha.history('demo-jha-c').map((h) => h.revision_number));
    assert.deepEqual(nums, [1, 2, 3, 4, 5, 6], 'original + five revisions');
    await submitRevisionVia(p, 'mon-orig', 'Revision 1').catch(async () => { await openPicker(p); return submitRevisionVia(p, 'mon-orig', 'Revision 1'); });
    assert.deepEqual(await p.evaluate(() => NG.demoJha.history('mon-orig').map((h) => h.revision_number)), [1, 2], 'the Monday JHA took a revision on Friday');
    assert.deepEqual(p.errors, []); await p.close();
  });

  await check('Friday 6:00 PM: the window has closed; the Monday JHA is view-only and says why', async () => {
    const p = await open(`${FRI}T18:00:00-04:00`);
    await inject(p, 'mon-orig', iso(`${MON}T07:00:00-04:00`), 'Rough-in domestic water, Level 1 restrooms');
    await openPicker(p);
    const v = await text(p, '#reviseJhaView');
    assert.ok(v.includes('JHAs can be revised until 6:00 PM Friday of the week they were first submitted.'), v);
    assert.equal(await p.$('[data-revise-root]'), null, 'nothing is revisable');
    assert.ok(await p.$('[data-view-root="mon-orig"]'), 'the Monday JHA is listed view-only');
    await shot(p, 'item1-04-friday-6pm-closed.png');
    await p.click('[data-view-root="mon-orig"]');
    assert.ok((await text(p, '#jhaSheet')).includes('can’t be revised'));
    // Even a direct attempt through the source is refused, and nothing is written.
    const r = await p.evaluate(() => {
      const s = NG.demoJha.store(), h = JhaModel.familyHead(s, 'mon-orig');
      return JhaModel.submitRevision(s, { rootId: 'mon-orig', baseVersionId: h.id, jobId: 'demo-job-001', companyId: 'demo-greiner', by: 'X', data: h.data }, new Date(NG.demoJha.clock()));
    });
    assert.equal(r.code, 'window-closed');
    assert.equal(await p.evaluate(() => NG.demoJha.history('mon-orig').length), 1);
    assert.deepEqual(p.errors, []); await p.close();
  });

  await check('Friday 6:30 PM: a JHA first submitted at 6:15 PM Friday cannot be revised', async () => {
    const p = await open(`${FRI}T18:30:00-04:00`);
    await inject(p, 'late-fri', iso(`${FRI}T18:15:00-04:00`), 'Evening concrete pour support');
    await openPicker(p);
    assert.equal(await p.$('[data-revise-root="late-fri"]'), null);
    assert.ok(await p.$('[data-view-root="late-fri"]'));
    assert.equal(await p.evaluate(() => JhaModel.reviseEligibility(NG.demoJha.store(), 'late-fri', { now: new Date(NG.demoJha.clock()), jobId: 'demo-job-001' }).code), 'after-deadline');
    assert.deepEqual(p.errors, []); await p.close();
  });

  await check('Saturday: nothing is revisable; Complete New JHA is offered', async () => {
    const p = await open(`${SAT}T10:00:00-04:00`);
    await inject(p, 'mon-orig', iso(`${MON}T07:00:00-04:00`), 'Rough-in domestic water, Level 1 restrooms');
    await openPicker(p);
    await p.waitForSelector('#reviseJhaList [data-new-jha]');
    assert.equal(await p.$('[data-revise-root]'), null);
    assert.ok(await p.$('[data-view-root="mon-orig"]'));
    await shot(p, 'item1-05-saturday-closed.png');
    await p.click('#reviseJhaList [data-new-jha]');
    assert.equal(await text(p, '#jhaSubmitBtn'), 'Submit JHA');
    assert.deepEqual(p.errors, []); await p.close();
  });

  await check('Next Monday: last week’s JHAs stay closed; the picker is open for this week', async () => {
    const p = await open('2026-10-26T09:00:00-04:00');
    await inject(p, 'mon-orig', iso(`${MON}T07:00:00-04:00`), 'Rough-in domestic water, Level 1 restrooms');
    await openPicker(p);
    assert.equal(await p.$('[data-revise-root="mon-orig"]'), null);
    assert.ok(await p.$('[data-view-root="mon-orig"]'));
    assert.ok(await p.$('[data-revise-root="demo-jha-a"]'), 'this week’s JHA is revisable');
    assert.ok((await text(p, '[data-revise-root="demo-jha-a"]')).includes('Revise until Fri, Oct 30, 6:00 PM'));
    assert.deepEqual(p.errors, []); await p.close();
  });
} finally { await browser.close(); server.close(); }

await check('nothing left the machine', () => { assert.deepEqual(offMachine, []); });
if (failures) { console.log(`Revised JHA window verification FAILED (${failures} failing, ${checks} passing).`); process.exit(1); }
console.log(`Revised JHA window verification passed (${checks} checks${SHOTS ? ', screenshots saved' : ''}; nothing sent or recorded).`);
