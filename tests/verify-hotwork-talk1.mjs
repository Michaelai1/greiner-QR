/* Hot Work Talk 1: General Awareness and Tips (Greiner Brothers document from Tony Sweet's Oct 24 email): an entry in
 * talks/library.js with the original document (4 page images) and a Guided Talk (8 sections under the document's own
 * headings, words verbatim), opened through a recipient's personal link (toolbox.html#token) in a real browser as one
 * person (role participant) and as a foreman (role leader). The link calls are answered inside this test; nothing
 * leaves the machine and nothing is recorded anywhere.
 * Needs playwright-webkit (PLAYWRIGHT_NODE_MODULES). SHOTS=<folder> saves phone screenshots for review.
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
const T = { key: 'hot-work-general-awareness', file: 'Hot Work - Talk 1 - General Awareness and Tips.docx',
  title: 'Hot Work Talk 1: General Awareness and Tips', week: '2026-10-26', sections: 8,
  sha: 'c31a24ec02d8c3781fa1b3ad2f68949222e69ca92a88158eafd8b01091c32df6',
  heads: ['Brazing & Hot Work: Awareness and Tips', 'Before work starts', 'Common failure points', 'Safe work sequence / controls',
    'Stop and reassess the plan if...', 'Questions worth asking yourself or the crew', 'Related authoritative reference',
    'Personal Safety Responsibility'],
  counts: [2, 5, 3, 5, 3, 6, 1, 2] };
const shot = async (p, name) => { if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, name), fullPage: true }); };

let checks = 0, failures = 0;
async function check(name, fn) {
  try { await fn(); checks++; console.log(`  ok  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${name}\n       ${String(e.message).split('\n')[0]}`); }
}

await check('the talk is in the library with the 4-page original and eight Guided sections under the document\'s own headings', () => {
  const html = fs.readFileSync(path.join(ROOT, 'toolbox.html'), 'utf8');
  const e = LIB[T.file];
  assert.ok(e, T.file);
  assert.equal(e.title, T.title);
  assert.equal(e.filename, T.file);
  assert.equal(e.guidedOnly, undefined);
  assert.equal(e.video, undefined);
  assert.equal(e.sourceSha256, T.sha, 'the Word file Tony sent on Oct 24 (Greiner version)');
  assert.equal(e.pages.length, 4);
  e.pages.forEach((pg, i) => {
    assert.equal(pg.src, `hot-work-talk1/page-0${i + 1}.jpg`);
    const f = path.join(ROOT, 'talks', pg.src);
    assert.ok(fs.existsSync(f) && fs.statSync(f).size > 50000 && pg.w === 1200 && pg.h === 927, pg.src);
    const b = fs.readFileSync(f); assert.ok(b[0] === 0xff && b[1] === 0xd8, `${pg.src} is a JPEG`);
  });
  assert.deepEqual(JSON.parse(JSON.stringify(e.sections.map((s) => s.h))), T.heads);
  assert.deepEqual(JSON.parse(JSON.stringify(e.sections.map((s) => s.p.length))), T.counts);
  assert.ok(html.includes(`'${T.key}': '${T.file}'`), `toolbox.html maps ${T.key}`);
  assert.ok(!/Peine|Choice|HVAC/.test(JSON.stringify(e)), 'names another company');
});

await check('the Guided words are the document\'s: 519 words, bullets where the document has bullets, the questions numbered 1-5', () => {
  const S = LIB[T.file].sections;
  const words = S.reduce((n, s) => n + s.h.split(/\s+/).length +
    s.p.reduce((m, t) => m + t.replace(/^(\* |\d+\. )/, '').split(/\s+/).length, 0), 0);
  assert.equal(words, 519, 'same word count as the document body (title, headings, paragraphs, table)');
  assert.ok(S[1].p.every((t) => t.startsWith('* ')) && S[2].p.every((t) => t.startsWith('* ')) &&
    S[3].p.every((t) => t.startsWith('* ')) && S[4].p.every((t) => t.startsWith('* ')), 'bulleted lists stay bullets');
  assert.deepEqual(JSON.parse(JSON.stringify(S[5].p.slice(0, 5).map((t) => t.slice(0, 3)))), ['1. ', '2. ', '3. ', '4. ', '5. ']);
  assert.equal(S[5].p[5], 'Before doing any Hot Work always try to trace where sparks/heat can travel and physically inspect the fire-watch area and extinguisher location.');
  assert.deepEqual(JSON.parse(JSON.stringify(S[6].p)), ['29 CFR 1926.350 - Gas Welding and Cutting']);
  assert.match(S[7].p[1], /contact Safety Program Director Tony Sweet\.$/);
  assert.ok(S.every((s) => s.p.every((t) => t === t.trim() && !/\s{2}/.test(t))), 'no stray spaces');
});

await check('the other talks in the library are unchanged in shape', () => {
  assert.equal(LIB['Cold Stress - Talk 3 - Slips on Ice.docx'].sections.length, 6);
  assert.equal(LIB['Cold Stress - Talk 3 - Slips on Ice.docx'].pages.length, 4);
  assert.equal(LIB['Falls from Ladder.docx'].sections.length, 7);
  assert.equal(LIB['OSHA Ladder Safety Requirements 2026.docx'].sections.length, 6);
  assert.equal(LIB['Driver Safety: Proper Positioning'].video.id, '94wWLo0IEjw');
  assert.equal(LIB['Fall Protection.pdf'].guidedOnly, undefined);
  // 6 Greiner talks + Choice's own entry (shared phone app, Oct 25 Choice plan)
  assert.equal(Object.keys(LIB).length, 7);
  assert.ok(LIB['Choice Toolbox Talk - Hot Work_Talk #1_General Awareness and Tips.docx']);
});

const req = createRequire(path.join(process.env.PLAYWRIGHT_NODE_MODULES || ROOT, 'noop.js'));
let webkit;
try { ({ webkit } = req('playwright-webkit')); } catch { console.log('Hot Work Talk 1 browser checks skipped (set PLAYWRIGHT_NODE_MODULES).'); process.exit(failures ? 1 : 0); }

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((rq, rs) => {
  const p = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end(); }
  rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const TOKENS = { participant: 'hotworkParticipantToken0123456789', leader: 'hotworkLeaderToken0123456789abcde' };
const state = { submits: {} };
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
    return [{ submitted_at: '2026-10-26T10:05:00Z', active_ms: b.p_active_ms, attendees_stored: role === 'leader' }];
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
async function walk(p, shots) {
  for (let i = 0; i < T.sections; i++) {
    const s = await text(p);
    assert.match(s, new RegExp(`Section ${i + 1} of ${T.sections}`));
    assert.ok(s.includes(T.heads[i]), T.heads[i]);
    const shown = await p.$$eval('.tbt-sec-b', (els) => els.map((e) => ({ t: e.textContent, b: e.classList.contains('tbt-sec-bullet') })));
    const want = JSON.parse(JSON.stringify(LIB[T.file].sections[i].p.map((t) => ({ t: t.replace(/^\*\s*/, ''), b: /^\*/.test(t) }))));
    assert.deepEqual(shown, want, `section ${i + 1} shows exactly the library words, bullets as bullets`);
    if (shots) await shot(p, `hotwork-guided-${String(i + 1).padStart(2, '0')}.png`);
    if (!(await p.$eval('#tbtSecDone', (b) => b.checked))) await p.click('#tbtSecDone');
    const n = await p.$('#tbtSecNext:not([disabled])'); if (n) await n.click();
  }
}

