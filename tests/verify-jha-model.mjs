/* Shared JHA model — ladder lookup, field normalization, and the workweek
 * revision rules — driven directly in Node. The model is read out of the
 * JHA-MODEL block in index.html, so this tests exactly what the page runs.
 * No browser, no network.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('/* JHA-MODEL:BEGIN');
const end = html.indexOf('/* JHA-MODEL:END */');
assert.ok(start > -1 && end > start, 'the JHA-MODEL block must exist in index.html');
const ctx = vm.createContext({});
vm.runInContext(html.slice(start, end), ctx);
const M = ctx.JhaModel;
assert.ok(M, 'the model must register as JhaModel');

let checks = 0;
const t = (name, fn) => { fn(); checks++; };
const json = (v) => JSON.parse(JSON.stringify(v));

// Indianapolis is UTC-4 in late Sep / Oct 2026 (EDT).
const at = (iso) => new Date(iso).toISOString();
const MON = '2026-09-28', WED = '2026-09-30', FRI = '2026-10-02';
const WED_3PM = at(`${WED}T15:00:00-04:00`);

/* ---------------- ladders ---------------- */
const registry = () => [
  { ladder_id: 'LAD-101', category: 'Ladder' },
  { ladder_id: 'LAD-204', category: 'Ladder' },
  { ladder_id: 'LAD-317', category: 'Ladder' },
];
const inspections = () => [
  { id: 'a', ladder_id: 'LAD-101', inspected_at: at('2026-09-29T07:05:00-04:00'), inspected_by: 'Alex Rivera (Demo)', defect: null },
  { id: 'b', ladder_id: 'LAD-101', inspected_at: at('2026-09-14T07:05:00-04:00'), inspected_by: 'Jordan Blake (Demo)', defect: null },
  { id: 'c', ladder_id: 'LAD-204', inspected_at: at('2026-07-16T08:00:00-04:00'), inspected_by: 'Sam Whitfield (Demo)', defect: null },
  { id: 'd', ladder_id: 'LAD-317', inspected_at: at('2026-09-27T09:00:00-04:00'), inspected_by: 'Casey Nolan (Demo)',
    defect: { description: 'Cracked rail', removed_from_service: 'yes', reported_at: at('2026-09-27T09:00:00-04:00'), resolved_at: null } },
];

t('1. Ladder No clears every ladder child value', () => {
  const d = M.normalizeJhaData({ jhaLadderUse: 'no', jhaLadderId: 'LAD-101',
    jhaLadderInspection: '{"ladder_id":"LAD-101"}' });
  assert.equal(d.jhaLadderUse, 'no');
  assert.ok(!('jhaLadderId' in d) && !('jhaLadderInspection' in d), 'ladder children must be cleared on No');
  const unanswered = M.normalizeJhaData({ jhaLadderId: 'LAD-101' });
  assert.ok(!('jhaLadderId' in unanswered), 'an unanswered parent must not keep a child value');
});

t('2. Ladder Yes requires a Ladder ID', () => {
  assert.deepEqual(json(M.jhaSubmitProblems({ jhaLadderUse: 'yes', jhaLadderId: '  ' })), ['Enter the Ladder ID.']);
  assert.deepEqual(json(M.jhaSubmitProblems({ jhaLadderUse: 'no' })), []);
});

t('3. Known ID loads the latest inspection and its inspector', () => {
  const r = M.ladderLookup(registry(), inspections(), ' lad-101 ');
  assert.equal(r.state, 'found');
  assert.equal(r.id, 'LAD-101');
  assert.equal(r.last.inspected_by, 'Alex Rivera (Demo)', 'must use the most recent inspection');
  assert.equal(r.last.inspected_at, at('2026-09-29T07:05:00-04:00'));
  assert.equal(r.status, 'no-open-defects');
});

t('4. Unknown ID shows no history and never matches another ladder', () => {
  for (const id of ['LAD-10', 'LAD-1011', 'LAD 101', 'LAD-1O1', '101']) {
    const r = M.ladderLookup(registry(), inspections(), id);
    assert.equal(r.state, 'unknown', `"${id}" must not match any ladder`);
    assert.match(r.message, /No inspection history was found/);
  }
});

