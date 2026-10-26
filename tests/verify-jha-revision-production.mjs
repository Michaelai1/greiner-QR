/* Revised JHA, production path (JHA-only release 2026-10-22), in a real
 * browser (WebKit) at 390 px. Forklift is left exactly as live in this build
 * (one check proves it).
 *
 * Every server call is answered inside this test, exactly per the release
 * contract (~/.nextgen-hq/coordinator/run-2026-10-22-release/CONTRACT.md):
 *   cs_jha_revisable(p_token)                                  -> [{id, submitted_at, inspector_name, head_revision, deadline_at, window_open}]
 *   cs_jha_current(p_token, p_original)                        -> {original, head, deadline_at, window_open, window_reason}
 *   cs_jha_revise(p_token, p_original, p_fields, p_photos, p_has_defects, p_defect_count, p_client_key)
 *                                                              -> {ok, revision_id, revision_number, deadline_at, submitted_at} | duplicate:true
 *   cs_jha_revision_attach_pdf(p_token, p_revision_id, p_pdf_path)
 *   edge field-pdf {action:'upload', ticket, id, pdf_base64}  (unchanged edge function)
 * The stub server plays the rule: 6:00 PM Indianapolis on the Friday of the
 * original's ISO week, on the SERVER clock; weekend or Friday-after-6 PM
 * originals have no window (provisional, flagged for Tony).
 *
 * Fictional people and jobs only. Nothing leaves the machine: anything that is
 * not this test's own server, the local jsPDF, or a stubbed Supabase call is
 * blocked and recorded, and the last check asserts that list is empty.
 *
 * Needs playwright-webkit (PLAYWRIGHT_NODE_MODULES). JSPDF_PATH for the PDF.
 * SCREENSHOT_DIR saves screenshots.
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
  console.log('Revised JHA production verification skipped (set PLAYWRIGHT_NODE_MODULES).');
  process.exit(0);
}
const SHOTS = process.env.SCREENSHOT_DIR || null;
const JSPDF_PATH = process.env.JSPDF_PATH ||
  path.resolve(ROOT, '../greiner-dashboard-tony-feedback-2026-10-02/tools/vendor/jspdf.umd.min.js');
const JSPDF = fs.existsSync(JSPDF_PATH) ? fs.readFileSync(JSPDF_PATH) : null;
if (!JSPDF) { console.log('Revised JHA production verification needs JSPDF_PATH (local jsPDF).'); process.exit(1); }

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

/* ---------------- the server, as this test plays it ---------------- */
const TZ = 'America/Indiana/Indianapolis';
const JOB = 'job-c900-test', OTHER_JOB = 'job-c901-other';
const USER = { id: 'user-lead-test', name: 'Robin Testlead (Test)' };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC';
// Times (UTC). Week of Mon Oct 19 2026; Friday 6:00 PM EDT = 22:00Z.
const T = {
  MON: '2026-10-19T11:05:00.000Z',          // Mon 7:05 AM
  WED: '2026-10-21T10:50:00.000Z',          // Wed 6:50 AM
  WED_NOON: '2026-10-21T16:00:00.000Z',     // Wed 12:00 PM (server now)
  FRI_559: '2026-10-23T21:59:00.000Z',      // Fri 5:59 PM
  FRI_6PM: '2026-10-23T22:00:00.000Z',      // Fri 6:00:00 PM
  PREV_FRI_LATE: '2026-10-16T23:30:00.000Z',// prior Fri 7:30 PM (no window)
  SAT: '2026-10-24T11:00:00.000Z'           // Sat 7:00 AM (no window)
};
const DEADLINE = T.FRI_6PM;

function indyParts(iso) {
  const p = {};
  new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(iso)).forEach((x) => { p[x.type] = x.value; });
  return p;
}
// The provisional rule, as the server would apply it (returns ISO or null).
function deadlineFor(iso) {
  const p = indyParts(iso), dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1;
  if (dow >= 6) return null;
  if (dow === 5 && +p.hour >= 18) return null;
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + (5 - dow)));
  const ymd = d.toISOString().slice(0, 10);
  for (const off of ['-04:00', '-05:00']) {
    const c = new Date(`${ymd}T18:00:00${off}`);
    if (indyParts(c.toISOString()).hour === '18') return c.toISOString();
  }
  return null;
}

