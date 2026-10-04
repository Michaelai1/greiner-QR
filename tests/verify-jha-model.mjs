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

/* ---------------- ladders: job-assigned, identity from the session ---------------- */
const USER = { id: 'demo-user-foreman', name: 'Demo Foreman' };
const registry = () => [
  { ladder_id: 'LAD-101', job_id: 'j1', category: 'Ladder', description: '8 ft step' },
  { ladder_id: 'LAD-204', job_id: 'j1', category: 'Ladder' },
  { ladder_id: 'LAD-317', job_id: 'j1', category: 'Ladder' },
  { ladder_id: 'LAD-550', job_id: 'j2', category: 'Ladder' },
];
const inspections = () => [
  { id: 'a', ladder_id: 'LAD-101', result: 'safe', inspected_at: at('2026-09-29T07:05:00-04:00'), inspected_by: 'Alex Rivera (Demo)', defect: null },
  { id: 'b', ladder_id: 'LAD-101', result: 'safe', inspected_at: at('2026-09-14T07:05:00-04:00'), inspected_by: 'Jordan Blake (Demo)', defect: null },
  { id: 'c', ladder_id: 'LAD-204', result: 'safe', inspected_at: at('2026-07-16T08:00:00-04:00'), inspected_by: 'Sam Whitfield (Demo)', defect: null },
  { id: 'd', ladder_id: 'LAD-317', result: 'defect', inspected_at: at('2026-09-27T09:00:00-04:00'), inspected_by: 'Casey Nolan (Demo)',
    defect: { description: 'Cracked rail', tagged_do_not_use: true, reported_at: at('2026-09-27T09:00:00-04:00'), reported_by: 'Casey Nolan (Demo)', resolved_at: null } },
];
const safeReq = (id, extra) => Object.assign({ ladderId: id, jobId: 'j1', companyId: 'c1', user: USER, attested: true,
  attestationVersion: M.LADDER_SAFE_ATTESTATION.version, jhaRootId: 'root-1', jhaRevisionNumber: 1 }, extra || {});

t('1. Ladder No clears every ladder child value', () => {
  const d = M.normalizeJhaData({ jhaLadderUse: 'no', jhaLadderIds: '["LAD-101"]', jhaLadderChecks: '[{"ladder_id":"LAD-101"}]',
    jhaLadderDefects: '[{"ladder_id":"LAD-317"}]', jhaLadderId: 'LAD-101' });
  for (const k of ['jhaLadderIds', 'jhaLadderChecks', 'jhaLadderDefects', 'jhaLadderId', 'jhaLadderInspection']) {
    assert.ok(!(k in d), `${k} must be cleared on No`);
  }
});

t('3. Ladder choices are only the ladders assigned to the job', () => {
  assert.deepEqual(json(M.laddersForJob(registry(), inspections(), 'j1').map((o) => o.id)), ['LAD-101', 'LAD-204', 'LAD-317']);
  assert.deepEqual(json(M.laddersForJob(registry(), inspections(), 'j2').map((o) => o.id)), ['LAD-550']);
  assert.deepEqual(json(M.laddersForJob(registry(), inspections(), 'j9')), [], 'a job with no ladders has none');
  const opt = M.laddersForJob(registry(), inspections(), 'j1');
  assert.equal(opt[0].description, '8 ft step');
  assert.equal(opt[0].last_inspected_by, 'Alex Rivera (Demo)');
  assert.equal(opt[2].do_not_use, true, 'the defective ladder is marked Do Not Use in the list');
});

t('4. Several ladders can be selected and are stored in order', () => {
  const d = M.normalizeJhaData({ jhaLadderUse: 'yes', jhaLadderIds: '["lad-204","LAD-101","LAD-204"]' });
  assert.deepEqual(json(d.jhaLadderIds), ['LAD-204', 'LAD-101'], 'normalized, de-duplicated, in pick order');
});

