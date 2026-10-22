/* Cold Stress Talk 3: Slips on Ice (Greiner Brothers document, October 22): an entry in talks/library.js with the
 * original document (4 page images) and a Guided Talk (6 sections), opened through a recipient's personal link (toolbox.html#token) in a real browser as
 * one person (role participant) and as a foreman (role leader). The link calls are answered inside this
 * test; nothing leaves the machine and nothing is recorded anywhere.
 * Needs playwright-webkit (PLAYWRIGHT_NODE_MODULES).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const ROOT = path.resolve(new URL('../', import.meta.url).pathname);
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'talks/library.js'), 'utf8'), sandbox);
const LIB = sandbox.window.TBT_LIBRARY;
const T = { key: 'cold-stress-slips-on-ice', file: 'Cold Stress - Talk 3 - Slips on Ice.docx', title: 'Cold Stress Talk 3: Slips on Ice',
  week: '2026-10-19', sections: 6, first: 'Winter Slips on Ice: Awareness and Prevention',
  heads: ['Winter Slips on Ice: Awareness and Prevention', 'Key points', "Do / Don't on Ice", 'Quick site check',
    'What to think about while on the job', 'Personal Safety Responsibility'] };

let checks = 0, failures = 0;
async function check(name, fn) {
  try { await fn(); checks++; console.log(`  ok  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${name}\n       ${String(e.message).split('\n')[0]}`); }
}

await check('the talk is in the library with the 4-page original and six Guided sections under the document\'s own headings', () => {
  const html = fs.readFileSync(path.join(ROOT, 'toolbox.html'), 'utf8');
  const e = LIB[T.file];
  assert.ok(e, T.file);
  assert.equal(e.title, T.title);
  assert.equal(e.guidedOnly, undefined);
  assert.equal(e.pages.length, 4);
  for (const pg of e.pages) assert.ok(fs.existsSync(path.join(ROOT, 'talks', pg.src)) && pg.w === 1200 && pg.h === 927, pg.src);
  assert.deepEqual(JSON.parse(JSON.stringify(e.sections.map((s) => s.h))), T.heads);
  assert.deepEqual(JSON.parse(JSON.stringify(e.sections.map((s) => s.p.length))), [2, 6, 10, 5, 5, 2]);
  assert.match(e.sourceSha256, /^[0-9a-f]{64}$/);
  assert.ok(html.includes(`'${T.key}': '${T.file}'`), `toolbox.html maps ${T.key}`);
  assert.ok(!/Peine|Choice/.test(JSON.stringify(e)), 'names another company');
});

await check('the other talks in the library are unchanged in shape', () => {
  assert.equal(LIB['Falls from Ladder.docx'].sections.length, 7);
  assert.equal(LIB['OSHA Ladder Safety Requirements 2026.docx'].sections.length, 6);
  assert.equal(LIB['Driver Safety: Proper Positioning'].video.id, '94wWLo0IEjw');
  assert.equal(LIB['Fall Protection.pdf'].guidedOnly, undefined);
});

const req = createRequire(path.join(process.env.PLAYWRIGHT_NODE_MODULES || ROOT, 'noop.js'));
let webkit;
try { ({ webkit } = req('playwright-webkit')); } catch { console.log('Slips on Ice browser checks skipped (set PLAYWRIGHT_NODE_MODULES).'); process.exit(failures ? 1 : 0); }

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((rq, rs) => {
  const p = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end(); }
  rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const TOKENS = { participant: 'slipsParticipantToken0123456789ab', leader: 'slipsLeaderToken0123456789abcdefg' };
const state = { submits: {}, role: 'participant' };
const RPC = {
  cs_tbt_link_open: (b) => {
    const role = Object.keys(TOKENS).find((k) => TOKENS[k] === b.p_token);
    return role ? [{ company: 'Greiner Brothers', talk_key: T.key, talk_title: T.title,
      recipient_name: role === 'leader' ? 'Foreman One (Test)' : 'Worker One (Test)', week_start: T.week,
      already_done: !!state.submits[role], submitted_at: null, role,
      group_label: role === 'leader' ? 'Test Job (C000-2026)' : null, roster: role === 'leader' ? ['Crew Alpha (Test)'] : [] }] : [];
  },
  cs_tbt_link_progress: () => null,
  cs_tbt_link_submit: (b) => {
    const role = Object.keys(TOKENS).find((k) => TOKENS[k] === b.p_token);
    if (!role) return [];
    if (role === 'leader' && (!b.p_group || !b.p_group.presenter)) return [];
    state.submits[role] = b;
    return [{ submitted_at: '2026-10-22T16:05:00Z', active_ms: b.p_active_ms, attendees_stored: role === 'leader' }];
  }
};
const offMachine = [];
const browser = await webkit.launch();
async function open(hash, width = 390) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
  page.urls = []; page.on('request', (r) => page.urls.push(r.url()));
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith(BASE)) return r.continue();
    const m = u.match(/\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (m && RPC[m[1]]) {
      const body = JSON.parse(r.request().postData() || '{}');
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RPC[m[1]](body)) });
    }
    offMachine.push(u); return r.abort();
  });
  await page.goto(BASE + 'toolbox.html' + hash); await page.waitForTimeout(700);
  return page;
}
const text = (p) => p.evaluate(() => document.body.innerText);
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
async function walk(p) {
  for (let i = 0; i < T.sections; i++) {
    const s = await text(p);
    assert.match(s, new RegExp(`Section ${i + 1} of ${T.sections}`));
    assert.ok(s.includes(T.heads[i]), T.heads[i]);
    for (const para of LIB[T.file].sections[i].p) assert.ok(s.includes(para.replace(/^\*\s*/, '')), para.slice(0, 60));
    if (!(await p.$eval('#tbtSecDone', (b) => b.checked))) await p.click('#tbtSecDone');
    const n = await p.$('#tbtSecNext:not([disabled])'); if (n) await n.click();
  }
}

