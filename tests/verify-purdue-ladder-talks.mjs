/* Purdue ladder talks (October 12 and 13): the two Guided Talk only entries in
 * talks/library.js, opened through a foreman's personal link (toolbox.html#token)
 * in a real browser. The link calls are answered inside this test; nothing
 * leaves the machine and nothing is recorded anywhere.
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
const TALKS = [
  { key: 'osha-ladder-safety-2026', file: 'OSHA Ladder Safety Requirements 2026.docx', title: 'OSHA Ladder Safety Requirements 2026',
    week: '2026-10-12', sections: 6, first: 'OSHA Ladder Safety Requirements: The Rules Crews Actually Break' },
  { key: 'falls-from-ladder', file: 'Falls from Ladder.docx', title: 'Falls from Ladder',
    week: '2026-10-12', sections: 7, first: 'Fatal Ladders Falls' }
];

let checks = 0, failures = 0;
async function check(name, fn) {
  try { await fn(); checks++; console.log(`  ok  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${name}\n       ${String(e.message).split('\n')[0]}`); }
}

await check('both talks are in the library as Guided Talk only, with no pages and no other company', () => {
  const html = fs.readFileSync(path.join(ROOT, 'toolbox.html'), 'utf8');
  for (const t of TALKS) {
    const e = LIB[t.file];
    assert.ok(e, t.file);
    assert.equal(e.guidedOnly, true);
    assert.equal(e.pages.length, 0);
    assert.equal(e.sections.length, t.sections);
    assert.equal(e.sections[0].h, t.first);
    assert.match(e.sourceSha256, /^[0-9a-f]{64}$/);
    assert.ok(html.includes(`'${t.key}': '${t.file}'`), `toolbox.html maps ${t.key}`);
    const all = JSON.stringify(e);
    assert.ok(!/Peine|Tony|Sweet/.test(all), `${t.file} names another company or a person`);
  }
  assert.equal(LIB['Fall Protection.pdf'].guidedOnly, undefined, 'Fall Protection is unchanged');
});

const req = createRequire(path.join(process.env.PLAYWRIGHT_NODE_MODULES || ROOT, 'noop.js'));
let webkit;
try { ({ webkit } = req('playwright-webkit')); } catch { console.log('Purdue ladder talk browser checks skipped (set PLAYWRIGHT_NODE_MODULES).'); process.exit(failures ? 1 : 0); }

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((rq, rs) => {
  const p = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end(); }
  rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const CREW = ['Crew Alpha (Test)', 'Crew Bravo (Test)', 'Crew Charlie (Test)'];
const tokenFor = (t) => (t.key.replace(/[^a-z]/g, '') + 'Token0123456789abcdefghij').slice(0, 33);
const state = { submits: {}, progress: [] };
const RPC = {
  cs_tbt_link_open: (b) => {
    const t = TALKS.find((x) => tokenFor(x) === b.p_token);
    return t ? [{ company: 'Greiner Brothers', talk_key: t.key, talk_title: t.title, recipient_name: 'Foreman One (Test)',
      week_start: t.week, already_done: !!state.submits[t.key], submitted_at: null, role: 'leader',
      group_label: 'Purdue Academic Bldg. (C800-2025)', roster: CREW }] : [];
  },
  cs_tbt_link_progress: (b) => { state.progress.push(b); return null; },
  cs_tbt_link_submit: (b) => {
    const t = TALKS.find((x) => tokenFor(x) === b.p_token);
    if (!t || !b.p_group || !b.p_group.presenter) return [];
    state.submits[t.key] = b;
    return [{ submitted_at: '2026-10-12T12:30:00Z', active_ms: b.p_active_ms, attendees_stored: true }];
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

try {
  for (const t of TALKS) {
    for (const width of [390, 1440]) {
      const label = `${t.title} at ${width === 390 ? 'phone' : 'desktop'} width`;
      delete state.submits[t.key];
      const p = await open('#' + tokenFor(t), width);
      await check(`${label}: opens straight into the Guided Talk, no original and no choice`, async () => {
        const s = await text(p);
        assert.ok(s.includes(t.title) && /Greiner Brothers/.test(s), s.slice(0, 200));
        assert.equal(await p.$('[data-tbt-format]'), null, 'no format buttons');
        assert.equal(await p.$('#tbtPageImg'), null, 'no original pages');
        assert.ok(!s.includes(t.file) && !/View Original Document|Choose Method|PIN|Peine/.test(s), s.slice(0, 300));
        assert.match(s, new RegExp(`Section 1 of ${t.sections}`));
        assert.ok(s.includes(t.first));
      });
      await check(`${label}: every section is shown word for word and completion waits for all of them`, async () => {
        assert.equal(await p.$eval('#tbtToComplete', (b) => b.disabled), true);
        for (let i = 0; i < t.sections; i++) {
          const s = await text(p);
          for (const para of LIB[t.file].sections[i].p) assert.ok(s.includes(para.replace(/^\*\s*/, '')), para.slice(0, 60));
          if (!(await p.$eval('#tbtSecDone', (b) => b.checked))) await p.click('#tbtSecDone');
          const n = await p.$('#tbtSecNext:not([disabled])'); if (n) await n.click();
        }
        assert.equal(await p.$eval('#tbtToComplete', (b) => b.disabled), false);
        assert.ok(await overflow(p) <= 1);
      });
      await check(`${label}: the foreman marks who attended and submits once, recorded as a Guided Talk`, async () => {
        await p.click('#tbtToComplete');
        const s = await text(p);
        assert.ok(/Foreman-led group talk/.test(s) && /Purdue Academic Bldg\. \(C800-2025\)/.test(s), s.slice(0, 300));
        assert.equal((await p.$$('[data-tbt-att]')).length, 3);
        await p.click('[data-tbt-att="Crew Alpha (Test)"]');
        await p.fill('#tbtManual', 'Walk In (Test)'); await p.click('#tbtManualAdd');
        await p.click('#tbtPresented'); await p.click('#tbtSubmitGroup'); await p.waitForTimeout(500);
        const d = await text(p);
        assert.ok(/Toolbox Talk recorded/.test(d) && /Guided Talk/.test(d) && /Walk In \(Test\)/.test(d), d.slice(0, 400));
        const sub = state.submits[t.key];
        assert.equal(sub.p_format, 'guided');
        assert.deepEqual(sub.p_group, { presenter: 'Foreman One (Test)', attendees: ['Crew Alpha (Test)'], manual: ['Walk In (Test)'] });
        assert.ok(await overflow(p) <= 1);
        assert.ok(!p.urls.some((u) => u.includes(tokenFor(t))), 'the token never appears in a request URL');
        assert.deepEqual(p.errors, []);
      });
      await p.close();
    }
  }
  await check('the Fall Protection link still offers the original document', async () => {
    const saved = RPC.cs_tbt_link_open;
    RPC.cs_tbt_link_open = () => [{ company: 'Greiner Brothers', talk_key: 'fall-protection', talk_title: 'Fall Protection',
      recipient_name: 'Recipient One (Test)', week_start: '2026-10-05', already_done: false, submitted_at: null }];
    const p = await open('#fallTokenAbcdefghijklmnopqrstuv1234');
    RPC.cs_tbt_link_open = saved;
    assert.ok(await p.$('[data-tbt-format="doc"]') && await p.$('[data-tbt-format="guided"]'));
    await p.close();
  });
  await check('nothing else left the machine', async () => { assert.deepEqual(offMachine, []); });
} finally { await browser.close(); server.close(); }
if (failures) { console.log(`Purdue ladder talk verification FAILED (${failures} failing, ${checks} passing).`); process.exit(1); }
console.log(`Purdue ladder talk verification passed (${checks} checks, nothing sent or recorded).`);
