/* Choice video Toolbox Talk for Mon Nov 2, 2026 on the shared phone page (toolbox.html#token), in a real browser
 * (WebKit) at phone width. LOCAL ONLY, FICTIONAL: the talk is the "Choice Toolbox Talk Video - Walking-Working
 * Surfaces - Slopes, Ramps, and Dockboards" entry (Tony's YouTube video 4WM6HSX2rJA, 120 s).
 *   - a Choice supervisor link: the video, "Supervisor-led group talk", the crew tick list, one submission as video;
 *   - Tony's Choice link (role observer): his own view-only copy of the video, no completion step, never a submit;
 *   - company isolation: a Greiner link naming this Choice talk, or a Choice link naming a Greiner talk, is refused;
 *   - the existing Choice and Greiner entries are untouched.
 * The link calls are answered inside this test, the YouTube iframe API is a local stand-in, the embed frame is a
 * local grey page, and every other non-local request is aborted and reported. Nothing leaves the machine.
 * Needs playwright-webkit (PLAYWRIGHT_NODE_MODULES).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const ROOT = path.resolve(new URL('../', import.meta.url).pathname);
const KEY = 'choice-walking-working-surfaces-video';
const ENTRY = 'Choice Toolbox Talk Video - Walking-Working Surfaces - Slopes, Ramps, and Dockboards';
const TITLE = 'Walking-Working Surfaces - Slopes, Ramps, and Dockboards';
const VID = '4WM6HSX2rJA';

let checks = 0, failures = 0;
async function check(name, fn) {
  try { await fn(); checks++; console.log(`  ok  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${name}\n       ${String(e.message).split('\n')[0]}`); }
}

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'talks/library.js'), 'utf8'), ctx);
const LIB = ctx.window.TBT_LIBRARY;
const html = fs.readFileSync(path.join(ROOT, 'toolbox.html'), 'utf8');
await check('library: the Choice video entry is Tony\'s video (id, 120 s), has no pages or sections, and is mapped to its key', () => {
  const e = LIB[ENTRY];
  assert.ok(e && !e.placeholder);
  assert.deepEqual(JSON.parse(JSON.stringify(e.video)), { provider: 'youtube', id: VID, seconds: 120 });
  assert.equal(e.title, TITLE);
  assert.equal(e.pages.length, 0); assert.equal(e.sections.length, 0);
  assert.ok(html.includes(`'${KEY}': '${ENTRY}'`), 'toolbox.html maps the Choice video key');
  assert.ok(/^choice-/.test(KEY), 'a Choice key, so only Choice links open it');
});
await check('library: every earlier entry is unchanged (same keys, same videos and page counts)', () => {
  const keys = Object.keys(LIB).filter((k) => k !== ENTRY);
  assert.deepEqual(keys, ['Fall Protection.pdf', 'OSHA Ladder Safety Requirements 2026.docx', 'Falls from Ladder.docx',
    'Cold Stress - Talk 3 - Slips on Ice.docx', 'Hot Work - Talk 1 - General Awareness and Tips.docx',
    'Driver Safety: Proper Positioning', 'Choice Toolbox Talk - Hot Work_Talk #1_General Awareness and Tips.docx']);
  assert.equal(LIB['Driver Safety: Proper Positioning'].video.id, '94wWLo0IEjw');
  assert.equal(LIB['Choice Toolbox Talk - Hot Work_Talk #1_General Awareness and Tips.docx'].pages.length, 4);
});

const req = createRequire(path.join(process.env.PLAYWRIGHT_NODE_MODULES || ROOT, 'noop.js'));
let webkit;
try { ({ webkit } = req('playwright-webkit')); } catch { console.log('Choice video browser checks skipped (set PLAYWRIGHT_NODE_MODULES).'); process.exit(failures ? 1 : 0); }

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((rq, rs) => {
  const p = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end(); }
  rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

/* The same local stand-in for https://www.youtube.com/iframe_api that tests/verify-toolbox-video.mjs uses. */
const FAKE_YT = `(function () {
  var S = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
  function Player(id, opts) {
    var el = document.getElementById(id), self = this, base = 0, since = null, RATE = 2;
    var box = document.createElement('div'); box.id = 'fakeYtBox';
    box.style.cssText = 'position:absolute;inset:0;background:#8a8a8a;color:#fff;display:flex;align-items:center;justify-content:center';
    box.textContent = 'TEST STUB PLAYER'; el.parentNode.appendChild(box);
    function now() { return since === null ? base : base + (Date.now() - since) / 1000 * RATE; }
    function fire(d) { opts.events.onStateChange({ data: d, target: self }); }
    self.getCurrentTime = function () { return now(); };
    window.__fakeYT = { play: function () { if (since === null) { since = Date.now(); fire(S.PLAYING); } },
      pause: function () { base = now(); since = null; fire(S.PAUSED); } };
  }
  window.YT = { Player: Player, PlayerState: S };
  if (typeof window.onYouTubeIframeAPIReady === 'function') window.onYouTubeIframeAPIReady();
})();`;
const FAKE_EMBED = '<!doctype html><html><body style="margin:0;background:#8a8a8a"></body></html>';

