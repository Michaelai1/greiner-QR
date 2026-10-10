/* The phone's production path for equipment and JHA ladders, in a real browser
 * (WebKit), with every server call answered inside this test. Nothing leaves the
 * machine: Supabase RPC requests are fulfilled from the in-test state below and
 * anything else is blocked and recorded.
 *
 * The state mirrors sql/2026-10-05-equipment-management.sql: the server sends
 * only active units assigned to the session's job, and takes the employee from
 * the session and the time from its own clock.
 *
 * Needs playwright-webkit (PLAYWRIGHT_NODE_MODULES). SCREENSHOT_DIR saves screenshots.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(new URL('../', import.meta.url).pathname);
/* This repository is public: the real IU crew (kept in the dashboard's git-ignored
   provisioning/iu-c799-2025.local.json) must never appear in a file git would commit here. */
{
  const realFile = process.env.IU_LOCAL_FILE ||
    path.resolve(ROOT, '../greiner-dashboard-tony-feedback-2026-10-02/provisioning/iu-c799-2025.local.json');
  if (fs.existsSync(realFile)) {
    const { execFileSync } = await import('node:child_process');
    const real = JSON.parse(fs.readFileSync(realFile, 'utf8'));
    const needles = real.people.flatMap((p) => [p.name, p.mobile]).concat(real.pm_name ? [real.pm_name] : []);
    const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
    const hits = files.filter((f) => fs.existsSync(path.join(ROOT, f)) && fs.statSync(path.join(ROOT, f)).isFile())
      .filter((f) => { const b = fs.readFileSync(path.join(ROOT, f), 'utf8'); return needles.some((n) => b.includes(n)); });
    assert.deepEqual(hits, [], 'real IU names or mobiles in files git would commit');
  }
}
const req = createRequire(path.join(process.env.PLAYWRIGHT_NODE_MODULES || ROOT, 'noop.js'));
let webkit;
try { ({ webkit } = req('playwright-webkit')); } catch {
  console.log('Ladder production-path verification skipped (set PLAYWRIGHT_NODE_MODULES).');
  process.exit(0);
}
const SHOTS = process.env.SCREENSHOT_DIR || null;
const JSPDF_PATH = process.env.JSPDF_PATH ||
  path.resolve(ROOT, '../greiner-dashboard-tony-feedback-2026-10-02/tools/vendor/jspdf.umd.min.js');
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

/* ---------- the server, as this test plays it ---------- */
const IU = 'job-iu-c799', OTHER = 'job-other';
const SERVER_NOW = '2026-10-05T13:30:00.000Z';
let STATE;
function reset() {
  STATE = {
    deployed: true,
    user: { id: 'user-crew-two', name: 'Crew Two (Test)' },
    units: [
      { id: 'eq-lad-9', company: 'greiner', unit_number: 'LAD-9', equipment_type: 'Ladder', description: '8 ft fiberglass step ladder', job_id: IU, active: true, events: [] },
      { id: 'eq-lad-12', company: 'greiner', unit_number: 'LAD-12', equipment_type: 'Extension ladder', description: '24 ft extension', job_id: IU, active: true,
        events: [{ id: 'ev-1', kind: 'inspection_safe', at: '2026-10-02T11:05:00.000Z', by: 'Crew Six (Test)', by_user_id: 'u6', data: { attestation_version: 'ladder-safe-use-v1' } }] },
      { id: 'eq-sl-1', company: 'greiner', unit_number: 'SL-1930-01', equipment_type: 'Scissor lift', job_id: IU, active: true, events: [] },
      { id: 'eq-fl-1', company: 'greiner', unit_number: 'FL-07', equipment_type: 'Forklift', job_id: IU, active: true, events: [] },
      { id: 'eq-lad-free', company: 'greiner', unit_number: 'LAD-77', equipment_type: 'Ladder', job_id: null, active: true, events: [] },
      { id: 'eq-lad-other', company: 'greiner', unit_number: 'LAD-55', equipment_type: 'Ladder', job_id: OTHER, active: true, events: [] },
      { id: 'eq-lad-arch', company: 'greiner', unit_number: 'LAD-3', equipment_type: 'Ladder', job_id: null, active: false, archived_at: '2026-09-01', events: [] },
      { id: 'eq-x-1', company: 'another-co', unit_number: 'LAD-X1', equipment_type: 'Ladder', job_id: IU, active: true, events: [] }
    ],
    writes: []
  };
}
const visible = () => STATE.units.filter((u) => u.company === 'greiner' && u.active && !u.archived_at && u.job_id === IU);
const strip = (u) => ({ id: u.id, unit_number: u.unit_number, equipment_type: u.equipment_type, description: u.description || null,
  job_id: u.job_id, is_ladder: /\bladder/i.test(u.equipment_type), events: u.events.slice().reverse() });
