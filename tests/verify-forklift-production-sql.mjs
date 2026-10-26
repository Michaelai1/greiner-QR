/* The phone's forklift questions against the REAL forklift server rule (end to end, local only), for the
 * forklift candidate built on the live JHA release (greiner-QR 8c8236e + the forklift questions).
 * Oct 23 meeting rule: EVERY forklift inspection needs a Yes to "Confirm you are a trained competent person
 * for this equipment"; with the manual missing, also supervisor aware (Yes), authorizing (Yes) and the
 * supervisor's name typed.
 *
 * PGlite runs the server step unchanged
 *   (greiner-dashboard-release-2026-10-22/sql/forklift-2026-10-24/F2-forklift-enforcement.sql)
 * on that worktree's test schema over the live function bodies (the coordinator's read-only live-defs copy).
 * Two phone pages talk to that database in WebKit at 390 px:
 *   - this build (index.html), which asks the questions, and
 *   - the live page as it is today (git show 8c8236e:index.html), standing in for a phone that still has the
 *     old page cached and never asks them.
 * A third path calls cs_portal_field_submit directly, as a script would through the API.
 * Any "No", a missing answer or a blank supervisor name must leave nothing stored, on every path.
 *
 * Fictional company, job and people. Nothing leaves the machine.
 * Needs PLAYWRIGHT_NODE_MODULES, PGLITE_NODE_MODULES and JSPDF_PATH. Skips cleanly without them or
 * without the server SQL (RELEASE_SQL_ROOT, default ../greiner-dashboard-release-2026-10-22) or LIVE_DEFS.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(new URL('../', import.meta.url).pathname);
const SROOT = process.env.RELEASE_SQL_ROOT || path.resolve(ROOT, '../greiner-dashboard-release-2026-10-22');
const MIG2 = path.join(SROOT, 'sql/forklift-2026-10-24/F2-forklift-enforcement.sql');
const SCHEMA = path.join(SROOT, 'tests/release-sql/fixture-schema.sql');
const LIVE_DEFS = process.env.LIVE_DEFS ||
  path.join(os.homedir(), '.nextgen-hq/coordinator/run-2026-10-22-release/live-defs/live-functions-2026-10-22-1720.sql');
const LIVE_COMMIT = '8c8236e';
for (const f of [MIG2, SCHEMA, LIVE_DEFS]) {
  if (!fs.existsSync(f)) { console.log(`Forklift phone + F2 server rule verification skipped (${f} not found).`); process.exit(0); }
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
  console.log('Forklift phone + F2 server rule verification skipped (set PLAYWRIGHT_NODE_MODULES, PGLITE_NODE_MODULES and JSPDF_PATH).');
  process.exit(0);
}
const JSPDF = fs.readFileSync(JSPDF_PATH);
// The page phones run today: the old page a cached phone still shows.
const OLD_PAGE = execFileSync('git', ['-C', ROOT, 'show', `${LIVE_COMMIT}:index.html`], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');

let checks = 0, failures = 0;
async function check(name, fn) {
  try { await fn(); checks++; console.log(`  ok  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${name}\n       ${String(e.stack || e.message).split('\n').slice(0, 5).join('\n       ')}`); }
}

/* ---- the database: schema + live bodies + F2, unchanged ---- */
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(fs.readFileSync(SCHEMA, 'utf8'));
await db.exec(fs.readFileSync(LIVE_DEFS, 'utf8'));
await db.exec(fs.readFileSync(MIG2, 'utf8'));
const q = async (s, p = []) => (await db.query(s, p)).rows;

const G = 'f0000000-0000-4000-8000-0000000000a1', J1 = 'f0000000-0000-4000-8000-000000000301';
const U1 = 'f0000000-0000-4000-8000-000000000501';
const TOK = 'fake-phone-field-ticket';
await q(`insert into cs_companies (id, name) values ($1, 'Greiner Brothers (fictional test copy)')`, [G]);
await q(`insert into cs_jobs (id, company_id, job_number, name) values ($1, $2, 'C900-F', 'Maple Street Clinic (fictional)')`, [J1, G]);
await q(`insert into cs_portal_sessions (token, company_id, scope, slug, expires_at, user_id, user_name, job_ids)
  values ($1, $2, 'field', 'greiner', now() + interval '2 days', $3, 'Dana Fictional', array[$4]::uuid[])`, [TOK, G, U1, J1]);