const CREW = ['Sam Supervisor-A (fictional)', 'Sue Supervisor-B (fictional)', 'Tom Tech-1 (fictional)', 'Ted "T" Tech-3 (fictional)'];
const ROW = (o) => ({ company: 'Choice', talk_key: KEY, talk_title: TITLE, week_start: '2026-11-02', already_done: false,
  submitted_at: null, group_label: null, roster: [], ...o });
const LINKS = {
  lead: ROW({ recipient_name: 'Sam Supervisor-A (fictional)', role: 'leader', group_label: 'Choice crew (CREW)', roster: CREW }),
  owner: ROW({ recipient_name: 'Olive Owner (fictional)', role: 'observer' }),
  greinerWithChoiceVideo: ROW({ company: 'Greiner Brothers', recipient_name: 'G Person (fictional)', role: 'participant' }),
  choiceWithGreinerVideo: ROW({ talk_key: 'driver-safety-proper-positioning', talk_title: 'Driver Safety: Proper Positioning',
    recipient_name: 'Sam Supervisor-A (fictional)', role: 'leader', group_label: 'Choice crew (CREW)', roster: CREW })
};
const tokenFor = (k) => (k + 'Token').padEnd(34, 'x');
const byToken = Object.fromEntries(Object.keys(LINKS).map((k) => [tokenFor(k), k]));
const calls = [];
const RPC = {
  cs_tbt_link_open: (b) => (byToken[b.p_token] ? [LINKS[byToken[b.p_token]]] : []),
  cs_tbt_link_progress: (b) => { calls.push({ fn: 'progress', key: byToken[b.p_token], body: b }); return null; },
  cs_tbt_link_submit: (b) => { calls.push({ fn: 'submit', key: byToken[b.p_token], body: b });
    return [{ submitted_at: '2026-11-02T13:30:00Z', active_ms: b.p_active_ms, attendees_stored: !!b.p_group }]; }
};
const offMachine = [], stubbed = [];
const browser = await webkit.launch();
async function open(key) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith(BASE)) return r.continue();
    const m = u.match(/\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (m && RPC[m[1]]) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RPC[m[1]](JSON.parse(r.request().postData() || '{}'))) });
    if (u === 'https://www.youtube.com/iframe_api') { stubbed.push(u); return r.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_YT }); }
    if (u.startsWith(`https://www.youtube-nocookie.com/embed/${VID}?`) || u.startsWith('https://www.youtube-nocookie.com/embed/94wWLo0IEjw?')) {
      stubbed.push(u); return r.fulfill({ status: 200, contentType: 'text/html', body: FAKE_EMBED });
    }
    offMachine.push(u); return r.abort();
  });
  await page.goto(BASE + 'toolbox.html#' + tokenFor(key)); await page.waitForTimeout(800);
  return page;
}
const text = (p) => p.evaluate(() => document.body.innerText);

