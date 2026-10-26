/* The phone's revised-JHA path against the REAL release SQL (end to end,
 * local only), for the JHA-ONLY release: only 01 is applied.
 *
 * PGlite runs the server worker's release file unchanged
 *   (greiner-dashboard-release-2026-10-22/sql/release-2026-10-22/01-jha-revisions.sql;
 *    02-forklift-enforcement.sql is deliberately NOT applied)
 * on that worktree's test schema (tests/release-sql/fixture-schema.sql) over the live
 * function bodies (the coordinator's read-only live-defs copy). The clock is pinned
 * with a TEST-ONLY cs_jha_now() override (production: now()).
 *
 * The phone (index.html, WebKit, 390 px) talks to that database: cs_jha_revisable,
 * cs_jha_current, cs_jha_revise, cs_jha_revision_attach_pdf, cs_portal_field_submit
 * and cs_portal_field_attach_pdf are answered by PGlite. The field-pdf edge 'upload'
 * action is played as the live edge function does it (store greiner/<id>.pdf, then
 * cs_portal_field_attach_pdf, a no-op for a revision id). cs_portal_field_home and
 * cs_portal_field_equipment are not in the release and are answered in-test.
 *
 * Fictional company, job and people. Nothing leaves the machine.
 *
 * Needs PLAYWRIGHT_NODE_MODULES, PGLITE_NODE_MODULES and JSPDF_PATH. Skips cleanly
 * without them or without the release SQL (RELEASE_SQL_ROOT, default
 * ../greiner-dashboard-release-2026-10-22) or LIVE_DEFS.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(new URL('../', import.meta.url).pathname);
const SROOT = process.env.RELEASE_SQL_ROOT || path.resolve(ROOT, '../greiner-dashboard-release-2026-10-22');
const MIG1 = path.join(SROOT, 'sql/release-2026-10-22/01-jha-revisions.sql');
const SCHEMA = path.join(SROOT, 'tests/release-sql/fixture-schema.sql');
const LIVE_DEFS = process.env.LIVE_DEFS ||
  path.join(os.homedir(), '.nextgen-hq/coordinator/run-2026-10-22-release/live-defs/live-functions-2026-10-22-1720.sql');
for (const f of [MIG1, SCHEMA, LIVE_DEFS]) {
  if (!fs.existsSync(f)) { console.log(`Revised JHA phone + release SQL verification skipped (${f} not found).`); process.exit(0); }
}
const JSPDF_PATH = process.env.JSPDF_PATH ||
  path.resolve(ROOT, '../greiner-dashboard-tony-feedback-2026-10-02/tools/vendor/jspdf.umd.min.js');
let webkit, PGlite, pgcrypto;
try {
  ({ webkit } = createRequire(path.join(process.env.PLAYWRIGHT_NODE_MODULES || ROOT, 'noop.js'))('playwright-webkit'));
  const preq = createRequire(path.join(process.env.PGLITE_NODE_MODULES || '/nonexistent', 'noop.js'));
  ({ PGlite } = await import(pathToFileURL(preq.resolve('@electric-sql/pglite')).href));
  ({ pgcrypto } = await import(pathToFileURL(preq.resolve('@electric-sql/pglite/contrib/pgcrypto')).href));
  if (!fs.existsSync(JSPDF_PATH)) throw new Error('no jsPDF');
} catch {
  console.log('Revised JHA phone + release SQL verification skipped (set PLAYWRIGHT_NODE_MODULES, PGLITE_NODE_MODULES and JSPDF_PATH).');
  process.exit(0);
}
const JSPDF = fs.readFileSync(JSPDF_PATH);

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

/* ---- the database: schema + live bodies + release files, unchanged ---- */
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(fs.readFileSync(SCHEMA, 'utf8'));
await db.exec(fs.readFileSync(LIVE_DEFS, 'utf8'));
const submitMd5 = async () => (await db.query(`select md5(prosrc) as m from pg_proc where oid = to_regprocedure('public.cs_portal_field_submit(text,text,text,text,jsonb,jsonb,text,boolean,integer,text)')`)).rows[0].m;
const LIVE_SUBMIT_MD5 = await submitMd5();
await db.exec(fs.readFileSync(MIG1, 'utf8'));   // 01 only: no forklift enforcement in the JHA-only release
await db.exec(`
  create table test_clock (t timestamptz);
  -- TEST ONLY: production cs_jha_now() is now(). This override exists in this PGlite database and nowhere else.
  create or replace function public.cs_jha_now() returns timestamptz language sql stable as $$ select coalesce((select t from test_clock limit 1), now()) $$;`);