try {
  for (const width of [390, 1440]) {
    const label = `one person at ${width === 390 ? 'phone' : 'desktop'} width`;
    const phone = width === 390;
    delete state.submits.participant;
    const p = await open('#' + TOKENS.participant, width);
    await check(`${label}: opens on the original document with a tab for each view, Greiner branding, no other company`, async () => {
      const s = await text(p);
      assert.ok(s.includes(T.title) && /Greiner Brothers/.test(s), s.slice(0, 200));
      assert.ok(await p.$('[data-tbt-format="doc"]') && await p.$('[data-tbt-format="guided"]'), 'both tabs');
      assert.ok(/View Original Document/.test(s) && /Guided Talk/.test(s));
      assert.ok(!/Choose Method|PIN|Peine|Choice/.test(s), s.slice(0, 300));
      assert.match(await p.$eval('#tbtPageImg', (i) => i.getAttribute('src')), /hot-work-talk1\/page-01\.jpg$/);
      assert.match(s, /Page 1 of 4/);
      assert.ok(await p.$eval('#tbtPageImg', (i) => i.complete && i.naturalWidth === 1200 && i.naturalHeight === 927), 'page image loads');
      if (phone) await shot(p, 'hotwork-original-01.png');
    });
    await check(`${label}: Next pages through all 4 original pages, and the Guided Talk tab switches views`, async () => {
      for (let i = 2; i <= 4; i++) {
        await p.click('#tbtNext'); await p.waitForTimeout(150);
        assert.match(await text(p), new RegExp(`Page ${i} of 4`));
        assert.match(await p.$eval('#tbtPageImg', (im) => im.getAttribute('src')), new RegExp(`hot-work-talk1/page-0${i}\\.jpg$`));
        assert.ok(await p.$eval('#tbtPageImg', (im) => im.complete && im.naturalWidth === 1200), `page ${i} loads`);
        if (phone) await shot(p, `hotwork-original-0${i}.png`);
      }
      await p.click('[data-tbt-format="guided"]');
      assert.match(await text(p), /Section 1 of 8/);
      await p.click('[data-tbt-format="doc"]');
      assert.match(await text(p), /Page \d of 4/);
      await p.click('[data-tbt-format="guided"]');
    });
    await check(`${label}: all eight sections show word for word with Next, and completion waits for all of them`, async () => {
      assert.equal(await p.$eval('#tbtToComplete', (b) => b.disabled), true);
      await walk(p, phone);
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
      if (phone) await shot(p, 'hotwork-recorded.png');
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
  await check('opening the link again after submitting shows it is already recorded', async () => {
    const p = await open('#' + TOKENS.participant);
    const s = await text(p);
    assert.ok(/Toolbox Talk recorded/.test(s) && /already recorded/.test(s) && s.includes(T.title), s.slice(0, 300));
    assert.deepEqual(p.errors, []);
    await p.close();
  });
  await check('a foreman link still runs the group talk on the same content', async () => {
    const p = await open('#' + TOKENS.leader);
    await p.click('[data-tbt-format="guided"]');
    await walk(p, false);
    await p.click('#tbtToComplete');
    await p.click('[data-tbt-att="Crew Alpha (Test)"]'); await p.click('#tbtPresented'); await p.click('#tbtSubmitGroup');
    await p.waitForTimeout(500);
    assert.ok(/Toolbox Talk recorded/.test(await text(p)));
    assert.deepEqual(state.submits.leader.p_group, { presenter: 'Foreman One (Test)', attendees: ['Crew Alpha (Test)'], manual: [] });
    assert.equal(state.submits.leader.p_format, 'guided');
    assert.deepEqual(p.errors, []);
    await p.close();
  });
  await check('an unknown link gets the "not available" page', async () => {
    const p = await open('#notARealToken0123456789abcdefghij');
    assert.match(await text(p), /This link is not available/);
    await p.close();
  });
  await check('nothing else left the machine', async () => { assert.deepEqual(offMachine, []); });
} finally { await browser.close(); server.close(); }
if (failures) { console.log(`Hot Work Talk 1 verification FAILED (${failures} failing, ${checks} passing).`); process.exit(1); }
console.log(`Hot Work Talk 1 verification passed (${checks} checks, nothing sent or recorded).`);
