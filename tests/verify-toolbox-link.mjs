/* Greiner personal Toolbox Talk link (toolbox.html#token) in a real browser
 * (WebKit). The three link calls are answered inside this test; nothing leaves
 * the machine and nothing is recorded anywhere.
 * Needs playwright-webkit (PLAYWRIGHT_NODE_MODULES).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(new URL('../', import.meta.url).pathname);
const req = createRequire(path.join(process.env.PLAYWRIGHT_NODE_MODULES || ROOT, 'noop.js'));
let webkit;
try { ({ webkit } = req('playwright-webkit')); } catch { console.log('Toolbox link verification skipped (set PLAYWRIGHT_NODE_MODULES).'); process.exit(0); }

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((rq, rs) => {
  const p = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end(); }
  rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const GOOD = 'goodTokenAbcdefghijklmnopqrstuv12', DONE = 'doneTokenAbcdefghijklmnopqrstuv12';
const state = { submitted: null, progress: [], calls: [] };
const RPC = {
  cs_tbt_link_open: (b) => b.p_token === GOOD || b.p_token === DONE ? [{ company: 'Greiner Brothers', talk_key: 'fall-protection',
    talk_title: 'Fall Protection', recipient_name: 'Recipient One (Test)', week_start: '2026-10-05',
    already_done: b.p_token === DONE || !!state.submitted, submitted_at: b.p_token === DONE ? '2026-10-05T13:10:00Z' : state.submitted }] : [],
  cs_tbt_link_progress: (b) => { state.progress.push(b); return null; },
  cs_tbt_link_submit: (b) => { if (b.p_token !== GOOD) return []; state.submitted = state.submitted || '2026-10-05T13:20:00Z';
    return [{ submitted_at: state.submitted, active_ms: b.p_active_ms }]; }
};
let checks = 0, failures = 0;
async function check(name, fn) {
  try { await fn(); checks++; console.log(`  ok  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${name}\n       ${String(e.message).split('\n')[0]}`); }
}
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
      const body = JSON.parse(r.request().postData() || '{}'); state.calls.push(m[1]);
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RPC[m[1]](body)) });
    }
    offMachine.push(u); return r.abort();
  });
  await page.goto(BASE + 'toolbox.html' + hash); await page.waitForTimeout(700);
  return page;
}
const text = (p) => p.evaluate(() => document.body.innerText);

try {
  const p = await open('#' + GOOD);
  await check('a personal link opens the Fall Protection Toolbox Talk for that person', async () => {
    const t = await text(p);
    assert.ok(/Greiner Brothers/.test(t) && /Fall Protection/.test(t) && /Toolbox Talk/.test(t), t.slice(0, 200));
    assert.ok(await p.$('[data-tbt-format="doc"]') && await p.$('[data-tbt-format="guided"]'));
    assert.ok(!/Choose Method|PIN/.test(t), 'no workflow choice and no PIN');
  });
  await check('the original document shows the real pages', async () => {
    const ok = await p.evaluate(() => { const i = document.querySelector('#tbtPageImg'); return i && i.complete && i.naturalWidth > 0 && /talks\/fall-protection\/page-01\.jpg/.test(i.src); });
    assert.ok(ok);
  });
  await check('the guided talk has the eight verbatim sections, and completion waits for them', async () => {
    await p.click('[data-tbt-format="guided"]');
    assert.match(await text(p), /Section 1 of 8/);
    assert.equal(await p.$eval('#tbtToComplete', (b) => b.disabled), true);
    for (let i = 0; i < 8; i++) {
      if (!(await p.$eval('#tbtSecDone', (b) => b.checked))) await p.click('#tbtSecDone');
      const n = await p.$('#tbtSecNext:not([disabled])'); if (n) await n.click();
    }
    assert.equal(await p.$eval('#tbtToComplete', (b) => b.disabled), false);
  });
  await check('the acknowledgement records with no PIN and shows what was recorded', async () => {
    await p.click('#tbtToComplete');
    const t = await text(p);
    assert.match(t, /Recipient One \(Test\)/);
    assert.match(t, /I reviewed the complete Toolbox Talk and understand it\./);
    await p.click('#tbtAck'); await p.click('#tbtSubmit'); await p.waitForTimeout(500);
    const d = await text(p);
    assert.ok(/Toolbox Talk recorded/.test(d) && /Recorded at/.test(d) && /Guided Talk/.test(d), d.slice(0, 300));
    assert.equal(await p.$('.pin input'), null);
    assert.ok(state.calls.includes('cs_tbt_link_submit'));
  });
  await check('the token never appears in a request URL', async () => {
    assert.ok(!p.urls.some((u) => u.includes(GOOD)));
  });
  await check('an already-recorded link shows it is recorded', async () => {
    const d = await open('#' + DONE);
    assert.match(await text(d), /already recorded/);
    await d.close();
  });
  await check('unknown and missing links look identical and show no talk', async () => {
    const a = await open('#unknownTokenAbcdefghijklmnopqrstuv'), b = await open('');
    const ta = await text(a), tb = await text(b);
    assert.ok(/This link is not available/.test(ta) && ta === tb && !/Fall Protection/.test(ta));
    await a.close(); await b.close();
  });
  await check('no overflow at 390, 820 and 1440', async () => {
    for (const w of [390, 820, 1440]) {
      const q = await open('#' + DONE.replace('done', 'good').replace('DoneToken', 'goodToken'), w);
      const g = await open('#' + GOOD, w);
      for (const pg of [g]) {
        for (const f of ['doc', 'guided']) {
          if (await pg.$(`[data-tbt-format="${f}"]`)) await pg.click(`[data-tbt-format="${f}"]`);
          const o = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          assert.ok(o <= 1, `${w} ${f}: ${o}`);
        }
      }
      await q.close(); await g.close();
    }
  });
  await check('no page errors; nothing else left the machine', async () => {
    assert.deepEqual(p.errors, []);
    assert.deepEqual(offMachine, []);
  });
} finally { await browser.close(); server.close(); }
if (failures) { console.log(`Toolbox link verification FAILED (${failures} failing, ${checks} passing).`); process.exit(1); }
console.log(`Toolbox link verification passed (${checks} checks, nothing sent or recorded).`);