t('5. No free-text ID path: a ladder must be assigned to the job', () => {
  for (const id of ['LAD-550', 'LAD-999', 'LAD-10']) {
    const r = M.confirmLadderSafe(registry(), inspections(), safeReq(id), WED_3PM);
    assert.equal(r.ok, false); assert.equal(r.code, 'not-assigned', `${id} must be refused`);
  }
  assert.match(M.jhaSubmitProblems({ jhaLadderUse: 'yes', jhaLadderIds: ['LAD-550'] },
    { ladders: { assigned: ['LAD-101', 'LAD-204', 'LAD-317'], states: {} } })[0], /not assigned to this job/);
});

t('6. No assigned ladders is clear and blocking', () => {
  const p = M.jhaSubmitProblems({ jhaLadderUse: 'yes', jhaLadderIds: [] }, { ladders: { assigned: [], states: {} } });
  assert.deepEqual(json(p), ['No ladders are assigned to this job. Contact the office before using a ladder.']);
  assert.match(M.jhaSubmitProblems({ jhaLadderUse: 'yes' }, { ladders: { assigned: ['LAD-101'], states: {} } })[0],
    /Select which ladder/);
});

t('7. Selecting a ladder loads exactly that ladder’s history', () => {
  const r = M.ladderLookup(registry(), inspections(), 'LAD-101');
  assert.equal(r.last.inspected_by, 'Alex Rivera (Demo)', 'the most recent of its own inspections');
  assert.ok(r.history.every((h) => h.ladder_id === 'LAD-101'));
  assert.equal(M.ladderLookup(registry(), inspections(), 'LAD-10').state, 'unknown', 'never a near match');
  const dup = registry().concat([{ ladder_id: 'lad-101', job_id: 'j1' }]);
  assert.equal(M.ladderLookup(dup, inspections(), 'LAD-101').state, 'duplicate');
  assert.equal(M.laddersForJob(dup, inspections(), 'j1')[0].duplicate, true, 'a duplicated ID is flagged, not picked');
});

t('9-10. Inspector identity comes from the session; a typed name is never accepted', () => {
  const ok = M.confirmLadderSafe(registry(), inspections(), safeReq('LAD-204'), WED_3PM);
  assert.equal(ok.record.inspected_by, 'Demo Foreman');
  assert.equal(ok.record.inspected_by_user_id, 'demo-user-foreman');
  for (const user of [{ name: 'Typed Name' }, {}, { id: 'x', name: ' ' }, undefined]) {
    const r = M.confirmLadderSafe(registry(), inspections(), safeReq('LAD-204', { user }), WED_3PM);
    assert.equal(r.code, 'auth'); assert.equal(r.message, 'Sign in with your employee access before recording an inspection.');
    assert.equal(M.reportLadderDefect(registry(), inspections(), { ladderId: 'LAD-204', jobId: 'j1', user, description: 'x', acknowledged: true }, WED_3PM).code, 'auth');
  }
});

