/* New Cold Weather source regression. Fictional intercepted RPCs only. Adapted existing delivery-page browser journey; no production writes or customer usage. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import { createRequire } from 'node:module';

const ROOT = path.resolve(new URL('../', import.meta.url).pathname);
const NAME = 'Toolbox Talk - Best Practice for Cold Weather Awareness.docx';
const KEY = 'cold-weather-awareness-nov9';
const TITLE = 'Best Practice for Cold Weather Awareness';
const SHA = 'c6e4f5d751c165ce5e58f9115f77ec1914f8795735f94e3cce78db3b5c0b2127';

let checks = 0, failures = 0;
async function check(name, fn) {
  try { await fn(); checks++; console.log(`  ok  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${name}\n       ${String(e.message).split('\n')[0]}`); }
}
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'talks/library.js'), 'utf8'), ctx);
const LIB = ctx.window.TBT_LIBRARY, E = LIB[NAME];
const html = fs.readFileSync(path.join(ROOT, 'toolbox.html'), 'utf8');

await check('new source entry: checksum, four page images, both company-specific aliases', () => {
 assert.ok(E); assert.equal(E.sourceSha256, SHA); assert.equal(E.title, TITLE); assert.equal(E.pages.length,4);
 for(const p of E.pages){assert.ok(fs.existsSync(path.join(ROOT,'talks',p.src)));assert.equal(p.w,1200);}
 assert.ok(html.includes("'cold-weather-awareness-nov9':"));assert.ok(html.includes("'choice-cold-weather-awareness-nov9':"));
 const choice=LIB['Choice Toolbox Talk - Best Practice for Cold Weather Awareness.docx'];
 assert.equal(JSON.stringify(choice.sections),JSON.stringify(E.sections));
 for(const page of choice.pages){assert.match('/talks/'+page.src,/^\/talks\/choice-[a-z0-9]+(?:-[a-z0-9]+)*\/page-[0-9]{2}\.(?:png|jpg|webp)$/);assert.ok(fs.existsSync(path.join(ROOT,'talks',page.src)));}
});
await check('all 92 source paragraphs retained exactly and in order, no rewritten safety content', () => {
 const original=JSON.parse(fs.readFileSync(path.join(ROOT,'tests/fixtures/cold-weather-nov9-source.json'),'utf8')).paragraphs;
 const actual=JSON.parse(JSON.stringify(E.sections.flatMap(s=>[s.h,...s.p])));
 assert.equal(original.length,92);assert.deepEqual(actual,original);
});
await check('every existing talk entry remains identical to the live-verified base',()=>{
 const expected=JSON.parse(fs.readFileSync(path.join(ROOT,'tests/fixtures/cold-weather-nov9-source.json'),'utf8')).previousEntryFingerprints;
 for(const [k,v] of Object.entries(expected))assert.equal(createHash('sha256').update(JSON.stringify(LIB[k])).digest('hex'),v);
 assert.equal(Object.keys(LIB).length,Object.keys(expected).length+2);
});

const req = createRequire(path.join(process.env.PLAYWRIGHT_NODE_MODULES || ROOT, 'noop.js'));
let webkit;
try { ({ webkit } = req('playwright-webkit')); } catch { console.log('Cold Weather browser checks skipped (set PLAYWRIGHT_NODE_MODULES).'); process.exit(failures ? 1 : 0); }
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((rq, rs) => {
  const p = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end(); }
  rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
const CREW = ['Crew Alpha (fictional)', 'Crew Bravo (fictional)', 'Crew Charlie (fictional)'];
const ROW = (o) => ({ company: 'Greiner Brothers', talk_key: KEY, talk_title: TITLE, week_start: '2026-11-09', already_done: false,
  submitted_at: null, group_label: null, roster: [], ...o });
const LINKS = { lead: ROW({ recipient_name: 'Foreman One (fictional)', role: 'leader', group_label: 'Fictional Job (T000-2026)', roster: CREW }),
  part: ROW({ recipient_name: 'Person One (fictional)', role: 'participant' }),
  choiceWithThisKey: ROW({ company: 'Choice', recipient_name: 'Choice Person (fictional)', role: 'leader', roster: CREW }), choiceAllowed: ROW({ company: 'Choice', talk_key: 'choice-cold-weather-awareness-nov9', recipient_name: 'Choice Foreman (fictional)', role: 'leader', roster: CREW }) };
const tokenFor = (k) => (k + 'Token').padEnd(34, 'x');
const byToken = Object.fromEntries(Object.keys(LINKS).map((k) => [tokenFor(k), k]));
const calls = [];
const RPC = { cs_tbt_link_open: (b) => (byToken[b.p_token] ? [LINKS[byToken[b.p_token]]] : []),
  cs_tbt_link_progress: () => null,
  cs_tbt_link_submit: (b) => { calls.push({ key: byToken[b.p_token], body: b }); return [{ submitted_at: '2026-11-02T12:30:00Z', active_ms: b.p_active_ms, attendees_stored: !!b.p_group }]; } };
const offMachine = [];
const browser = await webkit.launch();
async function open(key) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith(BASE)) return r.continue();
    const m = u.match(/\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (m && RPC[m[1]]) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RPC[m[1]](JSON.parse(r.request().postData() || '{}'))) });
    offMachine.push(u); return r.abort();
  });
  await page.goto(BASE + 'toolbox.html#' + tokenFor(key)); await page.waitForTimeout(800);
  return page;
}
const text = (p) => p.evaluate(() => document.body.innerText);
try {
  const lead = await open('lead');
  await check('foreman link: Greiner branding, the talk title, the original page 1 image loads (1200 px)', async () => {
    const t = await text(lead);
    assert.ok(/Greiner Brothers/.test(t) && t.includes(TITLE), t.slice(0, 200));
    assert.ok(await lead.evaluate(() => { const i = document.querySelector('#tbtPageImg'); return i && i.complete && i.naturalWidth === 1200 && /talks\/cold-weather-awareness-nov9\/page-01\.jpg/.test(i.src); }));
  });
  await check('foreman: all 4 original pages, then "Foreman-led group talk" with the crew list; one submission as doc with who attended', async () => {
    for (let i = 0; i < 3; i++) await lead.click('#tbtNext');
    assert.ok(await lead.evaluate(() => /page-04\.jpg/.test(document.querySelector('#tbtPageImg').src)));
    await lead.click('#tbtToComplete');
    const t = await text(lead);
    assert.ok(/Foreman-led group talk/.test(t), t.slice(0, 300));
    assert.deepEqual(await lead.$$eval('[data-tbt-att]', (b) => b.map((x) => x.getAttribute('data-tbt-att'))), CREW);
    await lead.click('#tbtAll'); await lead.check('#tbtPresented'); await lead.click('#tbtSubmitGroup'); await lead.waitForTimeout(500);
    const s = calls.filter((c) => c.key === 'lead');
    assert.equal(s.length, 1); assert.equal(s[0].body.p_format, 'doc'); assert.deepEqual(s[0].body.p_group.attendees, CREW);
    assert.match(await text(lead), /Toolbox Talk recorded/);
  });
  const part = await open('part');
  await check('one person: the Guided Talk shows the 10 source sections, first heading from the document; individual completion', async () => {
    await part.click('[data-tbt-format="guided"]');
    assert.match(await part.textContent('#tbtSecCount'), /Section 1 of 10/);
    assert.match(await text(part), /Best Practice for Cold Weather Awareness/);
    for (let i = 0; i < 10; i++) { await part.check('#tbtSecDone'); if (i < 9) await part.click('#tbtSecNext'); }
    await part.click('#tbtToComplete');
    assert.match(await text(part), /Individual completion/);
    await part.click('#tbtAck'); await part.click('#tbtSubmit'); await part.waitForTimeout(500);
    const s = calls.filter((c) => c.key === 'part'); assert.equal(s.length, 1); assert.equal(s[0].body.p_format, 'guided');
  });
  const ch = await open('choiceWithThisKey');
  await check('isolation: a Choice link naming this Greiner talk gets "not available"', async () => {
    assert.match(await text(ch), /This link is not available/);
  });
  const choiceGood = await open('choiceAllowed');
  await check('Choice-specific alias opens the approved common source, with Choice identity',async()=>{
   const t=await text(choiceGood);assert.ok(t.includes(TITLE));assert.match(t,/Choice/);assert.ok(!t.includes('This link is not available'));
   assert.ok(await choiceGood.evaluate(()=>{const i=document.querySelector('#tbtPageImg');return i&&i.complete&&i.naturalWidth===1200&&i.src.includes('/talks/choice-cold-weather-awareness-nov9/');}));
  });
  await check('no page errors; nothing left the machine', async () => {
    for (const p of [lead, part, ch, choiceGood]) assert.deepEqual(p.errors, []);
    assert.deepEqual(offMachine, []);
  });
} finally { await browser.close(); server.close(); }
console.log(`Cold Weather Awareness talk: ${checks}/${checks + failures} checks passed (nothing sent or recorded)`);
process.exitCode = failures ? 1 : 0;