const q = async (s, p = []) => (await db.query(s, p)).rows;
const setClock = async (iso) => { await db.exec('delete from test_clock'); await q('insert into test_clock values ($1)', [iso]); };

const G = 'f0000000-0000-4000-8000-0000000000a1', J1 = 'f0000000-0000-4000-8000-000000000301', J2 = 'f0000000-0000-4000-8000-000000000302';
const U1 = 'f0000000-0000-4000-8000-000000000501';
const TOK = 'fake-phone-field-ticket';
await q(`insert into cs_companies (id, name) values ($1, 'Greiner Brothers (fictional test copy)')`, [G]);
await q(`insert into cs_jobs (id, company_id, job_number, name) values ($1, $2, 'C900-F', 'Maple Street Clinic (fictional)'), ($3, $2, 'C901-F', 'Other Job (fictional)')`, [J1, G, J2]);
await q(`insert into cs_portal_sessions (token, company_id, scope, slug, expires_at, user_id, user_name, job_ids)
  values ($1, $2, 'field', 'greiner', now() + interval '2 days', $3, 'Dana Fictional', array[$4]::uuid[])`, [TOK, G, U1, J1]);

async function callSql(fn, body) {
  const keys = Object.keys(body);
  const args = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
  const vals = keys.map((k) => (body[k] !== null && typeof body[k] === 'object') ? JSON.stringify(body[k]) : body[k]);
  return (await q(`select public.${fn}(${args}) as r`, vals))[0].r;
}
const SQL_FNS = new Set(['cs_jha_revisable', 'cs_jha_current', 'cs_jha_revise', 'cs_jha_revision_attach_pdf', 'cs_portal_field_submit', 'cs_portal_field_attach_pdf']);
const HOME = { user: 'Dana Fictional', company: 'Greiner Brothers',
  jobs: [{ id: J1, job_number: 'C900-F', name: 'Maple Street Clinic (fictional)', address: '1 Maple St (fictional)', foreman_name: 'Dana Fictional',
    external_hotwork: false, hotwork_locations: [], enabled_forms: null, enabled_permits: null, user_forms: ['jha', 'hotwork', 'aerial', 'forklift'] }],
  people: [{ name: 'Dana Fictional', phone: null }, { name: 'Robin Placeholder', phone: null }], hotwork_locations: [],
  equipment: [{ unit_number: 'FL-F1', equipment_type: 'Forklift', job_id: J1 }], recent: [] };

