/* Greiner video Toolbox Talk on the personal link (toolbox.html#token) in a real
 * browser (WebKit) at phone width. LOCAL ONLY, FICTIONAL: the talk is the
 * "Driver Safety: Proper Positioning" entry in talks/library.js (Tony's public
 * YouTube video 94wWLo0IEjw, 112 s). The YouTube player is stubbed in this test.
 *
 * Nothing leaves the machine. The link calls are answered inside this test, the
 * YouTube iframe API is replaced by a local fake YT.Player (a grey box labelled
 * TEST STUB PLAYER whose state changes the test drives), the embed frame is
 * answered with a local grey page, and every other non-local request is aborted
 * and reported. Set VIDEO_SHOT_DIR to also save phone-width screenshots.
 * Needs playwright-webkit (PLAYWRIGHT_NODE_MODULES).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const ROOT = path.resolve(new URL('../', import.meta.url).pathname);
const SHOTS = process.env.VIDEO_SHOT_DIR || '';
const W = 390, H = 844;

let checks = 0, failures = 0;
async function check(name, fn) {
  try { await fn(); checks++; console.log(`  ok  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${name}\n       ${String(e.message).split('\n')[0]}`); }
}

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'talks/library.js'), 'utf8'), sandbox);
const LIB = sandbox.window.TBT_LIBRARY;
const VKEY = 'Driver Safety: Proper Positioning';
await check('the video entry is the supplied Driver Safety video, labelled, and has no pages or sections', () => {
  const e = LIB[VKEY];
  assert.ok(e && !e.placeholder);
  assert.deepEqual(JSON.parse(JSON.stringify(e.video)), { provider: 'youtube', id: '94wWLo0IEjw', seconds: 112 }); // library comes from a vm sandbox (other realm)
  assert.equal(e.video.id.length, 11);
  assert.equal(e.pages.length, 0); assert.equal(e.sections.length, 0);
  assert.ok(!/Peine/i.test(JSON.stringify(e)));
  const html = fs.readFileSync(path.join(ROOT, 'toolbox.html'), 'utf8');
  assert.ok(html.includes(`'driver-safety-proper-positioning': '${VKEY}'`), 'toolbox.html maps the video talk');
  assert.equal(LIB['Fall Protection.pdf'].video, undefined, 'Fall Protection is unchanged');
});

const req = createRequire(path.join(process.env.PLAYWRIGHT_NODE_MODULES || ROOT, 'noop.js'));
let webkit;
try { ({ webkit } = req('playwright-webkit')); } catch { console.log('Video talk browser checks skipped (set PLAYWRIGHT_NODE_MODULES).'); process.exit(failures ? 1 : 0); }

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const server = http.createServer((rq, rs) => {
  const p = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end(); }
  rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

/* A stand-in for https://www.youtube.com/iframe_api. Its clock runs at 2x real
   time while "playing", so the page's 500 ms sampler sees steady forward play. */
const FAKE_YT = `(function () {
  var S = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
  function Player(id, opts) {
    var el = document.getElementById(id), self = this, base = 0, since = null, RATE = 2;
    var box = document.createElement('div');
    box.id = 'fakeYtBox';
    box.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'background:#8a8a8a;color:#fff;font:700 18px/1.3 system-ui,sans-serif;text-align:center;letter-spacing:.04em';
    box.innerHTML = '<div>TEST STUB PLAYER</div><div style="font-weight:500;font-size:12px;margin-top:6px">stands in for YouTube in this test</div>';
    el.parentNode.appendChild(box);
    function now() { return since === null ? base : base + (Date.now() - since) / 1000 * RATE; }
    function fire(d) { opts.events.onStateChange({ data: d, target: self }); }
    self.getCurrentTime = function () { return now(); };
    window.__fakeYT = {
      play: function () { if (since === null) { since = Date.now(); fire(S.PLAYING); } },
      pause: function () { base = now(); since = null; fire(S.PAUSED); },
      seek: function (t) { var p = since !== null; base = t; if (p) since = Date.now(); },
      end: function (sec) { base = sec; since = null; fire(S.ENDED); },
      error: function () { opts.events.onError({ data: 150 }); },
      time: function () { return now(); }
    };
  }
  window.YT = { Player: Player, PlayerState: S };
  if (typeof window.onYouTubeIframeAPIReady === 'function') window.onYouTubeIframeAPIReady();
})();`;
const FAKE_EMBED = '<!doctype html><html><body style="margin:0;background:#8a8a8a"></body></html>';