try {
  const lead = await open('lead');
  await check('Choice supervisor link: Choice name, the video talk (2:00), Tony\'s video in the privacy-enhanced player, no document', async () => {
    const t = await text(lead);
    assert.ok(/Choice/.test(t) && t.includes(TITLE), t.slice(0, 200));
    assert.match(t, /Video · 2:00 · Choice/);
    const src = await lead.$eval('#tbtVideo', (f) => f.getAttribute('src'));
    assert.match(src, new RegExp(`^https://www\\.youtube-nocookie\\.com/embed/${VID}\\?enablejsapi=1&playsinline=1`));
    assert.equal(await lead.$('#tbtPageImg'), null); assert.equal(await lead.$('[data-tbt-format]'), null);
    assert.ok(!/PIN|Greiner/.test(t));
  });
  await check('Choice supervisor: "Supervisor-led group talk", the crew tick list, one submission as video with who attended', async () => {
    await lead.evaluate(() => window.__fakeYT.play()); await lead.waitForTimeout(1200); await lead.evaluate(() => window.__fakeYT.pause());
    await lead.click('#tbtToComplete');
    const t = await text(lead);
    assert.ok(/Supervisor-led group talk/.test(t) && !/Foreman-led/.test(t), t.slice(0, 300));
    assert.deepEqual(await lead.$$eval('[data-tbt-att]', (b) => b.map((x) => x.getAttribute('data-tbt-att'))), CREW);
    await lead.click('#tbtAll'); await lead.check('#tbtPresented'); await lead.click('#tbtSubmitGroup'); await lead.waitForTimeout(500);
    const sub = calls.filter((c) => c.fn === 'submit' && c.key === 'lead');
    assert.equal(sub.length, 1);
    assert.equal(sub[0].body.p_format, 'video');
    assert.deepEqual(sub[0].body.p_group.attendees, CREW);
    assert.equal(sub[0].body.p_group.presenter, 'Sam Supervisor-A (fictional)');
    assert.match(await text(lead), /Toolbox Talk recorded/);
  });

  const own = await open('owner');
  await check('Tony\'s Choice link: his own view-only copy of the video; no completion button and no submit, ever', async () => {
    const t = await text(own);
    assert.ok(t.includes(TITLE) && /Your Copy \(View Only\)/.test(t), t.slice(0, 300));
    assert.ok(await own.$('#tbtVideo'), 'the video is there');
    assert.equal(await own.$('#tbtToComplete'), null);
    assert.equal(await own.$('#tbtSubmit'), null); assert.equal(await own.$('#tbtSubmitGroup'), null);
    assert.ok(!/Record Completion|Submit/.test(t));
    await own.evaluate(() => window.__fakeYT.play()); await own.waitForTimeout(800); await own.evaluate(() => window.__fakeYT.pause());
    await own.evaluate(() => window.dispatchEvent(new Event('pagehide'))); await own.waitForTimeout(300);
    assert.equal(calls.filter((c) => c.fn === 'submit' && c.key === 'owner').length, 0);
  });

  for (const k of ['greinerWithChoiceVideo', 'choiceWithGreinerVideo']) {
    const p = await open(k);
    await check(`isolation: ${k === 'greinerWithChoiceVideo' ? 'a Greiner link naming the Choice video' : 'a Choice link naming the Greiner video'} gets "not available"`, async () => {
      assert.match(await text(p), /This link is not available/);
      assert.equal(await p.$('#tbtVideo'), null);
    });
    await p.close();
  }
  await check('no page errors; the YouTube API and frame were answered locally; nothing else left the machine', async () => {
    for (const p of [lead, own]) assert.deepEqual(p.errors, []);
    assert.ok(stubbed.some((u) => u === 'https://www.youtube.com/iframe_api'));
    assert.deepEqual(offMachine, []);
  });
} finally { await browser.close(); server.close(); }
console.log(`Choice video talk: ${checks}/${checks + failures} checks passed (nothing sent or recorded)`);
process.exitCode = failures ? 1 : 0;