let BASE_FIELDS = null;   // what a real new JHA sends, captured in the first check
let STATE, seq = 0;
function jhaFields(desc, extra = {}) {
  const f = JSON.parse(JSON.stringify(BASE_FIELDS || {}));
  delete f.doc;
  return Object.assign(f, { jhaDescriptionOfWork: desc }, extra, { doc: { title: 'Job Hazard Analysis', sections: [] } });
}
function reset(now = T.WED_NOON) {
  STATE = {
    now,
    originals: [
      { id: '11111111-1111-4111-8111-000000000001', company: 'greiner', job_id: JOB, form_type: 'jha', submitted_at: T.MON,
        inspector_name: 'Morgan Fieldtest (Test)',
        fields: jhaFields('Monday original: set hangers, Level 2 east', {
          jhaTask4: 'Material Handling', jhaHazard4: 'Back strain', jhaAction4: 'Team lift over 50 lb',
          jhaHazard1_photos: [PNG],
          jhaCrewData: JSON.stringify({ employees: ['Morgan Fieldtest (Test)', 'Casey Crewtest (Test)'], groups: [] }) }) },
      { id: '11111111-1111-4111-8111-000000000002', company: 'greiner', job_id: JOB, form_type: 'jha', submitted_at: T.WED,
        inspector_name: 'Robin Testlead (Test)', fields: jhaFields('Wednesday original: condenser piping, Room 302') },
      { id: '11111111-1111-4111-8111-000000000003', company: 'greiner', job_id: OTHER_JOB, form_type: 'jha', submitted_at: T.WED,
        inspector_name: 'Other Job Person (Test)', fields: jhaFields('Another job') },
      { id: '11111111-1111-4111-8111-000000000004', company: 'greiner', job_id: JOB, form_type: 'jha', submitted_at: T.PREV_FRI_LATE,
        inspector_name: 'Morgan Fieldtest (Test)', fields: jhaFields('Prior Friday evening') },
      { id: '11111111-1111-4111-8111-000000000005', company: 'greiner', job_id: JOB, form_type: 'hot_work_permit', submitted_at: T.WED,
        inspector_name: 'Robin Testlead (Test)', fields: { hw: 1 } }
    ],
    revisions: [],
    uploads: [], attaches: [], submits: [], edgeUploads: [],
    abortRevise: null,          // 'before' (request lost) | 'after' (stored, answer lost)
    edgeFailOnce: false, forceReason: null
  };
  // The Wednesday JHA already has two revisions (server rows).
  const w = STATE.originals[1];
  [['Revision 1: added pump pad', '2026-10-21T13:10:00.000Z'], ['Revision 2: added rigging, Room 302 pump pad', '2026-10-21T15:20:00.000Z']]
    .forEach(([desc, at], i) => STATE.revisions.push({ id: `22222222-2222-4222-8222-00000000000${i + 1}`, original_id: w.id,
      revision_number: i + 1, fields: jhaFields(desc), submitted_at: at, submitted_by: 'Robin Testlead (Test)', client_key: 'seed-' + i, pdf_path: null }));
}
class Raise extends Error {}
const raise = (m) => { throw new Raise(m); };
const myOriginal = (id) => STATE.originals.find((o) => o.id === id && o.company === 'greiner' && o.form_type === 'jha' && o.job_id === JOB);
const revsOf = (id) => STATE.revisions.filter((r) => r.original_id === id).sort((a, b) => a.revision_number - b.revision_number);
const windowOpen = (o) => { const d = deadlineFor(o.submitted_at); return !!d && Date.parse(STATE.now) < Date.parse(d); };
const RPC = {
  cs_portal_field_home: () => ({ user: USER.name, company: 'Greiner Brothers',
    jobs: [{ id: JOB, job_number: 'C900-2026', name: 'Fictional Test Job', address: '1 Test Way, Indianapolis, IN',
      foreman_name: USER.name, external_hotwork: false, hotwork_locations: [], enabled_forms: null, enabled_permits: null,
      user_forms: ['jha', 'hotwork', 'aerial', 'forklift'] }],
    people: [{ name: USER.name, phone: null }, { name: 'Casey Crewtest (Test)', phone: null }, { name: 'Morgan Fieldtest (Test)', phone: null }],
    hotwork_locations: [], equipment: [{ unit_number: 'FL-TEST-1', equipment_type: 'Forklift', job_id: JOB }], recent: [] }),
  cs_portal_field_equipment: () => ({ user: USER, equipment: STATE.ladders || [] }),
  cs_portal_field_ladder_safe: (b) => { STATE.ladderWrites = (STATE.ladderWrites || []).concat([b]);
    return { ok: true, id: 'srv-lad-1', at: STATE.now, by: USER.name, by_user_id: USER.id }; },
  cs_jha_revisable: () => STATE.originals.filter((o) => myOriginal(o.id) && windowOpen(o))
    .sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at))
    .map((o) => ({ id: o.id, submitted_at: o.submitted_at, inspector_name: o.inspector_name,
      head_revision: revsOf(o.id).length, deadline_at: deadlineFor(o.submitted_at), window_open: true })),
  cs_jha_current: (b) => {
    const o = myOriginal(b.p_original); if (!o) raise('JHA not found or not permitted');
    const revs = revsOf(o.id), h = revs[revs.length - 1], d = deadlineFor(o.submitted_at);
    let reason = !d ? 'no-window' : Date.parse(STATE.now) < Date.parse(d) ? 'open' : 'closed';
    if (STATE.forceReason) reason = STATE.forceReason;
    return { original: { id: o.id, submitted_at: o.submitted_at, inspector_name: o.inspector_name, fields: o.fields },
      head: h ? { revision_number: h.revision_number, submitted_at: h.submitted_at, submitted_by: h.submitted_by, fields: h.fields }
        : (STATE.headZero ? { revision_number: 0, submitted_at: o.submitted_at, submitted_by: o.inspector_name, fields: o.fields } : null),
      deadline_at: reason === 'no-window' ? null : d, window_open: reason === 'open', window_reason: reason };
  },
  cs_jha_revise: (b) => {
    const o = myOriginal(b.p_original); if (!o) raise('JHA not found or not permitted');
    const dup = STATE.revisions.find((r) => r.original_id === o.id && r.client_key === b.p_client_key);
    if (dup) return { ok: true, revision_id: dup.id, revision_number: dup.revision_number, duplicate: true };
    const d = deadlineFor(o.submitted_at);
    if (STATE.forceReason === 'no-window' || !d) raise('no revision window for this JHA');
    if (Date.parse(STATE.now) >= Date.parse(d)) raise('revision window closed at Fri Oct 23 6:00 PM');
    if (!b.p_fields || !Object.keys(b.p_fields).length) raise('revision fields are empty');
    const r = { id: `33333333-3333-4333-8333-${String(++seq).padStart(12, '0')}`, original_id: o.id,
      revision_number: revsOf(o.id).length + 1, fields: b.p_fields, photos: b.p_photos, has_defects: b.p_has_defects,
      defect_count: b.p_defect_count, submitted_at: STATE.now, submitted_by: USER.name, client_key: b.p_client_key, pdf_path: null, signature: null };
    STATE.revisions.push(r);
    return { ok: true, revision_id: r.id, revision_number: r.revision_number, deadline_at: d, submitted_at: r.submitted_at };
  },
  cs_jha_revision_attach_pdf: (b) => {
    const r = STATE.revisions.find((x) => x.id === b.p_revision_id && myOriginal(x.original_id));
    if (!r) raise('revision not found or not permitted');
    r.pdf_path = b.p_pdf_path; STATE.attaches.push(b);
    return { ok: true };
  },
  cs_portal_field_submit: (b) => {
    const id = `44444444-4444-4444-8444-${String(++seq).padStart(12, '0')}`;
    STATE.submits.push(Object.assign({ id }, b));
    return { id };
  }
};