try {
  for (const width of [390, 1440]) {
    const label = `one person at ${width === 390 ? 'phone' : 'desktop'} width`;
    delete state.submits.participant;
    const p = await open('#' + TOKENS.participant, width);
    if (width === 390 && process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'slips-00-original-page-1.png') });
    await check(`${label}: opens on the original document with a tab for each view, Greiner branding, no other company`, async () => {
      const s = await text(p);
      assert.ok(s.includes(T.title) && /Greiner Brothers/.test(s), s.slice(0, 200));
      assert.ok(await p.$('[data-tbt-format="doc"]') && await p.$('[data-tbt-format="guided"]'), 'both tabs');
      assert.ok(/View Original Document/.test(s) && /Guided Talk/.test(s));
      assert.ok(!/Choose Method|PIN|Peine|Choice/.test(s), s.slice(0, 300));
      assert.match(await p.$eval('#tbtPageImg', (i) => i.getAttribute('src')), /slips-on-ice\/page-01\.jpg$/);
      assert.match(s, /Page 1 of 4/);
      assert.ok(await p.$eval('#tbtPageImg', (i) => i.complete && i.naturalWidth === 1200), 'page image loads');
    });
    await check(`${label}: Next pages through all 4 original pages, and the Guided Talk tab switches views`, async () => {
      for (let i = 2; i <= 4; i++) { await p.click('#tbtNext'); assert.match(await text(p), new RegExp(`Page ${i} of 4`)); }
      if (width === 390 && process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'slips-00-original-page-4.png') });
      await p.click('[data-tbt-format="guided"]');
      assert.match(await text(p), /Section 1 of 6/);
      if (width === 390 && process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'slips-01-section-1.png') });
      await p.click('[data-tbt-format="doc"]');
      assert.match(await text(p), /Page \d of 4/);
      await p.click('[data-tbt-format="guided"]');
    });
    await check(`${label}: all six sections show word for word with Next, and completion waits for all of them`, async () => {
      assert.equal(await p.$eval('#tbtToComplete', (b) => b.disabled), true);
      await walk(p);
      if (width === 390 && process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'slips-02-section-6.png') });
      assert.equal(await p.$eval('#tbtToComplete', (b) => b.disabled), false);
      assert.ok(await overflow(p) <= 1);
    });
    await check(`${label}: submits alone, with no one else to add, recorded as a Guided Talk`, async () => {
      await p.click('#tbtToComplete');
      const s = await text(p);
      assert.ok(/Individual completion/.test(s) && /Submit My Completion/.test(s), s.slice(0, 300));
      assert.ok(!/Select who attended|Submit Group Toolbox Talk/.test(s));
      await p.click('#tbtAck'); await p.click('#tbtSubmit'); await p.waitForTimeout(500);
      const d = await text(p);
      if (width === 390 && process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'slips-03-recorded.png') });
      assert.ok(/Toolbox Talk recorded/.test(d) && /Completed by\s*Worker One \(Test\)/.test(d) && /Recorded at/.test(d), d.slice(0, 400));
      assert.ok(!/Format|Active time|Statement|Sections reviewed|Week of/.test(d), 'office details stay off the crew confirmation');
      const sub = state.submits.participant;
      assert.equal(sub.p_format, 'guided');
      assert.equal(sub.p_group, undefined);
      assert.ok(!p.urls.some((u) => u.includes(TOKENS.participant)), 'the token never appears in a request URL');
      assert.deepEqual(p.errors, []);
    });
    await p.close();
  }
  await check('one person can also read the original document to the last page and submit, recorded as the original', async () => {
    delete state.submits.participant;
    const p = await open('#' + TOKENS.participant);
    assert.equal(await p.$eval('#tbtToComplete', (b) => b.disabled), true, 'completion waits for the last page');
    for (let i = 2; i <= 4; i++) await p.click('#tbtNext');
    assert.equal(await p.$eval('#tbtToComplete', (b) => b.disabled), false);
    await p.click('#tbtToComplete'); await p.click('#tbtAck'); await p.click('#tbtSubmit'); await p.waitForTimeout(500);
    assert.ok(/Toolbox Talk recorded/.test(await text(p)));
    assert.equal(state.submits.participant.p_format, 'doc');
    assert.equal(state.submits.participant.p_group, undefined);
    assert.ok(await overflow(p) <= 1);
    assert.deepEqual(p.errors, []);
    await p.close();
  });
  await check('a foreman link still runs the group talk on the same content', async () => {
    const p = await open('#' + TOKENS.leader);
    await p.click('[data-tbt-format="guided"]');
    await walk(p);
    await p.click('#tbtToComplete');
    await p.click('[data-tbt-att="Crew Alpha (Test)"]'); await p.click('#tbtPresented'); await p.click('#tbtSubmitGroup');
    await p.waitForTimeout(500);
    assert.ok(/Toolbox Talk recorded/.test(await text(p)));
    assert.deepEqual(state.submits.leader.p_group, { presenter: 'Foreman One (Test)', attendees: ['Crew Alpha (Test)'], manual: [] });
    assert.deepEqual(p.errors, []);
    await p.close();
  });
  await check('nothing else left the machine', async () => { assert.deepEqual(offMachine, []); });
} finally { await browser.close(); server.close(); }
if (failures) { console.log(`Slips on Ice talk verification FAILED (${failures} failing, ${checks} passing).`); process.exit(1); }
console.log(`Slips on Ice talk verification passed (${checks} checks, nothing sent or recorded).`);
