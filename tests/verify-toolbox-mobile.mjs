/* Toolbox Talks — mobile demo verification.
 *
 * Loads the phone module's logic out of index.html and exercises the two
 * completion paths directly. Nothing here reaches Supabase, n8n, Twilio,
 * Resend or the network; no texts or reminders are sent.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const includes = (text, message) => assert.ok(html.includes(text), message);
const excludes = (text, message) => assert.ok(!html.includes(text), message);

/* ------------------------------------------------------------------ *
 * 0. Load the module's logic into a sandbox
 * ------------------------------------------------------------------ */
const START = '/* ================= TOOLBOX TALKS — mobile demo';
const start = html.indexOf(START);
assert.ok(start > -1, 'the mobile Toolbox Talk module is missing');
const endLogic = html.indexOf('/* ---------------- the toolbox view');
assert.ok(endLogic > start, 'could not find the end of the toolbox logic block');

const makeModule = (search) => {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const factory = new Function('params', 'localStorage', `
    ${html.slice(start, endLogic)}
    return { TBT_KEY: TBT_KEY, TBT_TALKS: TBT_TALKS, TBT_CO: TBT_CO,
             TBT_COMPANY: TBT_COMPANY, TBT_MODE: TBT_MODE, TBT_SEL: TBT_SEL,
             tbtMondayISO: tbtMondayISO, tbtDueLabel: tbtDueLabel,
             tbtCurrentTalk: tbtCurrentTalk, tbtState: tbtState, tbtPush: tbtPush,
             tbtMyRecord: tbtMyRecord, tbtGroupRecord: tbtGroupRecord,
             tbtStatusText: tbtStatusText };
  `);
  const m = factory(new URLSearchParams(search), localStorage);
  m.store = store;
  m.localStorage = localStorage;
  return m;
};

/* ------------------------------------------------------------------ *
 * 1. Company routing and mode defaults
 * ------------------------------------------------------------------ */
assert.equal(makeModule('?demo=1').TBT_COMPANY, 'greiner', 'no ?company defaults to Greiner');
assert.equal(makeModule('?demo=1&company=choice').TBT_COMPANY, 'choice', '?company=choice must select Choice');
assert.equal(makeModule('?demo=1&company=peine').TBT_COMPANY, 'peine', '?company=peine must select Peine');
assert.equal(makeModule('?demo=1&company=CHOICE').TBT_COMPANY, 'choice', 'company must be case-insensitive');
assert.equal(makeModule('?demo=1&company=nosuchco').TBT_COMPANY, 'greiner',
  'an unknown company must fall back to Greiner, never crash');

// Each company's confirmed default completion method.
assert.equal(makeModule('?demo=1&company=choice').TBT_MODE, 'group',
  'Choice runs one foreman-led group talk');
assert.equal(makeModule('?demo=1&company=peine').TBT_MODE, 'individual',
  'Peine completes individually');
assert.equal(makeModule('?demo=1&company=greiner').TBT_MODE, 'group',
  'Greiner defaults to group and stays configurable');

// ?tbtmode= exists so both completion options can be demonstrated on one build.
assert.equal(makeModule('?demo=1&company=peine&tbtmode=group').TBT_MODE, 'group',
  '?tbtmode must be able to show the group flow for the demo');
assert.equal(makeModule('?demo=1&company=choice&tbtmode=individual').TBT_MODE, 'individual',
  '?tbtmode must be able to show the individual flow for the demo');
assert.equal(makeModule('?demo=1&company=peine&tbtmode=garbage').TBT_MODE, 'individual',
  'an invalid tbtmode must fall back to the company default');

/* ------------------------------------------------------------------ *
 * 2. Rosters
 * ------------------------------------------------------------------ */
const choice = makeModule('?demo=1&company=choice');
assert.equal(choice.TBT_CO.choice.groups.length, 1, 'Choice has a single Monday morning meeting');
assert.equal(choice.TBT_CO.choice.people.length, 12, "Choice's roster is 12 people");
for (const n of ['Alex Fyffe', 'Angel Garcia', 'Zach France']) {
  assert.ok(choice.TBT_CO.choice.people.some((p) => p.n === n),
    `${n} must be on Choice's roster`);
}
assert.equal(choice.TBT_CO.choice.me, 'Alex Fyffe',
  'the demo signs in as a confirmed Choice submitter');