t('5. Duplicate ladder IDs fail clearly and are never auto-picked', () => {
  const reg = registry().concat([{ ladder_id: 'lad-101', category: 'Ladder' }]);
  const r = M.ladderLookup(reg, inspections(), 'LAD-101');
  assert.equal(r.state, 'duplicate');
  assert.equal(r.count, 2);
  assert.match(r.message, /More than one ladder is registered as LAD-101/);
  const rec = M.recordLadderInspection(reg, inspections(), { ladderId: 'LAD-101', inspector: 'X', acknowledged: true }, WED_3PM);
  assert.equal(rec.ok, false); assert.equal(rec.code, 'duplicate');
  assert.ok(M.jhaSubmitProblems({ jhaLadderUse: 'yes', jhaLadderId: 'LAD-101' }, r)[0].includes('More than one ladder'));
});

t('6. Recording an inspection stores the inspector and an automatic server timestamp', () => {
  const reg = registry(), ins = inspections();
  const res = M.recordLadderInspection(reg, ins, { ladderId: 'lad-204', inspector: 'Demo Foreman', acknowledged: true }, WED_3PM);
  assert.equal(res.ok, true);
  assert.equal(res.record.inspected_by, 'Demo Foreman');
  assert.equal(res.record.inspected_at, WED_3PM);
  assert.match(res.record.inspected_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'must be an ISO-8601 UTC timestamp');
  assert.equal(res.lookup.last.inspected_by, 'Demo Foreman', 'the new inspection becomes the last inspection');
  const noAck = M.recordLadderInspection(registry(), inspections(), { ladderId: 'LAD-204', inspector: 'X', acknowledged: false }, WED_3PM);
  assert.equal(noAck.code, 'ack', 'the "I inspected this ladder before use" acknowledgment is required');
  const noWho = M.recordLadderInspection(registry(), inspections(), { ladderId: 'LAD-204', inspector: ' ', acknowledged: true }, WED_3PM);
  assert.equal(noWho.code, 'inspector');
});

t('7. A field user cannot backdate an inspection', () => {
  const res = M.recordLadderInspection(registry(), inspections(), { ladderId: 'LAD-204', inspector: 'Demo Foreman',
    acknowledged: true, inspected_at: '2020-01-01T00:00:00Z', inspectedAt: '2020-01-01' }, WED_3PM);
  assert.equal(res.record.inspected_at, WED_3PM, 'a supplied time must be ignored');
});

t('8. The defect action stays optional; when opened its answers are required', () => {
  const plain = M.recordLadderInspection(registry(), inspections(), { ladderId: 'LAD-204', inspector: 'A', acknowledged: true }, WED_3PM);
  assert.equal(plain.ok, true); assert.equal(plain.record.defect, null);
  const noDesc = M.recordLadderInspection(registry(), inspections(), { ladderId: 'LAD-204', inspector: 'A', acknowledged: true,
    defect: { description: ' ', removedFromService: 'yes' } }, WED_3PM);
  assert.equal(noDesc.code, 'defect-description');
  const noRemoved = M.recordLadderInspection(registry(), inspections(), { ladderId: 'LAD-204', inspector: 'A', acknowledged: true,
    defect: { description: 'Bent rung' } }, WED_3PM);
  assert.equal(noRemoved.code, 'defect-removed');
});