const RPC = {
  cs_portal_field_home: () => ({ user: STATE.user.name, company: 'Greiner Brothers',
    jobs: [{ id: IU, job_number: 'C799-2025', name: 'IU Health Plaza G Med. Gas', address: '1330 N Senate Ave, Indianapolis, IN 46202',
      foreman_name: 'Lead Example (Test)', external_hotwork: false, hotwork_locations: [], enabled_forms: null, enabled_permits: null,
      user_forms: ['jha', 'hotwork', 'aerial', 'forklift'] }],
    people: [{ name: 'Lead Example (Test)', phone: null }, { name: 'Crew Two (Test)', phone: null }],
    hotwork_locations: [],
    equipment: visible().map((u) => ({ unit_number: u.unit_number, equipment_type: u.equipment_type, job_id: u.job_id })),
    recent: [] }),
  cs_portal_field_equipment: () => STATE.deployed ? { user: STATE.user, equipment: visible().map(strip) } : null,
  cs_portal_field_ladder_safe: (b) => {
    const u = visible().find((x) => x.id === b.p_equipment_id);
    if (!u) return { ok: false, error: 'not_assigned_to_your_job' };
    if (u.events.some((e) => e.kind === 'defect_reported' && !e.data.resolved_at)) return { ok: false, error: 'do_not_use' };
    if (b.p_attested !== true || b.p_attestation_version !== 'ladder-safe-use-v1') return { ok: false, error: 'attestation_required' };
    const ev = { id: 'srv-' + (STATE.writes.length + 1), kind: 'inspection_safe', at: SERVER_NOW, by: STATE.user.name, by_user_id: STATE.user.id, data: { attestation_version: 'ladder-safe-use-v1' } };
    u.events.push(ev);
    return { ok: true, id: ev.id, at: ev.at, by: ev.by, by_user_id: ev.by_user_id };
  },
  cs_portal_field_ladder_defect: (b) => {
    const u = visible().find((x) => x.id === b.p_equipment_id);
    if (!u) return { ok: false, error: 'not_assigned_to_your_job' };
    if (!String(b.p_description || '').trim()) return { ok: false, error: 'description_required' };
    if (b.p_acknowledged !== true) return { ok: false, error: 'acknowledgment_required' };
    const ev = { id: 'srv-' + (STATE.writes.length + 1), kind: 'defect_reported', at: SERVER_NOW, by: STATE.user.name, by_user_id: STATE.user.id,
      data: { description: b.p_description, has_photo: !!b.p_photo, resolved_at: null } };
    u.events.push(ev);
    return { ok: true, id: ev.id, at: ev.at, by: ev.by, by_user_id: ev.by_user_id };
  }
};