assert.ok(choice.TBT_CO.choice.people.every((p) => p.g === 'Monday Group Meeting'),
  'every Choice employee belongs to the Monday meeting');

// Peine's roster is demo data only: Tony has not sent the real employee list.
const peine = makeModule('?demo=1&company=peine');
assert.ok(peine.TBT_CO.peine.people.every((p) => /\(Demo\)/.test(p.n)),
  "Peine's roster must be obviously fake until Tony sends the real employee list");
const greiner = makeModule('?demo=1&company=greiner');
assert.ok(greiner.TBT_CO.greiner.people.every((p) => /Demo|Foreman/.test(p.n)),
  "Greiner's phone roster must be obviously fake demo data");

/* ------------------------------------------------------------------ *
 * 3. The week is always a Monday
 * ------------------------------------------------------------------ */
const wk = choice.tbtMondayISO();
assert.match(wk, /^\d{4}-\d{2}-\d{2}$/, 'the week key must be an ISO date');
const parts = wk.split('-').map(Number);
assert.equal(new Date(parts[0], parts[1] - 1, parts[2]).getDay(), 1,
  'the due date must be a Monday');
assert.equal(wk, greiner.tbtMondayISO(), 'every company shares the same week key');
assert.match(choice.tbtDueLabel(), /^Monday, /, 'the due label must read as a Monday');

/* ------------------------------------------------------------------ *
 * 4. Group completion
 * ------------------------------------------------------------------ */
const g = makeModule('?demo=1&company=choice');
const gname = g.TBT_CO.choice.groups[0];
const talk = g.tbtCurrentTalk();
assert.ok(talk && talk.i && talk.t && talk.f, 'there must be a current talk with a filename');

assert.equal(g.tbtGroupRecord(gname), null, 'nothing is submitted yet');
assert.equal(g.tbtStatusText(), '0 of 1 group submitted', 'status must start at zero');

g.tbtPush({
  week: g.tbtMondayISO(), talkId: talk.i, kind: 'group', company: 'choice',
  group: gname, presenter: 'Alex Fyffe',
  roster: g.TBT_CO.choice.people.map((p) => p.n), manual: ['Temp Helper'],
  at: new Date().toISOString(),
});

const rec = g.tbtGroupRecord(gname);
assert.ok(rec, 'the group submission must be found after it is recorded');
assert.equal(rec.roster.length + rec.manual.length, 13,
  'attendance must count the roster plus manual entries');
assert.equal(g.tbtStatusText(), '1 of 1 group submitted', 'status must reflect the submission');

// The record persists in localStorage, so a reopened phone sees it.
const saved = JSON.parse(g.store.get(g.TBT_KEY));
assert.equal(saved.records.length, 1, 'the submission must persist');
assert.equal(saved.records[0].presenter, 'Alex Fyffe', 'the presenter must be recorded');

// A submission for a different group does not credit this one.
assert.equal(g.tbtGroupRecord('Some Other Crew'), null,
  'one group submitting must not credit another group');

/* ------------------------------------------------------------------ *
 * 5. Individual completion
 * ------------------------------------------------------------------ */
const ind = makeModule('?demo=1&company=peine');
const me = ind.TBT_CO.peine.me;
assert.equal(ind.tbtMyRecord(), null, 'nothing completed yet');
assert.equal(ind.tbtStatusText(), 'Not completed', 'individual status starts as not completed');

ind.tbtPush({
  week: ind.tbtMondayISO(), talkId: ind.tbtCurrentTalk().i, kind: 'individual',
  company: 'peine', employee: me, at: new Date().toISOString(),
});
assert.ok(ind.tbtMyRecord(), 'my completion must be found');
assert.equal(ind.tbtStatusText(), 'Completed', 'individual status must flip to completed');

// Somebody else completing does not complete it for me.
const other = makeModule('?demo=1&company=peine');
other.tbtPush({
  week: other.tbtMondayISO(), talkId: other.tbtCurrentTalk().i, kind: 'individual',
  company: 'peine', employee: 'Finley Ward (Demo)', at: new Date().toISOString(),
});
assert.equal(other.tbtMyRecord(), null,
  "another employee's completion must not complete mine");

/* ------------------------------------------------------------------ *
 * 6. Mode isolation — a group record is not individual credit, and vice versa
 * ------------------------------------------------------------------ */