t('9. A reported defect produces Do Not Use, never an approval', () => {
  const reg = registry(), ins = inspections();
  const res = M.recordLadderInspection(reg, ins, { ladderId: 'LAD-204', inspector: 'A', acknowledged: true,
    defect: { description: 'Bent rung', removedFromService: 'yes' } }, WED_3PM);
  assert.equal(res.lookup.status, 'do-not-use');
  assert.match(res.lookup.statusLabel, /^Do Not Use/);
  const existing = M.ladderLookup(registry(), inspections(), 'LAD-317');
  assert.equal(existing.status, 'do-not-use', 'an older unresolved defect still means Do Not Use');
  // A later clean inspection does not clear an unresolved defect.
  const reg2 = registry(), ins2 = inspections();
  M.recordLadderInspection(reg2, ins2, { ladderId: 'LAD-317', inspector: 'A', acknowledged: true }, WED_3PM);
  assert.equal(M.ladderLookup(reg2, ins2, 'LAD-317').status, 'do-not-use');
  for (const s of ['do-not-use', 'no-open-defects', 'no-inspection']) {
    assert.ok(!/approved|ready|osha|compliant|certified/i.test(M.ladderStatusLabel(s)), `status "${s}" must make no approval or OSHA claim`);
  }
  assert.match(M.jhaSubmitProblems({ jhaLadderUse: 'yes', jhaLadderId: 'LAD-317' }, existing)[0], /Do Not Use/);
});

t('Ladder cadence is informational: age alone never blocks or expires', () => {
  assert.equal(M.LADDER_INSPECTION_CADENCE.mode, 'informational');
  const old = M.ladderLookup(registry(), inspections(), 'LAD-204');   // ~76 days old
  assert.equal(old.status, 'no-open-defects');
  assert.equal(old.cadence.enforced, false);
  assert.deepEqual(json(M.jhaSubmitProblems({ jhaLadderUse: 'yes', jhaLadderId: 'LAD-204' }, old)), []);
  assert.ok(html.includes('Tony mentioned weekly ladder inspections but\n     has not confirmed the rule'),
    'the unconfirmed weekly rule must be documented at the configuration');
});

/* ---------------- JHA fields ---------------- */
const LEGACY = { jhaNewRevised: 'new', jhaLadderSafe: 'yes', jhaLadderWhyNotLift: 'Too narrow for a lift',
  jhaLadderObstacle1: 'Sprinkler main', jhaLadderObstacle5: 'Duct', jhaLadderGreaterRisk: 'n/a' };

t('10. Retired ladder-variance fields are absent from new submissions', () => {
  const d = M.normalizeJhaData(Object.assign({ jhaLadderUse: 'yes', jhaLadderId: 'LAD-101' }, LEGACY));
  for (const k of Object.keys(LEGACY)) assert.ok(!(k in d), `${k} must not be stored on a new JHA`);
  const store = [];
  const rec = M.createOriginal(store, { jobId: 'j1', by: 'F', data: Object.assign({ jhaLadderUse: 'no' }, LEGACY) }, WED_3PM).record;
  for (const k of Object.keys(LEGACY)) assert.ok(!(k in rec.data), `${k} must not be stored by createOriginal`);
  const secs = M.jhaSections(rec.data);
  assert.ok(!secs.some((s) => s.legacy), 'a new JHA has no legacy section');
});

t('11. Historical reports still display the old variance questions and answers', () => {
  const secs = M.jhaSections(Object.assign({ jhaLadderUse: 'yes' }, LEGACY));
  const legacy = secs.find((s) => s.legacy);
  assert.ok(legacy, 'the historical variance answers must render');
  const labels = legacy.items.map((i) => i.label + ' = ' + i.value);
  assert.ok(labels.includes('Can this work be done safely from a ladder? = Yes'));
  assert.ok(labels.includes('Explain why a one-man scissor lift, or being tied off while using a ladder, will not work in this instance = Too narrow for a lift'));
  assert.ok(labels.includes('Above-ceiling hindrances / obstacles 1 = Sprinkler main'));
  assert.ok(secs[0].items.some((i) => i.key === 'jhaNewRevised' && i.value === 'new'), 'the old New/Revised answer still shows');
});

t('12. Aerial Lift No clears the inspector selections', () => {
  const d = M.normalizeJhaData({ jhaAerialUse: 'no', jhaAerialInspectors: '["Alex Rivera (Demo)"]' });
  assert.ok(!('jhaAerialInspectors' in d));
});