const T = { VIDEO: 'videoTokenAbcdefghijklmnopqrstuv12', VLEAD: 'vleadTokenAbcdefghijklmnopqrstuv12',
  VFAIL: 'vfailTokenAbcdefghijklmnopqrstuv12', DOC: 'docTokenAbcdefghijklmnopqrstuvw12' };
const CREW = ['Crew Member A (fictional)', 'Crew Member B (fictional)'];
const state = { submits: [], progress: [], calls: [] };
const VIDEO_ROW = (name, extra = {}) => ({ company: 'Greiner Brothers', talk_key: 'driver-safety-proper-positioning',
  talk_title: VKEY, recipient_name: name, week_start: '2026-10-26',
  already_done: false, submitted_at: null, role: 'participant', group_label: null, roster: [], ...extra });
const RPC = {
  cs_tbt_link_open: (b) => b.p_token === T.VIDEO || b.p_token === T.VFAIL ? [VIDEO_ROW('Tester J (fictional)')]
    : b.p_token === T.VLEAD ? [VIDEO_ROW('Foreman F (fictional)', { role: 'leader', group_label: 'Fictional Test Job (T000-2026)', roster: CREW })]
    : b.p_token === T.DOC ? [{ company: 'Greiner Brothers', talk_key: 'fall-protection', talk_title: 'Fall Protection',
        recipient_name: 'Tester D (fictional)', week_start: '2026-10-26', already_done: false, submitted_at: null }] : [],
  cs_tbt_link_progress: (b) => { state.progress.push(b); return null; },
  cs_tbt_link_submit: (b) => { state.submits.push(b);
    if (!Object.values(T).includes(b.p_token)) return [];
    if (b.p_token === T.VLEAD && !(b.p_group && b.p_group.presenter)) return [];
    return [{ submitted_at: '2026-10-26T13:20:00Z', active_ms: b.p_active_ms, attendees_stored: b.p_token === T.VLEAD }]; }
};

const offMachine = [], stubbed = [], blockedOnPurpose = [];
const browser = await webkit.launch();
async function open(token, { failPlayer = false } = {}) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
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
    if (u === 'https://www.youtube.com/iframe_api') {
      if (failPlayer) { blockedOnPurpose.push(u); return r.abort(); }
      stubbed.push(u); return r.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_YT });
    }
    if (u.startsWith('https://www.youtube-nocookie.com/embed/94wWLo0IEjw?')) {
      stubbed.push(u); return r.fulfill({ status: 200, contentType: 'text/html', body: FAKE_EMBED });
    }
    offMachine.push(u); return r.abort();
  });
  await page.goto(BASE + 'toolbox.html#' + token); await page.waitForTimeout(800);
  return page;
}
const text = (p) => p.evaluate(() => document.body.innerText);
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name), fullPage: true }); };
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