/* ---- the phone, talking to that database ---- */
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css' };
const server = http.createServer((rq, rs) => {
  const p = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end(); }
  rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
const offMachine = [], calls = [], STORE = {};
let dropNextReviseAnswer = false;
const browser = await webkit.launch();
async function open(query) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
  await page.route('**/*', async (r) => {
    const u = r.request().url();
    if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
    if (/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\//.test(u)) return r.fulfill({ body: JSPDF, contentType: 'application/javascript' });
    const reply = (status, body) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const m = u.match(/^https:\/\/gvfolfzseqwhhimbxgjv\.supabase\.co\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (m) {
      const body = JSON.parse(r.request().postData() || '{}');
      calls.push({ fn: m[1], body });
      if (m[1] === 'cs_portal_field_home') return reply(200, HOME);
      if (m[1] === 'cs_portal_field_equipment') return reply(200, { user: { id: U1, name: 'Dana Fictional' }, equipment: [] });
      if (!SQL_FNS.has(m[1])) return reply(404, { message: `Could not find the function public.${m[1]} in the schema cache` });
      try {
        const out = await callSql(m[1], body);
        if (m[1] === 'cs_jha_revise' && dropNextReviseAnswer) { dropNextReviseAnswer = false; return r.abort('failed'); }
        return reply(200, out);
      } catch (e) { return reply(400, { code: 'P0001', message: e.message }); }
    }
    if (u === 'https://gvfolfzseqwhhimbxgjv.supabase.co/functions/v1/field-pdf') {
      const body = JSON.parse(r.request().postData() || '{}');
      calls.push({ fn: 'edge:' + body.action, body: { id: body.id } });
      if (body.action !== 'upload' || body.ticket !== TOK) return reply(400, { error: 'bad request' });
      const p = `greiner/${body.id}.pdf`;   // what the live edge function does: store, then attach to a submission row
      STORE[p] = Buffer.from(body.pdf_base64 || '', 'base64').toString('latin1').replace(/\\([()\\])/g, '$1');
      await callSql('cs_portal_field_attach_pdf', { p_token: body.ticket, p_id: body.id, p_pdf_path: p });
      return reply(200, { ok: true });
    }
    offMachine.push(u); return r.abort();
  });
  await page.goto(BASE + 'index.html?ticket=' + TOK + '&' + query);
  await page.waitForTimeout(600);
  return page;
}
const text = (p, sel) => p.locator(sel).innerText();
const val = (p, sel) => p.$eval(sel, (e) => e.value);
async function fillRequired(page, formSel) {
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
      el.value = el.type === 'time' ? '07:00' : el.type === 'date' ? '2026-10-19' : el.type === 'datetime-local' ? '2026-10-19T08:00'
        : el.type === 'number' ? '1' : 'Fictional ' + (el.name || el.id);
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }, formSel);
}
async function newJha(desc) {
  const p = await open('ngform=jha');
  await fillRequired(p, '#jhaForm');
  await p.fill('#jhaDescriptionOfWork', desc);
  await p.click('#jhaSubmitBtn');
  await p.waitForSelector('#ngView', { timeout: 8000 });
  await p.close();
  return (await q(`select id from cs_field_submissions where fields->>'jhaDescriptionOfWork' = $1`, [desc]))[0].id;
}
async function openRevision(p, id) {
  await p.click('#jhaReviseEntryBtn');
  await p.waitForSelector('#reviseJhaList .jha-rev-row, #reviseJhaEmpty, #reviseJhaError', { timeout: 5000 });
  await p.click(`[data-revise-root="${id}"]`);
  await p.waitForSelector('#jhaRevisionBanner, #jhaViewOnlyReason, #jhaOpenError', { timeout: 5000 });
  await p.waitForTimeout(150);
}
const fns = (n) => calls.slice(n).map((c) => c.fn);