t('13. Aerial Lift Yes keeps multiple responsible people', () => {
  const d = M.normalizeJhaData({ jhaAerialUse: 'yes',
    jhaAerialInspectors: '["Alex Rivera (Demo)","Jordan Blake (Demo)","Alex Rivera (Demo)"]' });
  assert.deepEqual(json(d.jhaAerialInspectors), ['Alex Rivera (Demo)', 'Jordan Blake (Demo)']);
  const row = M.jhaSections(d).find((s) => s.title === 'Aerial Lifts').items
    .find((i) => i.key === 'jhaAerialInspectors');
  assert.equal(row.label, 'What competent person or persons will conduct the lift inspections?');
  assert.equal(row.value, 'Alex Rivera (Demo), Jordan Blake (Demo)');
  assert.match(M.jhaSubmitProblems({ jhaAerialUse: 'yes', jhaAerialInspectors: '[]' })[0], /at least one person/);
});

/* ---------------- revisions ---------------- */
const base = { jhaDescriptionOfWork: 'Hang pipe', jhaLadderUse: 'yes', jhaLadderId: 'LAD-101',
  jhaAerialUse: 'yes', jhaAerialInspectors: ['Alex Rivera (Demo)'] };
function family(store, rootId, origAt, revisionTimes) {
  M.createOriginal(store, { rootId, jobId: 'j1', companyId: 'c1', by: 'Demo Foreman', data: base }, origAt);
  for (const when of revisionTimes) {
    const head = M.familyHead(store, rootId);
    const r = M.submitRevision(store, { rootId, baseVersionId: head.id, jobId: 'j1', companyId: 'c1', by: 'Demo Foreman',
      changeType: 'Work scope', data: Object.assign({}, head.data, { jhaDescriptionOfWork: 'v' + (head.revision_number + 1) }) }, when);
    assert.equal(r.ok, true, `seed revision refused: ${r.code}`);
  }
}

t('14. New and revised JHAs normalize through the same path', () => {
  const raw = Object.assign({ jhaAerialUse: 'yes', jhaAerialInspectors: '["A","B"]', jhaLadderUse: 'yes', jhaLadderId: ' lad-101 ' }, LEGACY);
  const store = [];
  const o = M.createOriginal(store, { rootId: 'f', jobId: 'j1', by: 'F', data: raw }, at(`${WED}T07:00:00-04:00`)).record;
  const r = M.submitRevision(store, { rootId: 'f', baseVersionId: o.id, jobId: 'j1', by: 'F', changeType: 'Work scope', data: raw }, WED_3PM).record;
  assert.deepEqual(json(r.data), json(o.data), 'identical input must store identically on both routes');
  assert.deepEqual(json(o.data), json(M.normalizeJhaData(raw)));
  assert.equal(o.data.jhaLadderId, 'LAD-101');
});

t('16. Picker groups into Today and Earlier this workweek, newest first', () => {
  const store = [];
  family(store, 'mon', at(`${MON}T07:00:00-04:00`), []);
  family(store, 'tue', at('2026-09-29T07:00:00-04:00'), [at('2026-09-29T13:00:00-04:00')]);
  family(store, 'wed-early', at(`${WED}T06:30:00-04:00`), []);
  family(store, 'wed-late', at(`${WED}T07:30:00-04:00`), []);
  family(store, 'prev-fri', at('2026-09-25T07:00:00-04:00'), []);
  M.createOriginal(store, { rootId: 'other', jobId: 'j2', by: 'X', data: base }, at(`${WED}T08:00:00-04:00`));
  const c = M.revisionCandidates(store, { now: WED_3PM, jobId: 'j1', companyId: 'c1' });
  assert.deepEqual(json(c.today.map((x) => x.rootId)), ['wed-late', 'wed-early']);
  assert.deepEqual(json(c.earlier.map((x) => x.rootId)), ['tue', 'mon'], 'newest activity first (Tue revised 1pm)');
  assert.equal(c.hiddenCount, 1, 'the prior-week JHA is not offered');
  assert.ok(![...c.today, ...c.earlier].some((x) => x.rootId === 'other'), 'other jobs are never offered');
});