let v;
try {
  v = await open(T.VIDEO);
  await check('a video link opens the video talk: stubbed player, no document, no sections, no format choice', async () => {
    const t = await text(v);
    assert.ok(/Greiner Brothers/.test(t) && /Driver Safety: Proper Positioning/.test(t), t.slice(0, 200));
    assert.match(t, /Video · 1:52 · Greiner Brothers/);
    assert.match(t, /Played 0:00 of 1:52 on this page/);
    assert.equal(await v.$('[data-tbt-format]'), null, 'no doc/guided choice');
    assert.equal(await v.$('#tbtPageImg'), null); assert.equal(await v.$('#tbtSecDone'), null);
    const src = await v.$eval('#tbtVideo', (f) => f.getAttribute('src'));
    assert.match(src, /^https:\/\/www\.youtube-nocookie\.com\/embed\/94wWLo0IEjw\?enablejsapi=1&playsinline=1/);
    assert.equal(await v.$eval('#tbtVideo', (f) => f.getAttribute('referrerpolicy')), 'strict-origin-when-cross-origin');
    assert.match(await v.$eval('#fakeYtBox', (b) => b.innerText), /TEST STUB PLAYER/);
    assert.ok(!/Choose Method|PIN/.test(t));
  });
  await check('no minimum playback: Continue is available before anything plays', async () => {
    assert.equal(await v.$eval('#tbtToComplete', (b) => b.disabled), false);
    assert.equal(await v.$('#tbtHint'), null);
  });
  await shot(v, '01-video-talk-open.png');

  await check('playing counts each second once; a seek ahead does not count; pause reports progress as video', async () => {
    await v.evaluate(() => window.__fakeYT.play());
    await v.waitForTimeout(4200);                       // ~8 s of video at 2x
    await v.evaluate(() => window.__fakeYT.pause());
    await v.waitForTimeout(150);
    const a = await v.evaluate(() => document.getElementById('tbtVideoProg').textContent);
    const n1 = Number(a.match(/Played 0:(\d\d)/)[1]);
    assert.ok(n1 >= 6 && n1 <= 9, a);
    const last = state.progress[state.progress.length - 1];
    assert.equal(last.p_format, 'video'); assert.equal(last.p_sections_viewed, n1); assert.equal(last.p_token, T.VIDEO);
    // Jump to 1:00 and play a little: only the seconds actually played after the jump count.
    await v.evaluate(() => { window.__fakeYT.seek(60); window.__fakeYT.play(); });
    await v.waitForTimeout(2200);
    await v.evaluate(() => window.__fakeYT.pause());
    await v.waitForTimeout(150);
    const b = await v.evaluate(() => document.getElementById('tbtVideoProg').textContent);
    const n2 = Number(b.match(/Played 0:(\d\d)/)[1]);
    assert.ok(n2 > n1 && n2 - n1 <= 5, `${a} -> ${b}`);
  });
  await shot(v, '02-video-talk-progress-shown.png');

  await check('submit: one last progress as video, then the submission as video; the confirmation shows who and when only', async () => {
    const played = await v.evaluate(() => Number(document.getElementById('tbtVideoProg').textContent.match(/Played 0:(\d\d)/)[1]));
    await v.click('#tbtToComplete');
    const t = await text(v);
    assert.match(t, /Tester J \(fictional\)/); assert.match(t, /I reviewed the complete Toolbox Talk and understand it\./);
    const before = state.progress.length;
    await v.click('#tbtAck'); await v.click('#tbtSubmit'); await v.waitForTimeout(600);
    const sub = state.submits[state.submits.length - 1];
    assert.equal(sub.p_token, T.VIDEO); assert.equal(sub.p_format, 'video'); assert.equal(sub.p_group, undefined);
    const fin = state.progress.slice(before).pop();
    assert.ok(fin && fin.p_format === 'video' && fin.p_sections_viewed === played, JSON.stringify(fin));
    const d = await text(v);
    assert.ok(/Toolbox Talk recorded/.test(d) && /Completed by\s*Tester J \(fictional\)/.test(d) && /Recorded at/.test(d), d.slice(0, 400));
    assert.ok(!/Format|Video played|Active time|Statement|Sections reviewed/.test(d), 'office details stay off the crew confirmation');
    assert.match(d, /You\u2019re all set\. You can close this page\./);
    assert.ok(await overflow(v) <= 1);
  });
  await shot(v, '03-video-talk-submitted-confirmation.png');

  await check('if the player cannot load: a clear message, a link out, and completion still works', async () => {
    const f = await open(T.VFAIL, { failPlayer: true });
    await f.waitForTimeout(300);
    const t = await text(f);
    assert.match(t, /could not load/); assert.match(t, /You can still continue and record your completion\./);
    assert.equal(await f.$eval('#tbtVideoErr a', (a) => a.getAttribute('href')), 'https://www.youtube.com/watch?v=94wWLo0IEjw');
    assert.equal(await f.$eval('#tbtToComplete', (b) => b.disabled), false);
    await shot(f, '05-video-player-failed-still-completes.png');
    await f.click('#tbtToComplete'); await f.click('#tbtAck'); await f.click('#tbtSubmit'); await f.waitForTimeout(500);
    assert.match(await text(f), /Toolbox Talk recorded/);
    assert.equal(state.submits[state.submits.length - 1].p_format, 'video');
    assert.deepEqual(f.errors, []);
    await f.close();
  });

  await check('a foreman video link: crew list, typed-in name, one submission as video with who was there', async () => {
    const f = await open(T.VLEAD);
    await f.click('#tbtToComplete');
    const t = await text(f);
    assert.ok(/Foreman-led group talk/.test(t) && /Fictional Test Job \(T000-2026\)/.test(t), t.slice(0, 300));
    await f.click(`[data-tbt-att="${CREW[0]}"]`);
    await f.fill('#tbtManual', 'Walk In (fictional)'); await f.click('#tbtManualAdd');
    await f.click('#tbtPresented'); await f.click('#tbtSubmitGroup'); await f.waitForTimeout(500);
    const sub = state.submits[state.submits.length - 1];
    assert.equal(sub.p_format, 'video');
    assert.deepEqual(sub.p_group, { presenter: 'Foreman F (fictional)', attendees: [CREW[0]], manual: ['Walk In (fictional)'] });
    assert.match(await text(f), /Toolbox Talk recorded/);
    await f.close();
  });

  await check('a document talk is unchanged: both formats, the real pages, and doc / guided recorded as before', async () => {
    const p = await open(T.DOC);
    const t = await text(p);
    assert.ok(/Fall Protection/.test(t) && await p.$('[data-tbt-format="doc"]') && await p.$('[data-tbt-format="guided"]'));
    assert.equal(await p.$('#tbtVideo'), null);
    assert.ok(await p.evaluate(() => { const i = document.querySelector('#tbtPageImg'); return i && i.complete && i.naturalWidth > 0; }));
    await shot(p, '04-doc-talk-unchanged.png');
    for (let i = 0; i < 12; i++) { const n = await p.$('#tbtNext:not([disabled])'); if (!n) break; await n.click(); }
    await p.click('#tbtToComplete'); await p.click('#tbtAck'); await p.click('#tbtSubmit'); await p.waitForTimeout(500);
    assert.equal(state.submits[state.submits.length - 1].p_format, 'doc');
    const d = await text(p);
    assert.ok(/Toolbox Talk recorded/.test(d) && /Recorded at/.test(d) && !/Format|Video played|Active time/.test(d), d.slice(0, 300));
    await p.close();
  });

  await check('no overflow at 390 for the video talk; the token never appears in a request URL', async () => {
    const q = await open(T.VIDEO);
    assert.ok(await overflow(q) <= 1);
    await q.close();
    assert.ok(!v.urls.some((u) => u.includes(T.VIDEO)));
  });
  await check('no page errors; the YouTube API and frame were answered locally; nothing else left the machine', async () => {
    assert.deepEqual(v.errors, []);
    assert.ok(stubbed.some((u) => u === 'https://www.youtube.com/iframe_api'));
    assert.deepEqual(offMachine, []);
    assert.ok(blockedOnPurpose.length >= 1);
  });
} finally { await browser.close(); server.close(); }
if (failures) { console.log(`Video talk verification FAILED (${failures} failing, ${checks} passing).`); process.exit(1); }
console.log(`Video talk verification passed (${checks} checks, nothing sent or recorded).`);