let MON, WED, SAT, OTHER, before;
try {
  await check('Setup: three new JHAs filed through the phone and the REAL cs_portal_field_submit (then dated Mon / Wed / prior Sat)', async () => {
    MON = await newJha('Monday original (fictional): hangers, Level 2 east');
    WED = await newJha('Wednesday original (fictional): condenser piping, Room 302');
    SAT = await newJha('Saturday original (fictional): weekend tie-in');
    OTHER = '00000000-0000-4000-8000-0000000000ff';
    await q(`update cs_field_submissions set submitted_at = '2026-10-19T11:05:00Z' where id = $1`, [MON]);   // Mon 7:05 AM
    await q(`update cs_field_submissions set submitted_at = '2026-10-21T10:50:00Z' where id = $1`, [WED]);   // Wed 6:50 AM
    await q(`update cs_field_submissions set submitted_at = '2026-10-17T14:00:00Z' where id = $1`, [SAT]);   // prior Sat
    await q(`insert into cs_field_submissions (id, company_id, job_id, inspector_name, form_type, form_title, fields, submitted_at)
      values ($1, $2, $3, 'Other Person (fictional)', 'jha', 'JHA', '{"jhaDescriptionOfWork":"other job"}'::jsonb, '2026-10-21T12:00:00Z')`, [OTHER, G, J2]);
    const n = await q(`select count(*)::int as n from cs_field_submissions where form_type = 'jha'`);
    assert.equal(n[0].n, 4);
    before = await q(`select id, md5(row(s.*)::text) as m from cs_field_submissions s order by id`);
    await setClock('2026-10-22T16:00:00Z');   // Thursday Oct 22, 12:00 PM Indianapolis
  });

  await check('List from the real cs_jha_revisable: Wednesday then Monday, deadline Fri 6:00 PM; Saturday and other-job JHAs absent', async () => {
    const p = await open('ngform=jha');
    await p.click('#jhaReviseEntryBtn');
    await p.waitForSelector('#reviseJhaList .jha-rev-row', { timeout: 5000 });
    const rows = await p.$$eval('#reviseJhaList .jha-rev-row', (b) => b.map((x) => ({ id: x.getAttribute('data-revise-root'), t: x.innerText })));
    assert.deepEqual(rows.map((r) => r.id), [WED, MON]);
    for (const r of rows) { assert.match(r.t, /Revise until Fri, Oct 23, 6:00 PM/); assert.match(r.t, /Dana Fictional/); assert.match(r.t, /Original, not revised yet/); }
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  let rev1;
  await check('Revise Monday through the real SQL: Revision 1 stored, PDF at greiner/<revision id>.pdf attached, original row unchanged', async () => {
    const p = await open('ngform=jha');
    await openRevision(p, MON);
    assert.equal(await val(p, '#jhaDescriptionOfWork'), 'Monday original (fictional): hangers, Level 2 east');
    assert.match(await text(p, '#jhaRevisionBanner'), /Revision 1 of the JHA submitted Oct 19, 2026(,| at) 7:05 AM/);
    await p.fill('#jhaDescriptionOfWork', 'Monday REVISED (fictional): hangers plus east stair');
    const n = calls.length;
    await p.click('#jhaSubmitBtn');
    await p.waitForSelector('#jhaRevSaved', { timeout: 8000 });
    assert.deepEqual(fns(n), ['cs_jha_revise', 'edge:upload', 'cs_jha_revision_attach_pdf']);
    const rows = await q(`select * from cs_jha_revisions where original_id = $1`, [MON]);
    assert.equal(rows.length, 1);
    rev1 = rows[0];
    assert.equal(rev1.revision_number, 1);
    assert.equal(rev1.fields.jhaDescriptionOfWork, 'Monday REVISED (fictional): hangers plus east stair');
    assert.equal(rev1.pdf_path, `greiner/${rev1.id}.pdf`);
    assert.equal(rev1.submitted_by, 'Dana Fictional');
    assert.equal(rev1.signature, null);
    assert.equal(new Date(rev1.submitted_at).toISOString(), '2026-10-22T16:00:00.000Z', 'the server clock');
    const pdf = STORE[rev1.pdf_path];
    assert.ok(pdf && pdf.includes('Revision 1') && pdf.includes('Monday REVISED (fictional)'), 'the revised PDF');
    assert.match(await text(p, '#jhaRevSaved'), /Revision 1 saved\. The original and earlier revisions are kept\./);
    const pp = await callSql('cs_portal_field_pdf_path', { p_token: TOK, p_id: rev1.id }).catch((e) => ({ error: e.message }));
    assert.equal(pp.pdf_path, rev1.pdf_path, 'the edge "url" action can resolve the revision PDF: ' + JSON.stringify(pp));
    assert.deepEqual(await q(`select id, md5(row(s.*)::text) as m from cs_field_submissions s order by id`), before, 'originals never updated');
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  await check('Answer lost after the real insert: the retry sends the same key, the real SQL answers duplicate, one Revision 2', async () => {
    const p = await open('ngform=jha');
    await openRevision(p, MON);
    assert.equal(await val(p, '#jhaDescriptionOfWork'), 'Monday REVISED (fictional): hangers plus east stair', 'opens from the head');
    await p.fill('#jhaDescriptionOfWork', 'Monday Revision 2 (fictional)');
    dropNextReviseAnswer = true;
    const n = calls.length;
    await p.click('#jhaSubmitBtn');
    await p.waitForSelector('#jhaRevError', { timeout: 5000 });
    await p.click('#jhaSubmitBtn');
    await p.waitForSelector('#jhaRevSaved', { timeout: 8000 });
    const keys = calls.slice(n).filter((c) => c.fn === 'cs_jha_revise').map((c) => c.body.p_client_key);
    assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]);
    const rows = await q(`select revision_number, pdf_path from cs_jha_revisions where original_id = $1 order by revision_number`, [MON]);
    assert.deepEqual(rows.map((r) => r.revision_number), [1, 2]);
    assert.ok(rows[1].pdf_path, 'PDF attached to Revision 2');
    assert.match(await text(p, '#jhaRevSaved'), /Revision 2 saved\./);
    await p.close();
  });

  await check('Editor opened 5:59 PM Friday, submitted 6:00 PM: the real refusal shown plainly; nothing stored', async () => {
    await setClock('2026-10-23T21:59:00Z');
    const p = await open('ngform=jha');
    await openRevision(p, WED);
    await setClock('2026-10-23T22:00:00Z');
    await p.click('#jhaSubmitBtn');
    await p.waitForSelector('#jhaRevRefused', { timeout: 5000 });
    const msg = await text(p, '#jhaRevRefused');
    assert.match(msg, /^This JHA can no longer be revised: the revision window closed at Fri Oct 23, 2026 6:00 PM\.$/, msg);
    assert.equal((await q(`select count(*)::int as n from cs_jha_revisions where original_id = $1`, [WED]))[0].n, 0);
    await p.close();
  });

  await check('At 6:00 PM Friday the real list is empty and a closed JHA opens view-only (real cs_jha_current)', async () => {
    const p = await open('ngform=revisejha');
    await p.waitForSelector('#reviseJhaEmpty', { timeout: 5000 });
    await p.close();
    await setClock('2026-10-23T21:59:00Z');
    const p2 = await open('ngform=jha');
    await p2.click('#jhaReviseEntryBtn');
    await p2.waitForSelector('#reviseJhaList .jha-rev-row', { timeout: 5000 });
    await setClock('2026-10-23T22:00:00Z');
    await p2.click(`[data-revise-root="${WED}"]`);
    await p2.waitForSelector('#jhaViewOnlyReason', { timeout: 5000 });
    assert.match(await text(p2, '#jhaViewOnlyReason'), /The revision window closed at Fri, Oct 23, 6:00 PM\./);
    await p2.close();
  });

  await check('01 only: cs_portal_field_submit is the live body, byte for byte (md5 of prosrc unchanged by 01)', async () => {
    assert.equal(await submitMd5(), LIVE_SUBMIT_MD5);
  });

  await forkliftUnchanged('01 only: a forklift with the manual missing and NO gate answers is accepted exactly like today (phone form)', async () => {
    await setClock('2026-10-22T16:00:00Z');
    const count = async () => (await q(`select count(*)::int as n from cs_field_submissions where form_type = 'forklift'`))[0].n;
    const n0 = await count();
    const p = await open('ngform=forklift');
    assert.equal(await p.$('#flManualGate'), null, 'this build asks no missing-manual questions');
    await p.evaluate(() => document.querySelectorAll('#forkliftInspectionForm input[type=radio][value=safe]').forEach((r) => { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }));
    await p.evaluate(() => { const el = document.querySelector('#forkliftInspectionForm input[name="fl_chk_operator_manual"][value="defect"]'); el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await fillRequired(p, '#forkliftInspectionForm');
    await p.click('#forkliftSubmitBtn');
    await p.waitForSelector('#ngView', { timeout: 8000 });
    assert.equal(await count(), n0 + 1, 'stored');
    const row = (await q(`select fields, has_defects, defect_count, pdf_path from cs_field_submissions where form_type = 'forklift' order by submitted_at desc, created_at desc limit 1`))[0];
    assert.equal(row.fields.fl_chk_operator_manual, 'defect');
    assert.ok(!Object.keys(row.fields).some((k) => /^fl_manual_/.test(k)), 'no gate answers');
    assert.equal(row.has_defects, true);
    assert.ok(/^greiner\/.+\.pdf$/.test(row.pdf_path || ''), 'PDF attached as today: ' + row.pdf_path);
    assert.match(await p.innerText("#successTitle"), /Inspection Flagged/i);
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  await forkliftUnchanged('01 only: an old-client forklift payload (manual missing, no answers) is accepted exactly like today', async () => {
    const p = await open('ngform=forklift');
    const before = (await q(`select count(*)::int as n from cs_field_submissions where form_type = 'forklift'`))[0].n;
    const r = await p.evaluate(() => window.handleSaveData('', { form_type: 'inspection', inspection_subtype: 'forklift',
      has_defects: true, defect_count: 1, fields: { fl_chk_operator_manual: 'defect', forkliftVehicleId: 'FL-F1' } },
      document.getElementById('forkliftSubmitBtn'), 'Submit inspection').then(() => 'saved', (e) => e.message));
    assert.equal(r, 'saved');
    assert.equal((await q(`select count(*)::int as n from cs_field_submissions where form_type = 'forklift'`))[0].n, before + 1);
    await p.close();
  });
} finally {
  await browser.close();
  server.close();
}
await check('nothing left the machine (0 off-machine requests)', () => { assert.deepEqual(offMachine, []); });
if (failures) { console.log(`Revised JHA phone + release SQL verification FAILED (${failures} of ${checks + failures} checks).`); process.exit(1); }
console.log(`Revised JHA phone + release SQL verification passed (${checks} checks; PGlite + WebKit, fictional data, nothing sent).`);