t('17. Monday 12:00 AM to Friday 11:59 PM Indianapolis is the window', () => {
  const ww = (iso) => json(M.workweekOf(iso));
  assert.deepEqual(ww('2026-09-28T04:00:00Z'), { date: MON, dow: 1, weekStart: MON, isWorkday: true }, 'Mon 12:00 AM');
  assert.deepEqual(ww('2026-09-28T03:59:59Z'), { date: '2026-09-27', dow: 7, weekStart: '2026-09-21', isWorkday: false }, 'Sun 11:59 PM');
  assert.deepEqual(ww('2026-10-03T03:59:59Z'), { date: FRI, dow: 5, weekStart: MON, isWorkday: true }, 'Fri 11:59 PM');
  assert.deepEqual(ww('2026-10-03T04:00:00Z'), { date: '2026-10-03', dow: 6, weekStart: MON, isWorkday: false }, 'Sat 12:00 AM');
  // Across the DST change (Sun Nov 1 2026): Monday 12:30 AM EST.
  assert.deepEqual(ww('2026-11-02T05:30:00Z'), { date: '2026-11-02', dow: 1, weekStart: '2026-11-02', isWorkday: true });
  const store = [];
  family(store, 'f', at(`${MON}T07:00:00-04:00`), []);
  assert.equal(M.reviseEligibility(store, 'f', { now: '2026-10-03T03:59:59Z', jobId: 'j1' }).ok, true, 'Friday 11:59 PM is open');
  assert.equal(M.reviseEligibility(store, 'f', { now: '2026-10-03T04:00:00Z', jobId: 'j1' }).code, 'weekend-now', 'Saturday 12:00 AM is closed');
  const wk = [];
  M.createOriginal(wk, { rootId: 'sat', jobId: 'j1', by: 'F', data: base }, '2026-10-03T14:00:00Z');
  assert.equal(M.reviseEligibility(wk, 'sat', { now: '2026-10-05T14:00:00Z', jobId: 'j1' }).code, 'weekend-original',
    'a JHA submitted on a weekend is never revisable');
  assert.equal(M.reviseEligibility(wk, 'sat', { now: '2026-10-03T15:00:00Z', jobId: 'j1' }).code, 'weekend-now',
    'weekend records route to Complete New JHA');
});

t('18. A prior-week JHA cannot be revised', () => {
  const store = [];
  family(store, 'old', at('2026-09-25T07:00:00-04:00'), []);
  const e = M.reviseEligibility(store, 'old', { now: WED_3PM, jobId: 'j1' });
  assert.equal(e.code, 'outside-week');
  assert.match(e.message, /earlier workweek and can no longer be revised/);
  const s = M.submitRevision(store, { rootId: 'old', baseVersionId: 'old-v1', jobId: 'j1', by: 'F', changeType: 'Work scope', data: base }, WED_3PM);
  assert.equal(s.ok, false); assert.equal(store.length, 1, 'nothing was written');
});

t('19-20. Original plus three revisions succeeds; the fourth is refused', () => {
  const store = [];
  family(store, 'f', at(`${MON}T07:00:00-04:00`), [at(`${MON}T09:00:00-04:00`), at('2026-09-29T09:00:00-04:00'), at(`${WED}T09:00:00-04:00`)]);
  assert.deepEqual(json(M.familyVersions(store, 'f').map((v) => v.revision_number)), [1, 2, 3, 4]);
  const head = M.familyHead(store, 'f');
  const fourth = M.submitRevision(store, { rootId: 'f', baseVersionId: head.id, jobId: 'j1', by: 'F', changeType: 'Work scope', data: base }, WED_3PM);
  assert.equal(fourth.ok, false); assert.equal(fourth.code, 'cap');
  assert.equal(fourth.message, 'This JHA already has 3 revisions. Start a new JHA to document additional changes.');
  assert.equal(store.length, 4);
  const card = M.revisionCandidates(store, { now: WED_3PM, jobId: 'j1' }).earlier.find((x) => x.rootId === 'f');
  assert.equal(card.eligibility.code, 'cap', 'a capped JHA stays listed with the cap message');
  assert.ok(html.includes("data-new-jha=\"1\" style=\"width:100%\">Complete New JHA</button>"), 'the capped card offers Complete New JHA');
});