t('11. Inspection time is the server clock and cannot be backdated', () => {
  const r = M.confirmLadderSafe(registry(), inspections(), safeReq('LAD-204', { inspected_at: '2020-01-01T00:00:00Z', at: '2020-01-01' }), WED_3PM);
  assert.equal(r.record.inspected_at, WED_3PM);
  assert.match(r.record.inspected_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

t('12. The exact safe-for-use attestation is stored with its version and links', () => {
  const r = M.confirmLadderSafe(registry(), inspections(), safeReq('LAD-204'), WED_3PM).record;
  assert.equal(r.attestation_text, 'I inspected this ladder before use today and found it safe to use.');
  assert.equal(r.attestation_version, 'ladder-safe-use-v1');
  assert.equal(r.result, 'safe');
  assert.deepEqual([r.ladder_id, r.job_id, r.company_id, r.jha_root_id, r.jha_revision_number], ['LAD-204', 'j1', 'c1', 'root-1', 1]);
  assert.equal(M.confirmLadderSafe(registry(), inspections(), safeReq('LAD-204', { attested: false }), WED_3PM).code, 'attest');
  assert.equal(M.confirmLadderSafe(registry(), inspections(), safeReq('LAD-204', { attestationVersion: 'old' }), WED_3PM).code, 'attest',
    'an outdated attestation version is refused');
  assert.ok(!/signature|OSHA|certif|compliant/i.test(r.attestation_text));
});

t('16. Defect report: description and Do Not Use acknowledgment required, photo optional', () => {
  const base = { ladderId: 'LAD-204', jobId: 'j1', companyId: 'c1', user: USER, jhaRootId: 'root-1', jhaRevisionNumber: 1 };
  assert.equal(M.reportLadderDefect(registry(), inspections(), Object.assign({}, base, { description: ' ', acknowledged: true }), WED_3PM).code, 'defect-description');
  assert.equal(M.reportLadderDefect(registry(), inspections(), Object.assign({}, base, { description: 'Bent rung' }), WED_3PM).code, 'defect-ack');
  const ok = M.reportLadderDefect(registry(), inspections(), Object.assign({}, base, { description: 'Bent rung', acknowledged: true }), WED_3PM);
  assert.equal(ok.ok, true, 'no photo is needed');
  assert.equal(ok.record.defect.acknowledgment_text, 'I marked or tagged this ladder ‘Do Not Use’ and removed it from service.');
  assert.equal(ok.record.defect.tagged_do_not_use, true);
  assert.equal(ok.record.defect.resolved_at, null);
  assert.ok(!('removed_from_service' in ok.record.defect), 'the old Yes/No removal answer is gone');
});

t('17. A defective ladder cannot be confirmed safe or submitted on the JHA', () => {
  const reg = registry(), ins = inspections();
  M.reportLadderDefect(reg, ins, { ladderId: 'LAD-204', jobId: 'j1', user: USER, description: 'Bent rung', acknowledged: true }, WED_3PM);
  const r = M.confirmLadderSafe(reg, ins, safeReq('LAD-204'), WED_3PM);
  assert.equal(r.code, 'do-not-use');
  const look = M.ladderLookup(reg, ins, 'LAD-204');
  assert.match(look.statusLabel, /^Do Not Use/);
  assert.match(M.jhaSubmitProblems({ jhaLadderUse: 'yes', jhaLadderIds: ['LAD-204'] },
    { ladders: { assigned: ['LAD-101', 'LAD-204'], states: { 'LAD-204': look } } })[0], /Do Not Use/);
  assert.deepEqual(json(M.jhaSubmitProblems({ jhaLadderUse: 'yes', jhaLadderIds: ['LAD-101'] },
    { ladders: { assigned: ['LAD-101', 'LAD-204'], states: { 'LAD-101': M.ladderLookup(reg, ins, 'LAD-101') } } })), [],
    'a different assigned ladder can be used instead');
  for (const st of ['do-not-use', 'no-open-defects', 'no-inspection']) {
    assert.ok(!/approved|ready|osha|compliant|certified/i.test(M.ladderStatusLabel(st)));
  }
});

t('18. Historical inspections and defects stay visible; a field user cannot resolve one', () => {
  const look = M.ladderLookup(registry(), inspections(), 'LAD-317');
  assert.equal(look.status, 'do-not-use');
  assert.equal(look.openDefect.description, 'Cracked rail');
  assert.ok(!('resolveLadderDefect' in M) && !('deleteLadderDefect' in M), 'no field-side resolve or delete');
  const d = M.normalizeJhaData({ jhaLadderUse: 'yes', jhaLadderIds: ['LAD-101'],
    jhaLadderDefects: [{ record_id: 'x', ladder_id: 'LAD-317', description: 'Cracked rail', reported_at: WED_3PM, reported_by: 'Demo Foreman', has_photo: true }] });
  const rows = M.jhaSections(d).find((s) => s.title === 'Ladder Use').items.map((i) => i.label + ' = ' + i.value);
  assert.ok(rows.some((r) => r.startsWith('Ladder LAD-317 — Defect reported = Cracked rail')),
    'a defect reported on this JHA stays on it even after the ladder is swapped');
});

t('Ladder cadence is informational: age alone never blocks or expires', () => {
  assert.equal(M.LADDER_INSPECTION_CADENCE.mode, 'informational');
  const old = M.ladderLookup(registry(), inspections(), 'LAD-204');
  assert.equal(old.status, 'no-open-defects');
  assert.equal(old.cadence.enforced, false);
  assert.ok(html.includes('Tony mentioned weekly ladder inspections but\n     has not confirmed the rule'));
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
  assert.equal(row.label, 'Who will conduct the lift inspections?');
  assert.equal(row.value, 'Alex Rivera (Demo), Jordan Blake (Demo)');
  assert.match(M.jhaSubmitProblems({ jhaAerialUse: 'yes', jhaAerialInspectors: '[]' })[0], /at least one person/);
});

/* ---------------- revisions ---------------- */
const base = { jhaDescriptionOfWork: 'Hang pipe', jhaLadderUse: 'yes', jhaLadderIds: ['LAD-101'],
  jhaAerialUse: 'yes', jhaAerialInspectors: ['Alex Rivera (Demo)'] };
function family(store, rootId, origAt, revisionTimes) {
  M.createOriginal(store, { rootId, jobId: 'j1', companyId: 'c1', by: 'Demo Foreman', data: base }, origAt);
  for (const when of revisionTimes) {
    const head = M.familyHead(store, rootId);
    const r = M.submitRevision(store, { rootId, baseVersionId: head.id, jobId: 'j1', companyId: 'c1', by: 'Demo Foreman',
      data: Object.assign({}, head.data, { jhaDescriptionOfWork: 'v' + (head.revision_number + 1) }) }, when);
    assert.equal(r.ok, true, `seed revision refused: ${r.code}`);
  }
}

t('14. New and revised JHAs normalize through the same path', () => {
  const raw = Object.assign({ jhaAerialUse: 'yes', jhaAerialInspectors: '["A","B"]', jhaLadderUse: 'yes', jhaLadderIds: '[" lad-101 "]' }, LEGACY);
  const store = [];
  const o = M.createOriginal(store, { rootId: 'f', jobId: 'j1', by: 'F', data: raw }, at(`${WED}T07:00:00-04:00`)).record;
  const r = M.submitRevision(store, { rootId: 'f', baseVersionId: o.id, jobId: 'j1', by: 'F', data: raw }, WED_3PM).record;
  assert.deepEqual(json(r.data), json(o.data), 'identical input must store identically on both routes');
  assert.deepEqual(json(o.data), json(M.normalizeJhaData(raw)));
  assert.deepEqual(json(o.data.jhaLadderIds), ['LAD-101']);
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
  const s = M.submitRevision(store, { rootId: 'old', baseVersionId: 'old-v1', jobId: 'j1', by: 'F', data: base }, WED_3PM);
  assert.equal(s.ok, false); assert.equal(store.length, 1, 'nothing was written');
});

t('19-20. Original plus three revisions succeeds; the fourth is refused', () => {
  const store = [];
  family(store, 'f', at(`${MON}T07:00:00-04:00`), [at(`${MON}T09:00:00-04:00`), at('2026-09-29T09:00:00-04:00'), at(`${WED}T09:00:00-04:00`)]);
  assert.deepEqual(json(M.familyVersions(store, 'f').map((v) => v.revision_number)), [1, 2, 3, 4]);
  const head = M.familyHead(store, 'f');
  const fourth = M.submitRevision(store, { rootId: 'f', baseVersionId: head.id, jobId: 'j1', by: 'F', data: base }, WED_3PM);
  assert.equal(fourth.ok, false); assert.equal(fourth.code, 'cap');
  assert.equal(fourth.message, 'This JHA already has 3 revisions. Start a new JHA to document additional changes.');
  assert.equal(store.length, 4);
  const card = M.revisionCandidates(store, { now: WED_3PM, jobId: 'j1' }).earlier.find((x) => x.rootId === 'f');
  assert.equal(card.eligibility.code, 'cap', 'a capped JHA stays listed with the cap message');
  assert.ok(html.includes("[{ id: 'new', label: 'Complete New JHA', primary: true }, { id: 'close', label: 'Close' }]") &&
    html.includes("(capped ? 'data-capped-root' : 'data-revise-root')"), 'tapping a capped JHA offers Complete New JHA');
});

t('21. A revision always starts from the latest submitted version', () => {
  const store = [];
  family(store, 'f', at(`${MON}T07:00:00-04:00`), [at(`${MON}T09:00:00-04:00`)]);
  const e = M.reviseEligibility(store, 'f', { now: WED_3PM, jobId: 'j1' });
  assert.equal(e.head.id, 'f-v2'); assert.equal(e.nextNumber, 2);
  const branch = M.submitRevision(store, { rootId: 'f', baseVersionId: 'f-v1', jobId: 'j1', by: 'F', data: base }, WED_3PM);
  assert.equal(branch.code, 'stale', 'branching from an older version is refused');
  const ok = M.submitRevision(store, { rootId: 'f', baseVersionId: 'f-v2', jobId: 'j1', by: 'F', note: '  Typo  ', data: base }, WED_3PM);
  assert.equal(ok.record.previous_revision_id, 'f-v2');
  assert.equal(ok.record.revised_at, WED_3PM, 'the revision time is the server clock');
  assert.equal(ok.record.original_submitted_at, at(`${MON}T07:00:00-04:00`));
  assert.equal(ok.record.revision_note, 'Typo');
  assert.equal(ok.record.revision_change_type, undefined, 'no change category is stored');
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
  const a = M.submitRevision(store, { rootId: 'f', baseVersionId: openedA, jobId: 'j1', by: 'A', data: base }, WED_3PM);
  const b = M.submitRevision(store, { rootId: 'f', baseVersionId: openedB, jobId: 'j1', by: 'B', data: base }, WED_3PM);
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

t('22-23. Revisions store an automatic field-level diff; the note is optional', () => {
  const store = [];
  family(store, 'f', at(`${MON}T07:00:00-04:00`), []);
  const crewA = { employees: ['Demo Foreman'], groups: [] }, crewB = { employees: ['Demo Foreman', 'Alex Rivera (Demo)'], groups: [] };
  store.length = 0;
  M.createOriginal(store, { rootId: 'f', jobId: 'j1', by: 'F', data: base, crew: crewA }, at(`${MON}T07:00:00-04:00`));
  const r = M.submitRevision(store, { rootId: 'f', baseVersionId: 'f-v1', jobId: 'j1', by: 'F', crew: crewB,
    data: Object.assign({}, base, { jhaDescriptionOfWork: 'Hang pipe and strut', jhaLadderIds: ['LAD-101', 'LAD-204'] }) }, WED_3PM);
  assert.equal(r.ok, true, 'no reason is required');
  assert.equal(r.record.revision_note, null);
  const d = json(r.record.revision_diff);
  const by = Object.fromEntries(d.map((x) => [x.key, x]));
  assert.deepEqual([by.jhaDescriptionOfWork.from, by.jhaDescriptionOfWork.to], ['Hang pipe', 'Hang pipe and strut']);
  assert.deepEqual([by.jhaLadderIds.from, by.jhaLadderIds.to], ['LAD-101', 'LAD-101, LAD-204']);
  assert.ok(by.crew && by.crew.to.includes('Alex Rivera (Demo)'), 'crew changes are part of the diff');
  assert.ok(!d.some((x) => x.key === 'jhaAerialUse'), 'unchanged fields are not listed');
  const withNote = M.submitRevision(store, { rootId: 'f', baseVersionId: 'f-v2', jobId: 'j1', by: 'F', note: '  West corridor  ',
    data: r.record.data, crew: crewB }, WED_3PM);
  assert.equal(withNote.record.revision_note, 'West corridor');
  assert.deepEqual(json(withNote.record.revision_diff), [], 'an identical resubmission records no field changes');
});

t('Other companies and jobs can never revise', () => {
  const store = [];
  family(store, 'f', at(`${MON}T07:00:00-04:00`), []);
  assert.equal(M.reviseEligibility(store, 'f', { now: WED_3PM, jobId: 'j2' }).code, 'other-job');
  assert.equal(M.reviseEligibility(store, 'f', { now: WED_3PM, jobId: 'j1', companyId: 'c2' }).code, 'other-company');
});

console.log(`JHA model verification passed (${checks} checks).`);