const offMachine = [], calls = [];
let checks = 0, failures = 0;
async function check(name, fn) {
  try { await fn(); checks++; console.log(`  ok  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${name}\n       ${String(e.stack || e.message).split('\n').slice(0, 5).join('\n       ')}`); }
}

// Forklift build (Oct 23 rule: the trained question is always asked) supersedes the JHA-only release's
// "forklift unchanged" checks below. Those are skipped ONLY on that build, and only while the forklift
// rule's own suites are present to cover it (verify-forklift-manual-gate.mjs, verify-forklift-production-sql.mjs).
const FORKLIFT_BUILD = /id="flCompetent"/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
if (FORKLIFT_BUILD) for (const t of ['verify-forklift-manual-gate.mjs', 'verify-forklift-production-sql.mjs']) {
  if (!fs.existsSync(path.join(ROOT, 'tests', t))) { console.log(`FAILED: forklift build without tests/${t}`); process.exit(1); }
}
const forkliftUnchanged = (name, fn) => FORKLIFT_BUILD
  ? (console.log(`  skip ${name} (forklift build: covered by verify-forklift-*.mjs)`), Promise.resolve())
  : check(name, fn);
const SUPA = /^https:\/\/gvfolfzseqwhhimbxgjv\.supabase\.co\//;
const browser = await webkit.launch();
async function open(query, { width = 390, laddersLive = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, timezoneId: 'America/Los_Angeles' });
  if (laddersLive) await page.addInitScript(() => { window.__ladderIdsLive = true; });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.route('**/*', async (r) => {
    const u = r.request().url();
    if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
    if (/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\//.test(u)) return r.fulfill({ body: JSPDF, contentType: 'application/javascript' });
    const m = u.match(/^https:\/\/gvfolfzseqwhhimbxgjv\.supabase\.co\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (m) {
      const body = JSON.parse(r.request().postData() || '{}');
      calls.push({ fn: m[1], body });
      if (m[1] === 'cs_jha_revise' && STATE.abortRevise === 'before') { STATE.abortRevise = null; return r.abort('failed'); }
      const f = RPC[m[1]];
      if (!f) return r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: `Could not find the function public.${m[1]} in the schema cache` }) });
      try {
        const out = f(body);
        if (m[1] === 'cs_jha_revise' && STATE.abortRevise === 'after') { STATE.abortRevise = null; return r.abort('failed'); }
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
      } catch (e) {
        if (!(e instanceof Raise)) throw e;
        return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: e.message, details: null, hint: null }) });
      }
    }
    if (u === 'https://gvfolfzseqwhhimbxgjv.supabase.co/functions/v1/field-pdf') {
      const body = JSON.parse(r.request().postData() || '{}');
      calls.push({ fn: 'edge:' + body.action, body: { action: body.action, ticket: body.ticket, id: body.id, bytes: (body.pdf_base64 || '').length } });
      if (body.action === 'upload' && STATE.edgeFailOnce) { STATE.edgeFailOnce = false; return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'upload failed' }) }); }
      if (body.action === 'upload') STATE.edgeUploads.push({ id: body.id, pdf: Buffer.from(body.pdf_base64 || '', 'base64').toString('latin1').replace(/\\([()\\])/g, '$1') });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
    offMachine.push(u); return r.abort();
  });
  await page.goto(BASE + 'index.html?' + query);
  await page.waitForTimeout(600);
  return page;
}
const PROD = 'ticket=test-ticket-not-real&';
const text = (p, sel) => p.locator(sel).innerText();
const val = (p, sel) => p.$eval(sel, (e) => e.value);
const since = (n) => calls.slice(n);
const fnsSince = (n) => since(n).map((c) => c.fn);
async function shot(page, name, sel) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  if (sel) { await page.$eval(sel, (e) => e.scrollIntoView({ block: 'center' })).catch(() => {}); }
  await page.waitForTimeout(600);   // let the view fade-in finish
  await page.screenshot({ path: path.join(SHOTS, name + '.png') });
}
async function fillRequired(page, formSel) {
  // Ladders and lifts: answer No (their inspector pickers are covered by other suites).
  await page.evaluate((sel) => ['jhaLadderUse', 'jhaAerialUse'].forEach((n) => {
    const el = document.querySelector(`${sel} input[name="${n}"][value="no"]`);
    if (el && !document.querySelector(`${sel} input[name="${n}"]:checked`)) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
  }), formSel);
  for (let pass = 0; pass < 3; pass++) await page.evaluate((sel) => {
    const form = document.querySelector(sel); const seen = {};
    form.querySelectorAll('[required]').forEach((el) => {
      if (el.offsetParent === null || el.disabled || el.closest('.fl-manual-gate')) return;
      if (el.type === 'radio') { if (seen[el.name]) return; seen[el.name] = 1;
        if (![...form.querySelectorAll(`input[name="${el.name}"]`)].some((x) => x.checked)) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); } return; }
      if (el.type === 'checkbox') { if (!el.checked) el.click(); return; }
      if (el.value) return;
      if (el.tagName === 'SELECT') { const o = [...el.options].find((x) => x.value); if (o) { el.value = o.value; el.dispatchEvent(new Event('change', { bubbles: true })); } return; }
      el.value = el.type === 'time' ? '07:00' : el.type === 'date' ? '2026-10-21' : el.type === 'datetime-local' ? '2026-10-21T08:00'
        : el.type === 'number' ? '1' : 'Test ' + (el.name || el.id);
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }, formSel);
}
async function openList(p) {
  await p.click('#jhaReviseEntryBtn');
  await p.waitForSelector('#reviseJhaList .jha-rev-row, #reviseJhaEmpty, #reviseJhaError', { timeout: 5000 });
}
async function openRevision(p, id) {
  await openList(p);
  await p.click(`[data-revise-root="${id}"]`);
  await p.waitForSelector('#jhaRevisionBanner, #jhaViewOnlyReason, #jhaOpenError', { timeout: 5000 });
  await p.waitForTimeout(150);
}
async function waitDone(p) { await p.waitForSelector('#jhaRevSaved', { timeout: 8000 }); }
const MON_ID = '11111111-1111-4111-8111-000000000001', WED_ID = '11111111-1111-4111-8111-000000000002';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