const x = makeModule('?demo=1&company=peine');
x.tbtPush({
  week: x.tbtMondayISO(), talkId: x.tbtCurrentTalk().i, kind: 'group',
  company: 'peine', group: x.TBT_CO.peine.groups[0],
  roster: x.TBT_CO.peine.people.map((p) => p.n), manual: [], at: new Date().toISOString(),
});
assert.equal(x.tbtMyRecord(), null,
  'a group submission must not satisfy an individual-mode requirement');

const y = makeModule('?demo=1&company=choice');
y.tbtPush({
  week: y.tbtMondayISO(), talkId: y.tbtCurrentTalk().i, kind: 'individual',
  company: 'choice', employee: 'Alex Fyffe', at: new Date().toISOString(),
});
assert.equal(y.tbtGroupRecord(y.TBT_CO.choice.groups[0]), null,
  'an individual acknowledgement must not satisfy a group talk');

/* ------------------------------------------------------------------ *
 * 7. Company isolation is explicit, not accidental
 * ------------------------------------------------------------------ */
const shared = makeModule('?demo=1&company=choice');
// Forge a record with Choice's exact group name but another company's tag.
shared.tbtPush({
  week: shared.tbtMondayISO(), talkId: shared.tbtCurrentTalk().i, kind: 'group',
  company: 'greiner', group: shared.TBT_CO.choice.groups[0],
  roster: ['Somebody'], manual: [], at: new Date().toISOString(),
});
assert.equal(shared.tbtGroupRecord(shared.TBT_CO.choice.groups[0]), null,
  "another company's record must not credit Choice even with the same group name");

const sharedInd = makeModule('?demo=1&company=peine');
sharedInd.tbtPush({
  week: sharedInd.tbtMondayISO(), talkId: sharedInd.tbtCurrentTalk().i,
  kind: 'individual', company: 'choice', employee: sharedInd.TBT_CO.peine.me,
  at: new Date().toISOString(),
});
assert.equal(sharedInd.tbtMyRecord(), null,
  "another company's record must not credit Peine even with the same employee name");
includes('r.company === TBT_COMPANY', 'company must be matched explicitly on record lookups');

/* ------------------------------------------------------------------ *
 * 8. A completion belongs to one week and one talk
 * ------------------------------------------------------------------ */
const wkTest = makeModule('?demo=1&company=peine');
wkTest.tbtPush({
  week: '2020-01-06', talkId: wkTest.tbtCurrentTalk().i, kind: 'individual',
  company: 'peine', employee: wkTest.TBT_CO.peine.me, at: new Date().toISOString(),
});
assert.equal(wkTest.tbtMyRecord(), null, "a past week's completion must not satisfy this week");

const talkTest = makeModule('?demo=1&company=peine');
talkTest.tbtPush({
  week: talkTest.tbtMondayISO(), talkId: 'some-other-talk', kind: 'individual',
  company: 'peine', employee: talkTest.TBT_CO.peine.me, at: new Date().toISOString(),
});
assert.equal(talkTest.tbtMyRecord(), null,
  'completing a different talk must not satisfy this week’s talk');

/* ------------------------------------------------------------------ *
 * 9. Duplicate prevention is enforced in the UI, not just the data
 * ------------------------------------------------------------------ */
includes("if (tbtMyRecord()) { toast('error', 'Already completed'",
  'the individual submit must refuse a second completion');
includes('You already completed this week’s Toolbox Talk on',
  'a completed individual must be told so instead of being offered the form again');
includes('This group already submitted this week',
  'a group that already submitted must be told so');
includes("if (TBT_SEL.manual.indexOf(n) === -1 && TBT_SEL.attendees.indexOf(n) === -1) TBT_SEL.manual.push(n);",
  'a manually added name must not be added twice or duplicate a roster pick');

/* ------------------------------------------------------------------ *
 * 10. Group form affordances required for a phone
 * ------------------------------------------------------------------ */
includes('id="tbtSearch"', 'the attendee list must be searchable');
includes('id="tbtAll"', 'there must be a Select all assigned control');
includes('id="tbtNone"', 'there must be a Clear control');
includes('id="tbtManualAdd"', 'a name not on the roster must be addable');
includes('MANUAL ENTRY', 'a manually added name must be visibly flagged');
includes('id="tbtPresenter"', 'the presenter must be recorded');
includes('I presented this Toolbox Talk to the people listed above.',
  'the foreman must confirm they presented the talk');
