/* Choice on the shared phone page (toolbox.html#token), in a real browser (WebKit). The link calls are answered
 * inside this test; nothing leaves the machine and nothing is recorded anywhere. Fictional names only.
 *   - a Choice supervisor link: Choice's own talk file, "Supervisor-led group talk", the crew tick list, one submit;
 *   - Tony's Choice link (role observer): his own view-only copy, no completion step, no submit, ever;
 *   - company isolation on the page: a Choice link never opens a Greiner talk and vice versa;
 *   - Greiner links unchanged (foreman-led wording, Greiner's own Hot Work file, individual completion).
 * Needs playwright-webkit (PLAYWRIGHT_NODE_MODULES).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const ROOT = path.resolve(new URL('../', import.meta.url).pathname);
const req = createRequire(path.join(process.env.PLAYWRIGHT_NODE_MODULES || ROOT, 'noop.js'));
let webkit;
try { ({ webkit } = req('playwright-webkit')); } catch { console.log('Choice shared link verification skipped (set PLAYWRIGHT_NODE_MODULES).'); process.exit(0); }

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((rq, rs) => {
  const p = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end(); }
  rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const CREW = ['Sam Supervisor-A', 'Sid O\'Supervisor', 'Sue Supervisor-B', 'Tom Tech-1', 'Tia Tech-2', 'Ted "T" Tech-3'];
const TITLE = 'Hot Work Talk 1: General Awareness and Tips';
const LINKS = {
  choiceLead: { company: 'Choice', talk_key: 'choice-hot-work-talk1', talk_title: TITLE, recipient_name: 'Sam Supervisor-A',
    week_start: '2026-10-26', already_done: false, submitted_at: null, role: 'leader', group_label: 'Choice crew (CREW)', roster: CREW },
  choiceOwner: { company: 'Choice', talk_key: 'choice-hot-work-talk1', talk_title: TITLE, recipient_name: 'Olive Owner',
    week_start: '2026-10-26', already_done: false, submitted_at: null, role: 'observer', group_label: null, roster: [] },
  greinerWithChoiceKey: { company: 'Greiner Brothers', talk_key: 'choice-hot-work-talk1', talk_title: TITLE, recipient_name: 'G Person',
    week_start: '2026-10-26', already_done: false, submitted_at: null, role: 'participant', group_label: null, roster: [] },
  choiceWithGreinerKey: { company: 'Choice', talk_key: 'hot-work-general-awareness', talk_title: TITLE, recipient_name: 'Sam Supervisor-A',
    week_start: '2026-10-26', already_done: false, submitted_at: null, role: 'leader', group_label: 'Choice crew (CREW)', roster: CREW },
  greinerLead: { company: 'Greiner Brothers', talk_key: 'hot-work-general-awareness', talk_title: TITLE, recipient_name: 'Foreman One (Test)',
    week_start: '2026-10-26', already_done: false, submitted_at: null, role: 'leader', group_label: 'Fictional Hospital (C900-2026)', roster: ['Crew Alpha (Test)', 'Crew Bravo (Test)'] },
  greinerPart: { company: 'Greiner Brothers', talk_key: 'hot-work-general-awareness', talk_title: TITLE, recipient_name: 'Recipient One (Test)',
    week_start: '2026-10-26', already_done: false, submitted_at: null, role: 'participant', group_label: null, roster: [] }
};
const tokenFor = (k) => (k + 'Token').padEnd(32, 'x');
const byToken = Object.fromEntries(Object.keys(LINKS).map((k) => [tokenFor(k), k]));
const calls = [];
const RPC = {
  cs_tbt_link_open: (b) => (byToken[b.p_token] ? [LINKS[byToken[b.p_token]]] : []),
  cs_tbt_link_progress: () => null,
  cs_tbt_link_submit: (b) => [{ submitted_at: '2026-10-26T12:30:00Z', active_ms: b.p_active_ms, attendees_stored: !!b.p_group }]
};
let checks = 0, failures = 0;
async function check(name, fn) {
  try { await fn(); checks++; console.log(`  ok  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${name}\n       ${String(e.message).split('\n')[0]}`); }
}
const offMachine = [];
const browser = await webkit.launch();
async function open(key, width = 390) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith(BASE)) return r.continue();
    const m = u.match(/\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (m && RPC[m[1]]) {
      const body = JSON.parse(r.request().postData() || '{}'); calls.push({ fn: m[1], key: byToken[body.p_token], body });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RPC[m[1]](body)) });
    }
    offMachine.push(u); return r.abort();
  });
  await page.goto(BASE + 'toolbox.html#' + tokenFor(key)); await page.waitForTimeout(700);
  return page;
}
const text = (p) => p.evaluate(() => document.body.innerText);

try {
  await check('library: the Choice entry is Tony\'s Choice file verbatim (sections = t1.json) and Greiner\'s entry is untouched', async () => {
    const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'talks/library.js'), 'utf8'), ctx);
    const L = ctx.window.TBT_LIBRARY;
    const c = L['Choice Toolbox Talk - Hot Work_Talk #1_General Awareness and Tips.docx'];
    const t1 = JSON.parse(fs.readFileSync('/Users/michaelcarey/choice-materials/2026-10-25-hot-work-talk1/t1.json', 'utf8'));
    assert.equal(c.sourceSha256, 'ee7f1b2d4e3eabf8ae0e409640422b162f244ad90c743b632e557c4bbc839e77');
    assert.equal(JSON.stringify(c.sections), JSON.stringify(t1.sections));
    assert.equal(c.pages.length, 4);
    assert.ok(/Greiner Brother/.test(JSON.stringify(c.sections)), 'F1 kept as supplied');
    const g = L['Hot Work - Talk 1 - General Awareness and Tips.docx'];
    assert.ok(g && g.pages[0].src === 'hot-work-talk1/page-01.jpg', 'Greiner entry present and unchanged');
  });

  const lead = await open('choiceLead');
  await check('Choice supervisor link: Choice name, the Choice talk, its own original pages', async () => {
    const t = await text(lead);
    assert.ok(/Choice/.test(t) && t.includes(TITLE), t.slice(0, 200));
    const ok = await lead.evaluate(() => { const i = document.querySelector('#tbtPageImg'); return i && i.complete && i.naturalWidth === 1320 && /talks\/choice-hot-work-talk1\/page-01\.png/.test(i.src); });
    assert.ok(ok, 'Choice page 1 image loads');
    assert.ok(!/PIN/.test(t));
  });
  await check('Choice supervisor: Guided Talk shows Choice\'s 9 sections', async () => {
    await lead.click('[data-tbt-format="guided"]');
    assert.match(await lead.textContent('#tbtSecCount'), /Section 1 of 9/);
  });
  await check('Choice supervisor: completion is "Supervisor-led group talk" with the crew tick list; one submit with attendees', async () => {
    for (let i = 0; i < 9; i++) {
      await lead.check('#tbtSecDone');
      if (i < 8) await lead.click('#tbtSecNext');
    }
    await lead.click('#tbtToComplete');
    const t = await text(lead);
    assert.ok(/Supervisor-led group talk/.test(t) && !/Foreman-led/.test(t), t.slice(0, 300));
    const rows = await lead.$$eval('[data-tbt-att]', (b) => b.map((x) => x.getAttribute('data-tbt-att')));
    assert.deepEqual(rows, CREW);
    await lead.click('#tbtAll'); await lead.check('#tbtPresented'); await lead.click('#tbtSubmitGroup'); await lead.waitForTimeout(400);
    const sub = calls.filter((c) => c.fn === 'cs_tbt_link_submit' && c.key === 'choiceLead');
    assert.equal(sub.length, 1);
    assert.deepEqual(sub[0].body.p_group.attendees, CREW);
    assert.equal(sub[0].body.p_group.presenter, 'Sam Supervisor-A');
    assert.match(await text(lead), /Toolbox Talk recorded/);
  });

  const own = await open('choiceOwner');
  await check('Tony\'s Choice link: his own copy, marked view only, with the original pages', async () => {
    const t = await text(own);
    assert.ok(/Choice/.test(t) && t.includes(TITLE) && /Your Copy \(View Only\)/.test(t), t.slice(0, 300));
    assert.ok(/View only: a supervisor records attendance for the crew/.test(t));
    const ok = await own.evaluate(() => { const i = document.querySelector('#tbtPageImg'); return i && i.complete && i.naturalWidth > 0; });
    assert.ok(ok);
  });
  await check('Tony\'s link: no completion button, no tick boxes, no submit anywhere (pages and Guided Talk)', async () => {
    for (let i = 0; i < 3; i++) await own.click('#tbtNext');
    assert.equal(await own.$('#tbtToComplete'), null);
    await own.click('[data-tbt-format="guided"]');
    assert.equal(await own.$('#tbtSecDone'), null);
    assert.equal(await own.$('#tbtSecProg'), null);
    for (let i = 0; i < 8; i++) await own.click('#tbtSecNext');
    assert.match(await own.textContent('#tbtSecCount'), /Section 9 of 9/);
    assert.equal(await own.$('#tbtToComplete'), null);
    assert.equal(await own.$('#tbtSubmit'), null);
    assert.equal(await own.$('#tbtSubmitGroup'), null);
    assert.ok(!/Record Completion|Submit/.test(await text(own)));
  });
  await check('Tony\'s link: reading time is reported, nothing is ever submitted', async () => {
    await own.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await own.waitForTimeout(300);
    assert.ok(calls.some((c) => c.fn === 'cs_tbt_link_progress' && c.key === 'choiceOwner'));
    assert.equal(calls.filter((c) => c.fn === 'cs_tbt_link_submit' && c.key === 'choiceOwner').length, 0);
  });

  for (const k of ['greinerWithChoiceKey', 'choiceWithGreinerKey']) {
    const p = await open(k);
    await check(`isolation: ${k === 'greinerWithChoiceKey' ? 'a Greiner link naming the Choice talk' : 'a Choice link naming the Greiner talk'} gets "not available"`, async () => {
      assert.match(await text(p), /This link is not available/);
      assert.equal(await p.$('#tbtPageImg'), null);
    });
    await p.close();
  }

  const gl = await open('greinerLead');
  await check('Greiner foreman link unchanged: Greiner\'s own Hot Work file and "Foreman-led group talk"', async () => {
    const ok = await gl.evaluate(() => { const i = document.querySelector('#tbtPageImg'); return i && /talks\/hot-work-talk1\/page-01\.jpg/.test(i.src); });
    assert.ok(ok);
    await gl.click('[data-tbt-format="doc"]');
    for (let i = 0; i < 3; i++) await gl.click('#tbtNext');
    await gl.click('#tbtToComplete');
    const t = await text(gl);
    assert.ok(/Foreman-led group talk/.test(t) && !/Supervisor-led/.test(t), t.slice(0, 300));
  });
  const gp = await open('greinerPart');
  await check('Greiner participant link unchanged: individual completion', async () => {
    for (let i = 0; i < 3; i++) await gp.click('#tbtNext');
    await gp.click('#tbtToComplete');
    assert.match(await text(gp), /Individual completion/);
    assert.ok(await gp.$('#tbtSubmit'));
  });
  await check('no page errors and nothing left the machine', async () => {
    for (const p of [lead, own, gl, gp]) assert.deepEqual(p.errors, []);
    assert.deepEqual(offMachine, []);
  });
} finally {
  await browser.close();
  server.close();
}
console.log(`Choice shared link: ${checks}/${checks + failures} checks passed`);
process.exitCode = failures ? 1 : 0;