try {
  reset();
  /* ---------- ordinary new JHA: exactly today's path ---------- */
  await check('Ordinary new JHA is unchanged: cs_portal_field_submit (same keys) + edge upload with the new id, no cs_jha_* call', async () => {
    const p = await open(PROD + 'ngform=jha');
    assert.ok(await p.$('#jhaReviseEntryBtn'), 'the production JHA form offers "Revise a JHA from this week"');
    assert.equal(await text(p, '#jhaReviseEntryBtn'), 'Revise a JHA from this week');
    assert.equal((await text(p, '#jhaSubmitBtn')).trim(), 'Submit JHA');
    await shot(p, 'P-01-new-jha-with-revise-entry');
    const n = calls.length;
    await fillRequired(p, '#jhaForm');
    await p.fill('#jhaDescriptionOfWork', 'Brand new JHA for today');
    await p.click('#jhaSubmitBtn');
    await p.waitForSelector('#ngView', { timeout: 8000 });
    const fns = fnsSince(n);
    assert.deepEqual(fns, ['cs_portal_field_submit', 'edge:upload'], fns.join(','));
    const sub = since(n)[0].body;
    assert.deepEqual(Object.keys(sub).sort(), ['p_asset_id', 'p_defect_count', 'p_fields', 'p_form_title', 'p_form_type', 'p_has_defects',
      'p_pdf_path', 'p_photos', 'p_signature', 'p_token'], 'same request keys as live 23805b6');
    assert.equal(sub.p_form_type, 'jha');
    assert.equal(sub.p_fields.jhaDescriptionOfWork, 'Brand new JHA for today');
    assert.ok(sub.p_fields.doc && sub.p_fields.doc.sections, 'the document model is stored as before');
    assert.ok(!('client_key' in sub.p_fields) && !('p_client_key' in sub), 'no revision key on a new JHA');
    assert.equal(since(n)[1].body.id, STATE.submits.at(-1).id, 'PDF uploaded under the new submission id');
    assert.ok(!(await p.$('#jhaRevSaved')), 'no revision notice on a new JHA');
    BASE_FIELDS = sub.p_fields;
    assert.deepEqual(p.errors, []);
    await p.close();
  });
  reset();

  /* ---------- the list ---------- */
  await check('Revise list: only this job’s JHAs still open, newest first, with date, who, deadline and head revision', async () => {
    const p = await open(PROD + 'ngform=jha');
    const n = calls.length;
    await openList(p);
    assert.deepEqual(fnsSince(n), ['cs_jha_revisable']);
    assert.deepEqual(since(n)[0].body, { p_token: 'test-ticket-not-real' });
    const rows = await p.$$eval('#reviseJhaList .jha-rev-row', (b) => b.map((x) => ({ id: x.getAttribute('data-revise-root'), t: x.innerText })));
    assert.deepEqual(rows.map((r) => r.id), [WED_ID, MON_ID]);
    assert.match(rows[0].t, /JHA submitted Oct 21, 2026(,| at) 6:50 AM/);
    assert.match(rows[0].t, /Robin Testlead \(Test\)/);
    assert.match(rows[0].t, /Latest: Revision 2/);
    assert.match(rows[1].t, /JHA submitted Oct 19, 2026(,| at) 7:05 AM/);
    assert.match(rows[1].t, /Morgan Fieldtest \(Test\)/);
    assert.match(rows[1].t, /Original, not revised yet/);
    for (const r of rows) assert.match(r.t, /Revise until Fri, Oct 23, 6:00 PM/);
    assert.equal(await text(p, '#reviseJhaView .form-title'), 'Revise a JHA from this week');
    assert.ok(!/Another job|Prior Friday/.test(await text(p, '#reviseJhaView')), 'other-job and no-window JHAs are not offered');
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over <= 0, 'no horizontal overflow at 390 px: ' + over);
    await shot(p, 'P-02-revise-list-wednesday');
    // Back goes to a fresh JHA form.
    await p.click('#reviseJhaBack');
    await p.waitForTimeout(150);
    assert.equal(await p.evaluate(() => document.querySelector('.view.active').id), 'inspectionJhaView');
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  await check('Revise list empty state (server clock at Fri 6:00 PM): a plain message and Complete New JHA', async () => {
    reset(T.FRI_6PM);
    const p = await open(PROD + 'ngform=revisejha');
    await p.waitForSelector('#reviseJhaEmpty', { timeout: 5000 });
    assert.match(await text(p, '#reviseJhaEmpty'), /No JHAs from this job can be revised right now\. A JHA can be revised until 6:00 PM Friday of the week it was first submitted\./);
    await shot(p, 'P-03-revise-list-empty-friday-6pm');
    await p.click('#reviseJhaList [data-new-jha]');
    await p.waitForTimeout(150);
    assert.equal(await p.evaluate(() => document.querySelector('.view.active').id), 'inspectionJhaView');
    assert.equal((await text(p, '#jhaSubmitBtn')).trim(), 'Submit JHA', 'a new JHA, not a revision');
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  /* ---------- open + prefill ---------- */
  await check('Monday original (no revisions): opens prefilled from the original, banner "Revision 1 of the JHA submitted …" + deadline', async () => {
    reset();
    const p = await open(PROD + 'ngform=jha');
    const n = calls.length;
    await openRevision(p, MON_ID);
    assert.deepEqual(fnsSince(n), ['cs_jha_revisable', 'cs_jha_current']);
    assert.deepEqual(since(n)[1].body, { p_token: 'test-ticket-not-real', p_original: MON_ID });
    assert.equal(await val(p, '#jhaDescriptionOfWork'), 'Monday original: set hangers, Level 2 east');
    assert.equal(await val(p, '[name="jhaTask4"]'), 'Material Handling', 'a fourth task row is rebuilt and filled');
    assert.equal(await val(p, '[name="jhaAction4"]'), 'Team lift over 50 lb');
    const b = await text(p, '#jhaRevisionBanner');
    assert.match(b, /Revision 1 of the JHA submitted Oct 19, 2026(,| at) 7:05 AM/);
    assert.match(b, /until Fri, Oct 23, 6:00 PM/);
    assert.equal((await text(p, '#jhaSubmitBtn')).trim(), 'Submit Revision 1');
    assert.ok(!(await p.$('#jhaReviseEntryBtn')), 'no entry button while revising');
    assert.ok(!(await p.$('#jhaRevNote')), 'no revision note field in production (the contract has none)');
    const crew = await p.$eval('#jhaCrewData', (e) => JSON.parse(e.value));
    assert.deepEqual(crew.employees, ['Morgan Fieldtest (Test)', 'Casey Crewtest (Test)'], 'crew restored');
    await shot(p, 'P-04-monday-revision1-editor-banner');
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  await check('Wednesday original with 2 revisions: opens from the head (Revision 2), banner "Revision 3 …"', async () => {
    reset();
    const p = await open(PROD + 'ngform=jha');
    await openRevision(p, WED_ID);
    assert.equal(await val(p, '#jhaDescriptionOfWork'), 'Revision 2: added rigging, Room 302 pump pad', 'prefilled from head.fields, not the original');
    assert.match(await text(p, '#jhaRevisionBanner'), /Revision 3 of the JHA submitted Oct 21, 2026(,| at) 6:50 AM/);
    assert.equal((await text(p, '#jhaSubmitBtn')).trim(), 'Submit Revision 3');
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  await check('A head with revision_number 0 (the original echoed as head) is treated as no revisions yet', async () => {
    reset(); STATE.headZero = true;
    const p = await open(PROD + 'ngform=jha');
    await openRevision(p, MON_ID);
    assert.match(await text(p, '#jhaRevisionBanner'), /Revision 1 of the JHA submitted/);
    assert.equal(await val(p, '#jhaDescriptionOfWork'), 'Monday original: set hangers, Level 2 east');
    await p.close();
  });

  /* ---------- submit ---------- */
  let firstKey = null;
  await check('Submit creates Revision 1: cs_jha_revise -> upload (id = revision id) -> attach; original untouched; completion', async () => {
    reset();
    const before = JSON.stringify(STATE.originals);
    const p = await open(PROD + 'ngform=jha');
    await openRevision(p, MON_ID);
    await p.fill('#jhaDescriptionOfWork', 'Monday REVISED: hangers plus east stair');
    const n = calls.length;
    await p.click('#jhaSubmitBtn');
    await waitDone(p);
    assert.deepEqual(fnsSince(n), ['cs_jha_revise', 'edge:upload', 'cs_jha_revision_attach_pdf'], fnsSince(n).join(','));
    const rv = since(n)[0].body;
    assert.deepEqual(Object.keys(rv).sort(), ['p_client_key', 'p_defect_count', 'p_fields', 'p_has_defects', 'p_original', 'p_photos', 'p_token']);
    assert.equal(rv.p_original, MON_ID);
    assert.match(rv.p_client_key, UUID, 'client key is a UUID');
    firstKey = rv.p_client_key;
    assert.equal(rv.p_fields.jhaDescriptionOfWork, 'Monday REVISED: hangers plus east stair');
    assert.equal(rv.p_fields.jhaTask4, 'Material Handling', 'unchanged answers carried');
    assert.deepEqual(rv.p_fields.jhaHazard1_photos, [PNG], 'the original’s photo is carried forward');
    assert.ok(rv.p_fields.doc && rv.p_fields.doc.sections.length, 'document model stored like an original');
    assert.equal(rv.p_has_defects, false);
    const rev = STATE.revisions.filter((r) => r.original_id === MON_ID);
    assert.equal(rev.length, 1);
    assert.equal(rev[0].revision_number, 1);
    const up = since(n)[1].body;
    assert.equal(up.id, rev[0].id, 'upload uses the revision id');
    assert.equal(up.ticket, 'test-ticket-not-real');
    assert.ok(up.bytes > 1000, 'a PDF was sent');
    assert.deepEqual(since(n)[2].body, { p_token: 'test-ticket-not-real', p_revision_id: rev[0].id, p_pdf_path: `greiner/${rev[0].id}.pdf` });
    assert.equal(rev[0].pdf_path, `greiner/${rev[0].id}.pdf`);
    assert.equal(JSON.stringify(STATE.originals), before, 'the original row is never changed');
    const pdf = STATE.edgeUploads.at(-1).pdf;
    assert.ok(pdf.includes('Revision 1'), 'the PDF says Revision 1');
    assert.ok(pdf.includes('Monday REVISED: hangers plus east stair'), 'the PDF carries the edited answer');
    assert.ok(pdf.includes('Original submitted') && /Oct 19, 2026(,| at) 7:05 AM/.test(pdf), 'the PDF carries the original submission time');
    assert.ok(pdf.includes('REVISED'), 'status REVISED on the PDF');
    const done = await text(p, '#jhaRevSaved');
    assert.match(done, /Revision 1 saved\. The original and earlier revisions are kept\./);
    assert.ok(await p.$('#ngView') && await p.$('#ngDownload'), 'View PDF and Download PDF like other forms');
    assert.equal(await p.evaluate(() => document.querySelector('.view.active').id), 'successView');
    assert.equal(await p.evaluate(() => window.NG.last.id), rev[0].id);
    await shot(p, 'P-05-revision1-saved');
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  await check('A second editor session gets a new client key and makes Revision 2 (no cap)', async () => {
    const p = await open(PROD + 'ngform=jha');
    await openRevision(p, MON_ID);
    assert.equal(await val(p, '#jhaDescriptionOfWork'), 'Monday REVISED: hangers plus east stair', 'opens from the new head');
    assert.match(await text(p, '#jhaRevisionBanner'), /Revision 2 of the JHA/);
    const n = calls.length;
    await p.click('#jhaSubmitBtn');
    await waitDone(p);
    const k = since(n)[0].body.p_client_key;
    assert.match(k, UUID); assert.notEqual(k, firstKey);
    assert.match(await text(p, '#jhaRevSaved'), /Revision 2 saved\./);
    assert.equal(STATE.revisions.filter((r) => r.original_id === MON_ID).length, 2);
    await p.close();
  });

  await check('Double tap: one request (same client key on every send), one revision, one completion', async () => {
    reset();
    const p = await open(PROD + 'ngform=jha');
    await openRevision(p, WED_ID);
    await p.fill('#jhaDescriptionOfWork', 'Wednesday Revision 3 after a double tap');
    const n = calls.length;
    await p.evaluate(() => {
      const f = document.getElementById('jhaForm'), b = document.getElementById('jhaSubmitBtn');
      b.click(); b.click(); f.requestSubmit(); f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    });
    await waitDone(p);
    await p.waitForTimeout(300);
    const revs = since(n).filter((c) => c.fn === 'cs_jha_revise');
    assert.ok(revs.length >= 1);
    assert.equal(new Set(revs.map((c) => c.body.p_client_key)).size, 1, 'same client key');
    assert.equal(STATE.revisions.filter((r) => r.original_id === WED_ID).length, 3, 'exactly one new revision');
    assert.equal(since(n).filter((c) => c.fn === 'edge:upload').length, 1, 'one upload');
    assert.equal(await p.$$eval('#jhaRevSaved', (x) => x.length), 1);
    assert.match(await text(p, '#jhaRevSaved'), /Revision 3 saved\./);
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  await check('Network error before the server stored it: plain message, answers kept; retry reuses the key -> one revision', async () => {
    reset(); STATE.abortRevise = 'before';
    const p = await open(PROD + 'ngform=jha');
    await openRevision(p, MON_ID);
    await p.fill('#jhaDescriptionOfWork', 'Retry after a dropped request');
    const n = calls.length;
    await p.click('#jhaSubmitBtn');
    await p.waitForSelector('#jhaRevError', { timeout: 5000 });
    assert.match(await text(p, '#jhaRevError'), /Could not reach Greiner’s records, so Revision 1 was not confirmed\. Your answers are still here\. Tap Submit Revision 1 again; it will not make a second copy\./);
    assert.equal(await val(p, '#jhaDescriptionOfWork'), 'Retry after a dropped request', 'answers kept');
    assert.equal(await p.$eval('#jhaSubmitBtn', (b) => b.disabled), false, 'button usable again');
    assert.equal(STATE.revisions.filter((r) => r.original_id === MON_ID).length, 0);
    await shot(p, 'P-06-network-error-retry', '#jhaRevError');
    await p.click('#jhaSubmitBtn');
    await waitDone(p);
    const keys = since(n).filter((c) => c.fn === 'cs_jha_revise').map((c) => c.body.p_client_key);
    assert.equal(keys.length, 2); assert.equal(keys[0], keys[1], 'the retry reuses the key');
    assert.equal(STATE.revisions.filter((r) => r.original_id === MON_ID).length, 1);
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  await check('Answer lost after the server stored it: retry gets duplicate:true for the same revision; still one revision', async () => {
    reset(); STATE.abortRevise = 'after';
    const p = await open(PROD + 'ngform=jha');
    await openRevision(p, MON_ID);
    const n = calls.length;
    await p.click('#jhaSubmitBtn');
    await p.waitForSelector('#jhaRevError', { timeout: 5000 });
    assert.equal(STATE.revisions.filter((r) => r.original_id === MON_ID).length, 1, 'stored once on the server');
    await p.click('#jhaSubmitBtn');
    await waitDone(p);
    const keys = since(n).filter((c) => c.fn === 'cs_jha_revise').map((c) => c.body.p_client_key);
    assert.equal(keys[0], keys[1]);
    const rev = STATE.revisions.filter((r) => r.original_id === MON_ID);
    assert.equal(rev.length, 1, 'no second revision');
    assert.equal(since(n).filter((c) => c.fn === 'edge:upload').at(-1).body.id, rev[0].id);
    assert.equal(rev[0].pdf_path, `greiner/${rev[0].id}.pdf`);
    assert.match(await text(p, '#jhaRevSaved'), /Revision 1 saved\. The original and earlier revisions are kept\./);
    await p.close();
  });

  await check('PDF upload fails once: "saved, PDF not finished"; retry -> duplicate, upload, attach; still one revision', async () => {
    reset(); STATE.edgeFailOnce = true;
    const p = await open(PROD + 'ngform=jha');
    await openRevision(p, MON_ID);
    const n = calls.length;
    await p.click('#jhaSubmitBtn');
    await p.waitForSelector('#jhaRevError', { timeout: 5000 });
    assert.match(await text(p, '#jhaRevError'), /Revision 1 is saved, but its PDF did not finish uploading\. Tap Submit Revision 1 again to finish; it will not make another revision\./);
    await p.click('#jhaSubmitBtn');
    await waitDone(p);
    assert.deepEqual(fnsSince(n), ['cs_jha_revise', 'edge:upload', 'cs_jha_revise', 'edge:upload', 'cs_jha_revision_attach_pdf']);
    assert.equal(STATE.revisions.filter((r) => r.original_id === MON_ID).length, 1);
    await p.close();
  });

  /* ---------- closed, no window, refusals ---------- */
  await check('Window closed when opened (list at 5:59 PM, tap at 6:00 PM): view-only with the reason; nothing opens for editing', async () => {
    reset(T.FRI_559);
    const p = await open(PROD + 'ngform=jha');
    await openList(p);
    STATE.now = T.FRI_6PM;
    const n = calls.length;
    await p.click(`[data-revise-root="${MON_ID}"]`);
    await p.waitForSelector('#jhaViewOnlyReason', { timeout: 5000 });
    assert.match(await text(p, '#jhaViewOnlyReason'), /The revision window closed at Fri, Oct 23, 6:00 PM\. You can view this JHA, but it can’t be revised\./);
    assert.match(await text(p, '#jhaSheet'), /Monday original: set hangers, Level 2 east/, 'the answers are shown read-only');
    assert.equal(await p.evaluate(() => document.querySelector('.view.active').id), 'reviseJhaView', 'the editor did not open');
    assert.ok(!fnsSince(n).includes('cs_jha_revise'));
    await shot(p, 'P-07-closed-view-only');
    await p.click('#jhaSheet [data-sheet="close"]');
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  await check('No window (server answers no-window): view-only with "weekend or after 6 PM Friday"', async () => {
    reset(); STATE.forceReason = 'no-window';
    const p = await open(PROD + 'ngform=jha');
    await openList(p);
    await p.click(`[data-revise-root="${WED_ID}"]`);
    await p.waitForSelector('#jhaViewOnlyReason', { timeout: 5000 });
    assert.match(await text(p, '#jhaViewOnlyReason'), /No revision window for this JHA \(weekend or after 6 PM Friday\)\. You can view it, but it can’t be revised\./);
    await shot(p, 'P-08-no-window-view-only');
    await p.close();
  });

  await check('Editor open at 5:59 PM, submitted at 6:00 PM: the server refuses and the phone says so plainly; nothing stored or uploaded', async () => {
    reset(T.FRI_559);
    const p = await open(PROD + 'ngform=jha');
    await openRevision(p, MON_ID);
    STATE.now = T.FRI_6PM;
    const n = calls.length;
    await p.click('#jhaSubmitBtn');
    await p.waitForSelector('#jhaRevRefused', { timeout: 5000 });
    assert.equal(await text(p, '#jhaRevRefused'), 'This JHA can no longer be revised: the revision window closed at Fri Oct 23 6:00 PM.');
    assert.deepEqual(fnsSince(n), ['cs_jha_revise']);
    assert.equal(STATE.revisions.filter((r) => r.original_id === MON_ID).length, 0);
    await shot(p, 'P-09-submitted-at-6pm-refused');
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  await check('Server refuses with "no revision window" and "not found or not permitted": plain messages', async () => {
    reset();
    const p = await open(PROD + 'ngform=jha');
    await openRevision(p, MON_ID);
    STATE.forceReason = 'no-window';
    await p.click('#jhaSubmitBtn');
    await p.waitForSelector('#jhaRevRefused', { timeout: 5000 });
    assert.match(await text(p, '#jhaRevRefused'), /there is no revision window for it \(it was submitted on a weekend or after 6 PM Friday\)/);
    await p.click('#jhaSheet [data-sheet="close"]');
    STATE.forceReason = null;
    STATE.originals[0].job_id = OTHER_JOB;   // moved off the ticket's job
    await p.click('#jhaSubmitBtn');
    await p.waitForSelector('#jhaRevRefused', { timeout: 5000 });
    assert.match(await text(p, '#jhaRevRefused'), /not found on your job, or you are not permitted to revise it/);
    assert.equal(STATE.revisions.length, 2, 'nothing stored');
    await p.close();
  });

  await check('Weekend and Friday-after-6 PM originals are never offered (provisional server rule)', async () => {
    reset('2026-10-24T15:00:00.000Z');
    STATE.originals.push({ id: '11111111-1111-4111-8111-000000000009', company: 'greiner', job_id: JOB, form_type: 'jha', submitted_at: T.SAT,
      inspector_name: 'Morgan Fieldtest (Test)', fields: jhaFields('Saturday original') });
    const p = await open(PROD + 'ngform=revisejha');
    await p.waitForSelector('#reviseJhaEmpty', { timeout: 5000 });
    assert.ok(!/Saturday original/.test(await text(p, '#reviseJhaView')));
    await p.close();
  });

  /* ---------- after a revision, a new JHA is a new JHA ---------- */
  await check('Leaving a revision and opening JHA from the inspections list files a NEW JHA (cs_portal_field_submit), not a revision', async () => {
    reset();
    const p = await open(PROD + 'ngform=jha');
    await openRevision(p, MON_ID);
    await p.click('#inspectionJhaBackBtn');
    await p.waitForTimeout(150);
    await p.click('#openJhaFormBtn');
    await p.waitForTimeout(200);
    assert.equal((await text(p, '#jhaSubmitBtn')).trim(), 'Submit JHA');
    assert.ok(!(await p.$('#jhaRevisionBanner')));
    await fillRequired(p, '#jhaForm');
    const n = calls.length;
    await p.click('#jhaSubmitBtn');
    await p.waitForSelector('#ngView', { timeout: 8000 });
    assert.deepEqual(fnsSince(n), ['cs_portal_field_submit', 'edge:upload']);
    assert.equal(STATE.revisions.filter((r) => r.original_id === MON_ID).length, 0);
    await p.close();
  });

  /* ---------- ladder link fields stay consistent ---------- */
  await check('Ladder checks during a revision link to the original id and the revision’s version number (original = 1)', async () => {
    reset();
    STATE.ladders = [{ id: 'eq-lad-t1', unit_number: 'LAD-T1', equipment_type: 'Ladder', description: '8 ft step', job_id: JOB, is_ladder: true, events: [] }];
    const p = await open(PROD + 'ngform=jha', { laddersLive: true });
    await openRevision(p, MON_ID);
    await p.check('input[name=jhaLadderUse][value=yes]');
    await p.waitForTimeout(150);
    await p.click('[data-ladder-opt="LAD-T1"]');
    await p.click('[data-lad-inspect="LAD-T1"]');
    await p.check('[data-lad-attest="LAD-T1"]');
    await p.click('[data-lad-confirm="LAD-T1"]');
    await p.waitForSelector('[data-ladder-card="LAD-T1"] .jha-ladder-ok', { timeout: 5000 });
    const w = STATE.ladderWrites.at(-1);
    assert.equal(w.p_jha_root_id, MON_ID, 'root = the original id');
    assert.equal(w.p_jha_revision_number, 2, 'Revision 1 = version 2 (the phone’s existing numbering: original = 1)');
    await p.close();
  });

  /* ---------- forklift: this JHA-only build leaves it exactly as live ---------- */
  await forkliftUnchanged('Forklift is unchanged: no missing-manual questions; manual missing is sent straight to cs_portal_field_submit as today', async () => {
    reset();
    const p = await open(PROD + 'ngform=forklift');
    assert.equal(await p.$('#flManualGate'), null, 'no missing-manual questions in this build');
    await p.evaluate(() => document.querySelectorAll('#forkliftInspectionForm input[type=radio][value=safe]').forEach((r) => { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }));
    await p.evaluate(() => { const el = document.querySelector('#forkliftInspectionForm input[name="fl_chk_operator_manual"][value="defect"]'); el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await fillRequired(p, '#forkliftInspectionForm');
    const n = calls.length;
    await p.click('#forkliftSubmitBtn');
    await p.waitForSelector('#ngView', { timeout: 8000 });
    assert.deepEqual(fnsSince(n), ['cs_portal_field_submit', 'edge:upload']);
    const s = STATE.submits.at(-1);
    assert.equal(s.p_form_type, 'forklift');
    assert.equal(s.p_fields.fl_chk_operator_manual, 'defect');
    assert.ok(!Object.keys(s.p_fields).some((k) => /^fl_manual_/.test(k)), 'no gate answers are sent');
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  /* ---------- demo mode untouched ---------- */
  await check('Demo mode (?demo=1) still revises locally: no RPC, no production entry, demo list renders', async () => {
    const n = calls.length;
    const p = await open('demo=1&demonow=' + encodeURIComponent('2026-10-21T12:00:00-04:00'));
    await p.click('[data-demoform="jha"]');
    await p.waitForTimeout(150);
    assert.ok(!(await p.$('#jhaReviseEntryBtn')), 'no production entry in demo');
    await p.evaluate(() => window.showView('landing'));
    await p.click('[data-demoform="revisejha"]');
    await p.waitForSelector('#reviseJhaList .jha-rev-row', { timeout: 5000 });
    assert.equal(await text(p, '#reviseJhaView .form-title'), 'Choose a JHA to revise');
    await p.click('#reviseJhaList .jha-rev-row');
    await p.waitForSelector('#jhaRevisionBanner');
    assert.match(await text(p, '#jhaRevisionBanner'), /Revising JHA submitted/);
    assert.deepEqual(since(n), [], 'demo makes no server calls');
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  await check('No horizontal overflow at 390 px in the revision editor', async () => {
    reset();
    const p = await open(PROD + 'ngform=jha');
    await openRevision(p, WED_ID);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over <= 0, 'overflow ' + over);
    await shot(p, 'P-11-wednesday-revision3-editor');
    await p.close();
  });
} finally {
  await browser.close();
  server.close();
}
await check('nothing left the machine (0 off-machine requests)', () => { assert.deepEqual(offMachine, []); });
if (failures) { console.log(`Revised JHA production verification FAILED (${failures} of ${checks + failures} checks).`); process.exit(1); }
console.log(`Revised JHA production verification passed (${checks} checks; every server call stubbed, nothing sent).`);