includes('jha-crew-chip', 'attendees must be tap targets, not empty text boxes');
// Attendee count must be a sum, not string concatenation.
includes("(TBT_SEL.attendees.length + TBT_SEL.manual.length) + ' selected)",
  'the attendee count must add the two lists, not concatenate them');

// Every submission gate must exist.
for (const gate of ['Presenter required', 'No attendees', 'Confirm the talk']) {
  includes(gate, `the group form must refuse to submit without: ${gate}`);
}
includes('I have read and understood this Toolbox Talk.',
  'the individual form must require an acknowledgement');
includes('Confirm first', 'the individual form must refuse an unconfirmed submit');

// Individual mode must not let someone complete on another person's behalf.
includes('In individual mode you can only complete your own.',
  'individual mode must state that you can only complete your own');
includes('readonly', 'the individual identity field must not be editable');

/* ------------------------------------------------------------------ *
 * 11. Landing page shows the week's talk
 * ------------------------------------------------------------------ */
includes("if (key === 'toolbox') { openToolboxTalk(); return; }",
  'the Toolbox Talk tile must open the real workflow');
excludes('Toolbox Talks — Coming next', 'Toolbox Talks must no longer be a placeholder');
includes("Toolbox Talk — ' + esc(tbtCurrentTalk().t)",
  "the landing tile must name this week's talk");

/* ------------------------------------------------------------------ *
 * 12. Nothing is sent, uploaded or written to production
 * ------------------------------------------------------------------ */
const moduleSrc = html.slice(start, html.indexOf('function openToolboxTalk()'));
const moduleCode = moduleSrc
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
for (const forbidden of ['rpc(', 'edge(', 'fetch(', 'XMLHttpRequest', 'sendBeacon',
  'WebSocket', 'WEBHOOK', 'supabase', 'twilio', 'resend', 'n8n', 'FormData',
  'sms', 'reminder']) {
  assert.ok(!moduleCode.toLowerCase().includes(forbidden.toLowerCase()),
    `the mobile toolbox module must stay local — found "${forbidden}"`);
}
// The only cs_-prefixed name may be its own localStorage key.
const csRefs = [...moduleCode.matchAll(/['"](cs_[A-Za-z0-9_]+)['"]/g)].map((m) => m[1]);
assert.deepEqual(csRefs, ['cs_tbt_mobile_demo_v1'],
  `the only cs_* name may be the demo localStorage key, found: ${csRefs.join(', ')}`);
// Its own key, separate from the office demo's key and from production storage.
assert.equal(choice.TBT_KEY, 'cs_tbt_mobile_demo_v1', 'the mobile demo key must be demo-scoped');
assert.notEqual(choice.TBT_KEY, 'cs_tbt_demo_v1', 'mobile and office demos keep separate state');

// The document is opened locally and only ever behind the demo gate.
const openDoc = html.slice(html.indexOf('function tbtOpenDoc()'),
  html.indexOf('function tbtHeaderHtml('));
assert.ok(openDoc.includes('DEMO'), 'opening a local source document must be gated behind DEMO');
const filePaths = [...moduleSrc.matchAll(/'\/Users\/[^']*'/g)];
assert.ok(filePaths.length > 0, 'the demo references local source documents');
// No local absolute path may appear anywhere outside the gated demo module.
const outside = html.slice(0, start) + html.slice(html.indexOf('function openToolboxTalk()'));
assert.ok(!/'\/Users\//.test(outside),
  'a local absolute path leaked outside the gated demo module');

/* ------------------------------------------------------------------ *
 * 13. Production paths untouched
 * ------------------------------------------------------------------ */
includes("rpc('cs_portal_field_home', { p_token: ticket })",
  'production boot must still validate the ticket server-side');
includes("rpc('cs_portal_field_submit'", 'the production submit path must still exist');
includes('var ticket = DEMO ? null : (urlTicket || loadTicket());',
  'demo mode must still refuse any real or cached ticket');

/* ------------------------------------------------------------------ *
 * 14. The file still parses
 * ------------------------------------------------------------------ */
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((m) => m[1]).filter((s) => s.trim());
for (const [i, s] of inlineScripts.entries()) {
  assert.doesNotThrow(() => new Function(s), `Inline script ${i + 1} has invalid JavaScript`);
}

console.log('Toolbox Talk mobile verification passed ' +
  `(${Object.keys(choice.TBT_CO).length} companies, both completion paths, ` +
  `${inlineScripts.length} inline scripts parsed).`);