async function callSql(fn, body) {
  const keys = Object.keys(body);
  const args = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
  const vals = keys.map((k) => (body[k] !== null && typeof body[k] === 'object') ? JSON.stringify(body[k]) : body[k]);
  return (await q(`select public.${fn}(${args}) as r`, vals))[0].r;
}
const SQL_FNS = new Set(['cs_portal_field_submit', 'cs_portal_field_attach_pdf']);
const HOME = { user: 'Dana Fictional', company: 'Greiner Brothers',
  jobs: [{ id: J1, job_number: 'C900-F', name: 'Maple Street Clinic (fictional)', address: '1 Maple St (fictional)', foreman_name: 'Dana Fictional',
    external_hotwork: false, hotwork_locations: [], enabled_forms: null, enabled_permits: null, user_forms: ['jha', 'hotwork', 'aerial', 'forklift'] }],
  people: [{ name: 'Dana Fictional', phone: null }], hotwork_locations: [],
  equipment: [{ unit_number: 'FL-F1', equipment_type: 'Forklift', job_id: J1 }], recent: [] };

/* ---- the phone pages, talking to that database ---- */
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css' };
const server = http.createServer((rq, rs) => {
  const p = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
  if (p === '/old.html') { rs.writeHead(200, { 'Content-Type': 'text/html' }); return rs.end(OLD_PAGE); }
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end(); }
  rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
const offMachine = [], calls = [], STORE = {};
const browser = await webkit.launch();
async function open(file, query) {
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
      try { return reply(200, await callSql(m[1], body)); } catch (e) { return reply(400, { code: 'P0001', message: e.message }); }
    }
    if (u === 'https://gvfolfzseqwhhimbxgjv.supabase.co/functions/v1/field-pdf') {
      const body = JSON.parse(r.request().postData() || '{}');
      calls.push({ fn: 'edge:' + body.action, body: { id: body.id } });
      if (body.action !== 'upload' || body.ticket !== TOK) return reply(400, { error: 'bad request' });
      const p = `greiner/${body.id}.pdf`;   // what the live edge function does: store, then attach
      STORE[p] = Buffer.from(body.pdf_base64 || '', 'base64').toString('latin1').replace(/\\([()\\])/g, '$1');
      await callSql('cs_portal_field_attach_pdf', { p_token: body.ticket, p_id: body.id, p_pdf_path: p });
      return reply(200, { ok: true });
    }
    offMachine.push(u); return r.abort();
  });
  await page.goto(BASE + file + '?ticket=' + TOK + '&' + query);
  await page.waitForTimeout(600);
  return page;
}
const forklifts = async () => (await q(`select count(*)::int as n from cs_field_submissions where form_type = 'forklift'`))[0].n;
const latestForklift = async () => (await q(`select id, fields, signature, has_defects, pdf_path from cs_field_submissions where form_type = 'forklift' order by submitted_at desc, created_at desc limit 1`))[0];
const submits = (n) => calls.slice(n).filter((c) => c.fn === 'cs_portal_field_submit').length;
async function fillRequired(page) {
  for (let pass = 0; pass < 3; pass++) await page.evaluate(() => {
    const form = document.querySelector('#forkliftInspectionForm'); const seen = {};
    form.querySelectorAll('[required]').forEach((el) => {
      if (el.offsetParent === null || el.disabled || el.closest('.fl-manual-gate') || el.name === 'fl_competent_person') return;
      if (el.type === 'radio') { if (seen[el.name]) return; seen[el.name] = 1;
        if (![...form.querySelectorAll(`input[name="${el.name}"]`)].some((x) => x.checked)) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); } return; }
      if (el.type === 'checkbox') { if (!el.checked) el.click(); return; }
      if (el.value) return;
      if (el.tagName === 'SELECT') { const o = [...el.options].find((x) => x.value); if (o) { el.value = o.value; el.dispatchEvent(new Event('change', { bubbles: true })); } return; }
      el.value = el.type === 'time' ? '07:00' : el.type === 'date' ? '2026-10-19' : el.type === 'number' ? '1' : 'Fictional ' + (el.name || el.id);
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}
// Every checklist row "Yes" (safe), then the manual row as asked.
async function startForklift(file, manual) {
  const p = await open(file, 'ngform=forklift');
  await p.evaluate(() => document.querySelectorAll('#forkliftInspectionForm input[type=radio][value=safe]').forEach((r) => { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }));
  await p.evaluate((v) => { const el = document.querySelector(`#forkliftInspectionForm input[name="fl_chk_operator_manual"][value="${v}"]`); el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }, manual);
  await fillRequired(p);
  return p;
}
const answer = (p, name, v) => p.evaluate(([n, val]) => { const el = document.querySelector(`#forkliftInspectionForm input[name="${n}"][value="${val}"]`); el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }, [name, v]);
const Q = ['fl_competent_person', 'fl_manual_supervisor_aware', 'fl_manual_supervisor_authorizes'];
const SUPERVISOR = 'Pat Fictional-Supervisor';
const TRAINED_ERR = /forklift: answer the trained competent person question/;
const MANUAL_ERR = /forklift: missing manual answers incomplete/;

try {
  await check('the database is the live submit body plus only the F2 forklift block', async () => {
    const src = (await q(`select prosrc from pg_proc where oid = to_regprocedure('public.cs_portal_field_submit(text,text,text,text,jsonb,jsonb,text,boolean,integer,text)')`))[0].prosrc;
    assert.match(src, /\[forklift 2026-10-24 gate: begin\]/);
    assert.match(src, TRAINED_ERR); assert.match(src, MANUAL_ERR);
  });

  await check('this build, manual present + trained Yes: stored, the answer recorded, no supervisor fields, PDF attached', async () => {
    const n0 = await forklifts();
    const p = await startForklift('index.html', 'safe');
    assert.equal(await p.locator('#flManualGate').isHidden(), true);
    await answer(p, 'fl_competent_person', 'yes');
    await p.click('#forkliftSubmitBtn');
    await p.waitForSelector('#ngView', { timeout: 8000 });
    assert.equal(await forklifts(), n0 + 1);
    const row = await latestForklift();
    assert.equal(row.fields.fl_chk_operator_manual, 'safe');
    assert.equal(row.fields.fl_competent_person, 'yes');
    assert.ok(!Object.keys(row.fields).some((k) => /^fl_manual_/.test(k)), 'no supervisor answers sent');
    assert.ok(/^greiner\/.+\.pdf$/.test(row.pdf_path || ''), 'PDF attached: ' + row.pdf_path);
    assert.ok((STORE[row.pdf_path] || '').includes('(self-reported)'), 'the PDF calls the confirmation self-reported');
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  await check('this build, manual present, trained unanswered: the phone stops it; nothing reaches the server', async () => {
    const n0 = await forklifts(), c0 = calls.length;
    const p = await startForklift('index.html', 'safe');
    await p.click('#forkliftSubmitBtn');
    await p.waitForTimeout(400);
    assert.equal(submits(c0), 0); assert.equal(await forklifts(), n0);
    await p.close();
  });

  await check('this build, manual missing, Yes / Yes / Yes + name: accepted; answers and name stored as typed; name on the PDF, never as a signature', async () => {
    const n0 = await forklifts();
    const p = await startForklift('index.html', 'defect');
    for (const name of Q) await answer(p, name, 'yes');
    await p.fill('#flManualSupervisorName', SUPERVISOR);
    await p.click('#forkliftSubmitBtn');
    await p.waitForSelector('#ngView', { timeout: 8000 });
    assert.equal(await forklifts(), n0 + 1);
    const row = await latestForklift();
    assert.equal(row.fields.fl_chk_operator_manual, 'defect');
    assert.deepEqual(Q.map((k) => row.fields[k]), ['yes', 'yes', 'yes']);
    assert.equal(row.fields.fl_manual_supervisor_name, SUPERVISOR);
    assert.notEqual(row.signature, SUPERVISOR, 'the supervisor name is not a signature');
    assert.equal(row.has_defects, true, 'the missing manual is still a flagged defect');
    const pdf = STORE[row.pdf_path] || '';
    assert.ok(pdf.includes(SUPERVISOR) && pdf.includes('typed by the inspector'), 'the PDF names the supervisor as typed by the inspector');
    assert.match(await p.innerText('#successTitle'), /Inspection Flagged/i);
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  for (const [i, name] of Q.entries()) {
    await check(`this build, manual missing, "No" to ${name}: the phone stops it, nothing reaches the server, nothing stored`, async () => {
      const n0 = await forklifts(), c0 = calls.length;
      const p = await startForklift('index.html', 'defect');
      for (const earlier of Q.slice(0, i)) await answer(p, earlier, 'yes');
      await answer(p, name, 'no');
      assert.equal(await p.locator('#flManualBlock').isVisible(), true, 'the stop message shows');
      assert.equal(await p.$eval('#forkliftSubmitBtn', (b) => b.disabled), true, 'Submit is disabled');
      await p.$eval('#forkliftInspectionForm', (f) => f.requestSubmit ? f.requestSubmit() : f.submit());
      await p.waitForTimeout(400);
      assert.equal(submits(c0), 0, 'no submit call');
      assert.equal(await forklifts(), n0);
      await p.close();
    });
  }

  await check('this build, all Yes but a blank or spaces-only name: refused by the phone; nothing stored', async () => {
    const n0 = await forklifts(), c0 = calls.length;
    const p = await startForklift('index.html', 'defect');
    for (const name of Q) await answer(p, name, 'yes');
    await p.fill('#flManualSupervisorName', '   ');
    await p.click('#forkliftSubmitBtn');
    await p.waitForTimeout(400);
    assert.equal(submits(c0), 0);
    assert.equal(await forklifts(), n0);
    await p.close();
  });

  for (const [what, fields, re, msg] of [
    ['trained No in the payload', { fl_chk_operator_manual: 'safe', fl_competent_person: 'no', forkliftVehicleId: 'FL-F1' }, TRAINED_ERR, /^Not saved\. Every forklift inspection needs a Yes/],
    ['manual missing without the supervisor answers', { fl_chk_operator_manual: 'defect', fl_competent_person: 'yes', forkliftVehicleId: 'FL-F1' }, MANUAL_ERR, /^Not saved\. The operator’s manual is marked missing/]]) {
    await check(`this build, phone check bypassed (${what}): the real rule refuses, nothing stored, and the page says why`, async () => {
      const n0 = await forklifts();
      const p = await open('index.html', 'ngform=forklift');
      await answer(p, 'fl_competent_person', 'yes');   // the screen passes the phone's own check; the payload does not
      const r = await p.evaluate((f) => window.handleSaveData('', { form_type: 'inspection', inspection_subtype: 'forklift', has_defects: true, defect_count: 1, fields: f },
        document.getElementById('forkliftSubmitBtn'), 'Submit inspection').then(() => 'saved', (e) => e.message), fields);
      assert.match(r, re);
      assert.equal(await forklifts(), n0);
      await p.waitForSelector('#flServerRefusal', { timeout: 5000 });
      assert.match(await p.innerText('#flServerRefusal'), msg);
      await p.close();
    });
  }

  for (const manual of ['defect', 'safe']) {
    await check(`old cached page (live 8c8236e, never asks), manual ${manual === 'safe' ? 'present' : 'missing'}: refused by the real rule; nothing stored; the server's words are shown`, async () => {
      const n0 = await forklifts(), c0 = calls.length;
      const p = await startForklift('old.html', manual);
      assert.equal(await p.$('#flCompetent'), null, 'the old page has no trained question');
      await p.click('#forkliftSubmitBtn');
      await p.waitForTimeout(1500);
      assert.equal(submits(c0), 1, 'the old page did send it');
      assert.equal(await forklifts(), n0, 'and the server stored nothing');
      assert.equal(await p.locator('#ngView').isVisible().catch(() => false), false, 'no success screen');
      assert.match(await p.$eval('#toast-container', (e) => e.innerText), /trained competent person question/, 'the old page shows the server message');
      await p.close();
    });
  }

  await check('direct API call (a script, no phone): every incomplete answer set is refused with the right reason; complete sets are stored', async () => {
    const base = { p_token: TOK, p_form_type: 'forklift', p_form_title: 'Forklift Inspection', p_asset_id: 'FL-F1', p_photos: [], p_signature: null, p_has_defects: true, p_defect_count: 1, p_pdf_path: null };
    const present = { fl_chk_operator_manual: 'safe', fl_competent_person: 'yes' };
    const missing = { fl_chk_operator_manual: 'defect', fl_competent_person: 'yes', fl_manual_supervisor_aware: 'yes', fl_manual_supervisor_authorizes: 'yes', fl_manual_supervisor_name: SUPERVISOR };
    const bad = [[present, { fl_competent_person: undefined }, TRAINED_ERR], [present, { fl_competent_person: 'no' }, TRAINED_ERR], [present, { fl_competent_person: ' maybe ' }, TRAINED_ERR],
      [missing, { fl_competent_person: undefined }, TRAINED_ERR], [missing, { fl_manual_supervisor_aware: 'no' }, MANUAL_ERR], [missing, { fl_manual_supervisor_authorizes: 'no' }, MANUAL_ERR],
      [missing, { fl_manual_supervisor_name: '' }, MANUAL_ERR], [missing, { fl_manual_supervisor_name: ' \t ' }, MANUAL_ERR], [missing, { fl_manual_supervisor_aware: undefined }, MANUAL_ERR]];
    const n0 = await forklifts();
    for (const [okSet, change, re] of bad) {
      const fields = JSON.parse(JSON.stringify({ ...okSet, ...change }));
      await assert.rejects(callSql('cs_portal_field_submit', { ...base, p_fields: fields }), re, JSON.stringify(change));
    }
    assert.equal(await forklifts(), n0, 'nothing stored');
    await callSql('cs_portal_field_submit', { ...base, p_fields: present });
    await callSql('cs_portal_field_submit', { ...base, p_fields: { ...missing, fl_competent_person: ' YES ' } });
    assert.equal(await forklifts(), n0 + 2, 'complete sets stored (case and spaces tolerated, as before)');
  });

  await check('other forms unchanged: an aerial inspection with no forklift answers is stored by the same submit', async () => {
    const n0 = (await q(`select count(*)::int as n from cs_field_submissions where form_type = 'aerial_platform'`))[0].n;
    await callSql('cs_portal_field_submit', { p_token: TOK, p_form_type: 'aerial_platform', p_form_title: 'Aerial Platform Inspection', p_asset_id: 'AL-F1', p_fields: { x: 'safe' }, p_photos: [], p_signature: null, p_has_defects: false, p_defect_count: 0, p_pdf_path: null });
    assert.equal((await q(`select count(*)::int as n from cs_field_submissions where form_type = 'aerial_platform'`))[0].n, n0 + 1);
  });

  await check('other forms unchanged: a JHA from this build is stored by the same submit', async () => {
    const n0 = (await q(`select count(*)::int as n from cs_field_submissions where form_type = 'jha'`))[0].n;
    const p = await open('index.html', 'ngform=jha');
    await p.evaluate(() => ['jhaLadderUse', 'jhaAerialUse'].forEach((n) => { const el = document.querySelector(`#jhaForm input[name="${n}"][value="no"]`); if (el) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); } }));
    for (let pass = 0; pass < 3; pass++) await p.evaluate(() => {
      const form = document.querySelector('#jhaForm'); const seen = {};
      form.querySelectorAll('[required]').forEach((el) => {
        if (el.offsetParent === null || el.disabled) return;
        if (el.type === 'radio') { if (seen[el.name]) return; seen[el.name] = 1; if (![...form.querySelectorAll(`input[name="${el.name}"]`)].some((x) => x.checked)) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); } return; }
        if (el.type === 'checkbox') { if (!el.checked) el.click(); return; }
        if (el.value) return;
        if (el.tagName === 'SELECT') { const o = [...el.options].find((x) => x.value); if (o) { el.value = o.value; el.dispatchEvent(new Event('change', { bubbles: true })); } return; }
        el.value = el.type === 'time' ? '07:00' : el.type === 'date' ? '2026-10-19' : el.type === 'number' ? '1' : 'Fictional ' + (el.name || el.id);
        el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
    await p.click('#jhaSubmitBtn');
    await p.waitForSelector('#ngView', { timeout: 8000 });
    assert.equal((await q(`select count(*)::int as n from cs_field_submissions where form_type = 'jha'`))[0].n, n0 + 1);
    await p.close();
  });
} finally {
  await browser.close();
  server.close();
}
await check('nothing left the machine (0 off-machine requests)', () => { assert.deepEqual(offMachine, []); });
if (failures) { console.log(`Forklift phone + F2 server rule verification FAILED (${failures} of ${checks + failures} checks).`); process.exit(1); }
console.log(`Forklift phone + F2 server rule verification passed (${checks} checks; PGlite + WebKit, fictional data, nothing sent).`);