t('21. A revision always starts from the latest submitted version', () => {
  const store = [];
  family(store, 'f', at(`${MON}T07:00:00-04:00`), [at(`${MON}T09:00:00-04:00`)]);
  const e = M.reviseEligibility(store, 'f', { now: WED_3PM, jobId: 'j1' });
  assert.equal(e.head.id, 'f-v2'); assert.equal(e.nextNumber, 2);
  const branch = M.submitRevision(store, { rootId: 'f', baseVersionId: 'f-v1', jobId: 'j1', by: 'F', changeType: 'Work scope', data: base }, WED_3PM);
  assert.equal(branch.code, 'stale', 'branching from an older version is refused');
  const ok = M.submitRevision(store, { rootId: 'f', baseVersionId: 'f-v2', jobId: 'j1', by: 'F', changeType: 'Correction or other', note: '  Typo  ', data: base }, WED_3PM);
  assert.equal(ok.record.previous_revision_id, 'f-v2');
  assert.equal(ok.record.revised_at, WED_3PM, 'the revision time is the server clock');
  assert.equal(ok.record.original_submitted_at, at(`${MON}T07:00:00-04:00`));
  assert.equal(ok.record.revision_note, 'Typo');
  assert.equal(M.submitRevision(store, { rootId: 'f', baseVersionId: 'f-v3', jobId: 'j1', by: 'F', changeType: 'Bad', data: base }, WED_3PM).code, 'reason');
});

t('22. The original and earlier revisions never change', () => {
  const store = [];
  family(store, 'f', at(`${MON}T07:00:00-04:00`), [at(`${MON}T09:00:00-04:00`)]);
  const before = json(store);
  M.submitRevision(store, { rootId: 'f', baseVersionId: 'f-v2', jobId: 'j1', by: 'F', changeType: 'Work scope',
    data: { jhaDescriptionOfWork: 'changed' } }, WED_3PM);
  assert.deepEqual(json(store.slice(0, 2)), before, 'earlier versions are byte-for-byte unchanged');
  assert.ok(Object.isFrozen(store[0]) && Object.isFrozen(store[0].data), 'stored versions are frozen');
  assert.throws(() => { 'use strict'; store[0].data.jhaDescriptionOfWork = 'x'; });
});

t('23. A stale concurrent revision is refused, with no duplicate numbers', () => {
  const store = [];
  family(store, 'f', at(`${MON}T07:00:00-04:00`), []);
  const openedA = M.familyHead(store, 'f').id, openedB = M.familyHead(store, 'f').id;
  const a = M.submitRevision(store, { rootId: 'f', baseVersionId: openedA, jobId: 'j1', by: 'A', changeType: 'Work scope', data: base }, WED_3PM);
  const b = M.submitRevision(store, { rootId: 'f', baseVersionId: openedB, jobId: 'j1', by: 'B', changeType: 'Work scope', data: base }, WED_3PM);
  assert.equal(a.ok, true); assert.equal(b.ok, false); assert.equal(b.code, 'stale');
  assert.match(b.message, /Refresh to load the latest version/);
  const nums = M.familyVersions(store, 'f').map((v) => v.revision_number);
  assert.deepEqual(json(nums), [1, 2]);
});

t('24. One family counts as one daily JHA; revisions are counted separately', () => {
  const store = [];
  family(store, 'f', at(`${MON}T07:00:00-04:00`), [at(`${MON}T09:00:00-04:00`), at(`${MON}T11:00:00-04:00`), at(`${MON}T13:00:00-04:00`)]);
  family(store, 'g', at(`${MON}T07:30:00-04:00`), []);
  assert.equal(M.dailyJhaCount(store, 'j1', MON), 2);
  assert.equal(M.revisionEventCount(store, 'j1'), 3);
});

t('Other companies and jobs can never revise', () => {
  const store = [];
  family(store, 'f', at(`${MON}T07:00:00-04:00`), []);
  assert.equal(M.reviseEligibility(store, 'f', { now: WED_3PM, jobId: 'j2' }).code, 'other-job');
  assert.equal(M.reviseEligibility(store, 'f', { now: WED_3PM, jobId: 'j1', companyId: 'c2' }).code, 'other-company');
});

console.log(`JHA model verification passed (${checks} checks).`);