const offMachine = [], rpcCalls = [];
let checks = 0, failures = 0;
async function check(name, fn) {
  try { await fn(); checks++; console.log(`  ok  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${name}\n       ${String(e.stack || e.message).split('\n').slice(0, 4).join('\n       ')}`); }
}
const browser = await webkit.launch();
async function open(query, width = 390, { laddersLive = true } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  // Ladder ID selection is demo-only in production until launch; these tests
  // exercise the launch-ready path unless told otherwise.
  if (laddersLive) await page.addInitScript(() => { window.__ladderIdsLive = true; });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
    if (JSPDF && /cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\//.test(u)) return r.fulfill({ body: JSPDF, contentType: 'application/javascript' });
    const m = u.match(/^https:\/\/gvfolfzseqwhhimbxgjv\.supabase\.co\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (m) {
      const body = JSON.parse(r.request().postData() || '{}');
      rpcCalls.push({ fn: m[1], body });
      const f = RPC[m[1]], out = f ? f(body) : null;
      if (out == null) return r.fulfill({ status: 404, contentType: 'application/json',
        body: JSON.stringify({ message: `Could not find the function public.${m[1]} in the schema cache` }) });
      if (m[1].startsWith('cs_portal_field_ladder_')) STATE.writes.push({ fn: m[1], body });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
    }
    offMachine.push(u); return r.abort();
  });
  await page.goto(BASE + 'index.html?ticket=test-ticket-not-real&' + query);
  await page.waitForTimeout(700);
  return page;
}
const text = (p, sel) => p.locator(sel).innerText();
const options = (p) => p.$$eval('[data-ladder-opt]', (b) => b.map((x) => x.getAttribute('data-ladder-opt')));
async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false });
}
async function ladderYes(p) {
  await p.check('input[name=jhaLadderUse][value=yes]');
  await p.waitForTimeout(100);
  await p.locator('#jhaLadderPanel').scrollIntoViewIfNeeded();
}

try {
  reset();
  await check('Assigned IU ladders are offered in the IU JHA; unassigned, other-job, archived and other-company units are not', async () => {
    const p = await open('ngform=jha');
    await ladderYes(p);
    assert.deepEqual(await options(p), ['LAD-12', 'LAD-9']);
    assert.ok((await text(p, '[data-ladder-opt="LAD-12"]')).includes('Last inspected'), 'history from the server');
    assert.equal(await p.$('#jhaLadderId'), null, 'no free-text ladder field');
    const pageText = await p.innerText('body');
    assert.ok(!/LAD-101|DEMO-|LAD-77|LAD-55|LAD-X1|LAD-3\b/.test(pageText), 'no demo, unassigned, other-job or other-company ladder');
    assert.equal(await p.evaluate(() => !!window.NG.demo), false, 'production path, not demo');
    await shot(p, '08-phone-iu-jha-ladder-selection');
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  await check('Safe-use check: the server records the session employee and its own time; the phone sends neither', async () => {
    const p = await open('ngform=jha');
    await ladderYes(p);
    await p.click('[data-ladder-opt="LAD-9"]');
    await p.click('[data-lad-inspect="LAD-9"]');
    assert.ok((await text(p, '[data-lad-panel="inspect"]')).includes('Crew Two (Test)'), 'inspector is the signed-in employee');
    await p.check('[data-lad-attest="LAD-9"]');
    await p.click('[data-lad-confirm="LAD-9"]');
    await p.waitForSelector('[data-ladder-card="LAD-9"] .jha-ladder-ok');
    const w = STATE.writes.at(-1);
    assert.equal(w.fn, 'cs_portal_field_ladder_safe');
    assert.equal(w.body.p_equipment_id, 'eq-lad-9');
    assert.equal(w.body.p_attested, true);
    assert.equal(w.body.p_attestation_version, 'ladder-safe-use-v1');
    assert.ok(!Object.keys(w.body).some((k) => /name|user|time|_at$|date/i.test(k)), 'no identity or time in the request: ' + Object.keys(w.body));
    // Production JHAs have no root id until the production revision chain is connected,
    // so none is invented; the JHA carries the server's record id instead.
    assert.equal(w.body.p_jha_root_id, null);
    const checksField = await p.$eval('[name="jhaLadderChecks"]', (i) => i.value);
    assert.ok(checksField.includes('"record_id":"srv-1"'), 'the JHA stores the server record id of today’s check');
    const card = await text(p, '[data-ladder-card="LAD-9"]');
    assert.ok(card.includes('Confirmed safe for use today · Crew Two (Test) · Oct 5, 2026'), card);
    const rec = await p.evaluate(() => window.NG.ladderInspections.at(-1));
    assert.equal(rec.inspected_at, SERVER_NOW, 'the stored time is the server’s');
    await p.close();
  });

  await check('A defect makes the ladder Do Not Use; it cannot be confirmed safe and the phone offers no way to clear it', async () => {
    const p = await open('ngform=jha');
    await ladderYes(p);
    await p.click('[data-ladder-opt="LAD-12"]');
    await p.click('[data-lad-defect="LAD-12"]');
    await p.fill('[data-lad-desc="LAD-12"]', 'Bent rung');
    await p.check('[data-lad-defack="LAD-12"]');
    await p.click('[data-lad-savedef="LAD-12"]');
    await p.waitForSelector('[data-ladder-card="LAD-12"] .jha-ladder-dnu');
    assert.equal(STATE.writes.at(-1).fn, 'cs_portal_field_ladder_defect');
    assert.equal(await p.$('[data-lad-inspect="LAD-12"]'), null, 'no inspect button on a Do Not Use ladder');
    assert.ok(!/resolve|clear/i.test(await text(p, '[data-ladder-card="LAD-12"]')));
    await p.close();
    const p2 = await open('ngform=jha');   // a new JHA still sees it as unsafe
    await ladderYes(p2);
    assert.ok((await text(p2, '[data-ladder-opt="LAD-12"]')).includes('DO NOT USE'));
    await p2.close();
  });

  await check('A server refusal is shown and nothing is recorded on the phone', async () => {
    const p = await open('ngform=jha');
    await ladderYes(p);
    await p.click('[data-ladder-opt="LAD-9"]');
    // Another phone reports a defect after this page loaded.
    STATE.units.find((u) => u.id === 'eq-lad-9').events.push({ id: 'ev-x', kind: 'defect_reported', at: SERVER_NOW, by: 'Crew Six (Test)', data: { description: 'Loose foot', resolved_at: null } });
    const before = await p.evaluate(() => window.NG.ladderInspections.length);
    await p.click('[data-lad-inspect="LAD-9"]');
    await p.check('[data-lad-attest="LAD-9"]');
    await p.click('[data-lad-confirm="LAD-9"]');
    await p.waitForSelector('[data-ladder-card="LAD-9"] .err');
    assert.match(await text(p, '[data-ladder-card="LAD-9"] .err'), /marked Do Not Use and cannot be confirmed safe/);
    assert.equal(await p.evaluate(() => window.NG.ladderInspections.length), before);
    assert.ok(!(await text(p, '[data-ladder-card="LAD-9"]')).includes('Confirmed safe for use today'));
    await p.close();
  });

  await check('Unassigning a ladder removes it from new IU JHAs; none assigned blocks ladder use', async () => {
    reset();
    STATE.units.find((u) => u.id === 'eq-lad-9').job_id = null;
    let p = await open('ngform=jha');
    await ladderYes(p);
    assert.deepEqual(await options(p), ['LAD-12']);
    await p.close();
    STATE.units.find((u) => u.id === 'eq-lad-12').job_id = null;
    p = await open('ngform=jha');
    await ladderYes(p);
    assert.equal(await text(p, '#jhaNoLadders'), 'No ladders are assigned to this job. Contact the office before using a ladder.');
    await shot(p, '09d-phone-iu-no-ladders-assigned');
    await p.close();
  });

  await check('Historical JHA snapshots stay readable after a ladder leaves the job', async () => {
    const p = await open('ngform=jha');
    const items = await p.evaluate(() => {
      const M = window.JhaModel;
      const data = { jhaLadderUse: 'yes', jhaLadderIds: ['LAD-9'], jhaLadderChecks: [{ ladder_id: 'LAD-9', description: '8 ft fiberglass step ladder',
        last_inspected_at: '2026-10-02T11:05:00.000Z', last_inspected_by: 'Crew Six (Test)', status: 'no-open-defects',
        status_label: 'No open defects reported', open_defect: null,
        todays_check: { record_id: 'srv-1', result: 'safe', at: '2026-10-05T13:30:00.000Z', by: 'Crew Two (Test)', attestation_version: 'ladder-safe-use-v1' } }] };
      return M.jhaSections(data, { crew: { employees: [], groups: [] } }).flatMap((s) => s.items.map((i) => i.label + ' = ' + i.value));
    });
    assert.ok(items.includes('Which ladder or ladders will be used today? = LAD-9'));
    assert.ok(items.some((i) => i.startsWith('Ladder LAD-9') && i.includes('Crew Two (Test)')), items.join('\n'));
    await p.close();
  });

  await check('Aerial picker lists only the job’s lifts — never a ladder or forklift', async () => {
    reset();
    const p = await open('ngform=aerial');
    await p.waitForSelector('#aerialAssetSelect');
    const opts = await p.$$eval('#aerialAssetSelect option', (o) => o.map((x) => x.value).filter((v) => v && v !== '__other__'));
    assert.deepEqual(opts, ['SL-1930-01']);
    assert.equal(await p.$eval('[name="aerialVehicleId"]', (i) => i.value), 'SL-1930-01', 'the only lift is preselected');
    await p.locator('#aerialAssetSelect').scrollIntoViewIfNeeded();
    await shot(p, '07-phone-equipment-list');
    await p.close();
  });

  await check('Production default: ladder use asks only who will inspect the ladders; no ladder ID picker, records never block', async () => {
    reset();
    STATE.units.forEach((u) => { if (/ladder/i.test(u.equipment_type)) u.job_id = null; });   // no ladders on the job
    const p = await open('ngform=jha', 390, { laddersLive: false });
    await p.check('input[name=jhaLadderUse][value=yes]');
    await p.waitForTimeout(150);
    assert.equal(await p.$eval('#jhaLadderPanel', (e) => e.style.display), '', 'the ladder inspector question shows');
    assert.equal(await p.$eval('#jhaLadderIdPanel', (e) => e.style.display), 'none', 'no ladder ID picker in production yet');
    assert.equal(await p.$('[data-ladder-opt]:visible'), null);
    assert.ok(!/No ladders are assigned|not connected/.test(await text(p, 'body')), 'no ladder warning');
    assert.equal(await p.evaluate(() => window.NG.jhaSubmitCheck()), 'Select at least one person who will inspect the ladders prior to use.');
    await p.click('[data-ladder-person="Crew Two (Test)"]');
    const msg = await p.evaluate(() => window.NG.jhaSubmitCheck());
    assert.ok(!/ladder/i.test(msg || ''), 'with an inspector picked, ladder records never block submit: ' + msg);
    await p.close();
  });

  await check('Before the database update, the JHA says ladder records are not connected (no fallback to demo data)', async () => {
    reset(); STATE.deployed = false;
    const p = await open('ngform=jha');
    await ladderYes(p);
    assert.match(await text(p, '#jhaLadderOptions'), /Ladder records are not connected for this job yet/);
    assert.equal(await p.evaluate(() => window.NG.ladders || null), null);
    await p.close();
  });

  await check('No overflow at 390, 820, 1024 and 1440', async () => {
    reset();
    for (const w of [390, 820, 1024, 1440]) {
      const p = await open('ngform=jha', w);
      await ladderYes(p);
      await p.click('[data-ladder-opt="LAD-9"]');
      await p.click('[data-lad-inspect="LAD-9"]');
      const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      assert.ok(o.sw <= o.cw + 1, `${w}: ${o.sw} > ${o.cw}`);
      assert.deepEqual(p.errors, []);
      await p.close();
    }
  });

  await check('Only the expected RPCs were called, and nothing else left the machine', async () => {
    const names = [...new Set(rpcCalls.map((c) => c.fn))].sort();
    assert.deepEqual(names, ['cs_portal_field_equipment', 'cs_portal_field_home', 'cs_portal_field_ladder_defect', 'cs_portal_field_ladder_safe']);
    assert.ok(rpcCalls.every((c) => c.body.p_token === 'test-ticket-not-real'));
    assert.deepEqual(offMachine, []);
  });
} finally {
  await browser.close();
  server.close();
}
if (failures) { console.log(`Ladder production-path verification FAILED (${failures} failing, ${checks} passing).`); process.exit(1); }
console.log(`Ladder production-path verification passed (${checks} checks, server answered in-test, no network).`);
