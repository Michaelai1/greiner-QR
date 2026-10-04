import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const includes = (text, message) => assert.ok(html.includes(text), message);
const excludes = (text, message) => assert.ok(!html.includes(text), message);

/* ---------------- routes ---------------- */
includes("if (key === 'jha') {", 'ngform=jha must open a brand-new JHA');
includes('JHA_CTX = null;', 'A new JHA must clear any revision context');
includes("if (key === 'revisejha' || key === 'revise_jha') { renderReviseList(); return; }",
  'ngform=revisejha must open the revision picker');
includes('>Complete New JHA<', 'Landing must offer "Complete New JHA"');
includes('>Revise Submitted JHA<', 'Landing must offer "Revise Submitted JHA"');
excludes('JHA — Coming next', 'JHA must no longer be marked "Coming next"');

/* ---------------- current job + current WORKWEEK (Tony, Oct 2) --------
   Superseded the same-day rule: up to three revisions per JHA within the
   Monday-Friday Indianapolis workweek. The rule lives in the shared model;
   tests/verify-jha-model.mjs proves the behavior. */
includes('workdays: [1, 2, 3, 4, 5]', 'The revision window must be Monday to Friday');
includes("timeZone: TZ,", 'The revision window must use the Indianapolis time zone');
includes('maxRevisions: 3', 'Three revisions per JHA family');
includes("return no('other-job', 'Only JHAs from this job can be revised here.');",
  'Revision list must filter to the current job');
includes('function jhaTodayISO()', 'A single source for "today" is required');

/* ---------------- picker shows the required columns ------------------- */
// Oct 4 correction: each JHA is one full-width row and the whole row is the
// action — no separate "Create revision" button.
for (const bit of ["'<span class=\"jha-rev-row-meta\">Submitted '", "' \\u00b7 last revised '", 'Tap to revise',
  'Choose a JHA to revise', '>Today<', '>Earlier this workweek<']) {
  includes(bit, `Revision picker must show "${bit}"`);
}
includes("'<button type=\"button\" class=\"jha-rev-row'", 'the whole row must be the button');
excludes('>Create revision<', 'no separate Create revision button');
includes('Choose a JHA from this job. Your changes will create a new time-stamped version. The original will not change.',
  'Picker helper text must match the approved copy');
includes('head.data.jhaDescriptionOfWork', 'Picker must show the description of work');
includes("esc(orig.submitted_by || '')", 'Picker must show the foreman');

/* ---------------- selecting loads the LATEST revision ----------------- */
includes('var latest = e.head;   // always the latest submitted version', 'Selecting a JHA must load its latest revision');
includes("revision_number: e.head.revision_number + 1", 'The revision number must increase');
includes('previous_revision_id: e.head.id', 'A revision must link to the revision it came from');
includes('original_submitted_at: e.original.original_submitted_at',
  'A revision must carry the ORIGINAL submission time forward');

/* ---------------- the demo revision model ---------------- */
for (const field of ['root_jha_id', 'previous_revision_id', 'revision_number',
  'original_submitted_at', 'revised_at', 'revised_by', 'job_id', 'work_date', 'status']) {
  includes(field, `Revision model must track ${field}`);
}

/* ---------------- original is never overwritten or removed ------------ */
includes('M.submitRevision(DEMO_JHA_STORE,', 'Revisions must go through the shared model');
includes('    store.push(rec);\n    return { ok: true, record: rec };', 'A revision must be appended, never replace a record');
excludes('DEMO_JHA_STORE.splice', 'Nothing may be removed from the demo store');
excludes('DEMO_JHA_STORE = DEMO_JHA_STORE.filter', 'Records must never be filtered out');
includes('Submitted records are frozen', 'Submitted versions must be immutable');
// The submit path must not mutate the record it came from.
const submitSrc = html.slice(html.indexOf('function submitRevision('), html.indexOf('function dailyJhaCount('));
assert.ok(!/(head|original)\.\w+\s*=[^=]/.test(submitSrc), 'submitRevision must not write back to earlier versions');

/* ---------------- no drafts / autosave / recovery --------------------- */
for (const banned of ['Resume Draft', 'resumeDraft', 'autoSave(', 'saveDraft',
  'Copy Previous JHA', 'copyPreviousJha', 'restoreDraft']) {
  excludes(banned, `Drafts/autosave are out of scope: "${banned}" must not exist`);
}
assert.ok(!/localStorage\.setItem\(\s*['"]jha/i.test(html), 'JHA state must not be persisted to localStorage');
includes('no autosave', 'The no-drafts intent should be recorded in a comment');

/* ---------------- no required reason (Oct 4 correction) ----------------
   Tony did not ask for a change category; the app computes the field-level
   difference itself. Only an optional note remains. */
for (const banned of ['data-change-type', 'REVISION_CHANGE_TYPES', 'changeType', 'Reason for Revision',
  'What changed? <span class="required">']) {
  excludes(banned, `No required change reason may exist: "${banned}"`);
}
includes('Revision note, optional', 'An optional revision note is offered');
includes('revision_diff: diffJhaData(e.head.data, nextData, e.head.crew, nextCrew),',
  'The field-level difference must be stored automatically');

/* ---------------- Description of Work (required) ---------------------- */
includes('id="jhaDescriptionOfWork" name="jhaDescriptionOfWork" rows="3" required',
  'Description of Work must be required');
includes('>Description of Work <', 'Description of Work needs a visible label');

/* ---------------- renamed action label -------------------------------- */
excludes('Recommended Action or Procedure', 'Old action label must be gone everywhere');
assert.ok((html.match(/Actions to Reduce Hazards/g) || []).length >= 4,
  'Actions to Reduce Hazards must cover the static rows and the dynamic row template');

/* ---------------- Reviewed By removed --------------------------------- */
excludes('jhaReviewedBy', 'Reviewed By must be removed from this demo');

/* ---------------- "Other" conditional fields -------------------------- */
includes('function wireOtherFields()', 'Other-option handling must exist');
includes("String(input.value || '').trim().toLowerCase() === 'other'",
  'Selecting Other must be detected');
includes("spec.setAttribute('required', 'required')",
  'The Other specify field must become required when shown');
// Other must be offered on all three lists.
const presets = html.slice(html.indexOf('var PRESETS = window.JHA_PRESETS'), html.indexOf('};', html.indexOf('var PRESETS = window.JHA_PRESETS')));
for (const key of ['tasks', 'hazards', 'actions']) {
  const m = new RegExp(key + ":\\s*\\[([\\s\\S]*?)\\n\\s*\\]").exec(presets);
  assert.ok(m, `${key} preset list not found`);
  assert.ok(/'Other'/.test(m[1]), `${key} must offer an "Other" option`);
}

/* ---------------- hazard list completeness ---------------------------- */
// Every hazard on the CHECKLIST JHA must be represented on the detailed JHA.
const hazMatch = /hazards:\s*\[([\s\S]*?)\n\s*\]/.exec(presets);
const detailed = [...hazMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
const addedFromChecklist = ['Flooding', 'Skin Irritants', 'Toxic Material', 'Adjacent Work',
  'Difficult Access', 'Confined Spaces', 'Ionizing Radiation', 'Elevated Load or Work',
  'Inadequate Ventilation', 'Water/Drowning Hazard', 'Environmental Extremes',
  'Employees/New or Temp', 'Hazardous Chemical Exposure/MSDS',
  'Potential Release of Energy Kinetic/Gravity', 'Lead Exposure'];
for (const h of addedFromChecklist) {
  assert.ok(detailed.includes(h), `Hazard from the checklist JHA is missing: "${h}"`);
}
assert.ok(detailed.length >= 33, `Detailed hazard list looks short (${detailed.length})`);

/* ---------------- employees: max 30, searchable, grouped -------------- */
includes('var JHA_MAX_EMPLOYEES = 30;', 'The employee cap must be 30');
includes('if (JHA_CREW.employees.length >= JHA_MAX_EMPLOYEES)', 'The cap must be enforced');
includes('id="jhaCrewSearch"', 'Crew selection must be searchable on a phone');
includes('jha-crew-chip', 'Crew selection must use tap targets, not empty text boxes');
for (let n = 1; n <= 6; n++) excludes(`id="jhaEmp${n}"`, `Old fixed employee box ${n} must be gone`);
includes('JHA_CREW.groups.push({ task:', 'Employees must be groupable under a task');
includes('data-assign-activity', 'Each group must record what they are doing');
includes('data-assign-member', 'Employees must be assignable to a group');

/* ---------------- warning for a task not on the JHA ------------------- */
includes('This task is not listed on the JHA yet.', 'A missing task must raise a warning');
includes('data-assign-addtask', 'The warning must offer a fast way to add the task');
includes('function addTaskToJha(task)', 'Quick-add must place the task into a JHA row');
includes("if (!/^jhaTask\\d+$/.test(i.name)) return;", 'Task scan must ignore the Other specify inputs');

/* ---------------- ladder (Tony, Oct 1: variance section removed) ------- */
includes('Is any ladder use planned or expected today?', 'The required ladder question must exist');
includes('name="jhaLadderUse" value="yes" required', 'The ladder question must be required');
includes('function syncLadderPanel()', 'Ladder answers must drive the conditional panel');
// Oct 4 correction: ladders are selected from the job's assigned list; there
// is no free-text Ladder ID.
includes('Which ladder or ladders will be used today? <span class="required">*</span>', 'Ladder Yes must ask which ladders');
excludes('id="jhaLadderId"', 'There must be no free-text Ladder ID field');
excludes('Enter or scan the ID displayed on the ladder.', 'The free-text helper must be gone');
// The retired questions survive ONLY in the model's legacy list (for old records).
const formHtml = html.slice(html.indexOf('<form id="jhaForm">'), html.indexOf('</form>', html.indexOf('<form id="jhaForm">')));
for (const gone of ['Can this work be done safely from a ladder?', 'one-man scissor lift',
  'Above-ceiling hindrances', 'greater risk than not using it', 'Variance Form', 'jhaLadderObstacle', 'jhaLadderSafe']) {
  assert.ok(!formHtml.includes(gone), `Retired ladder variance content must not be in the JHA form: "${gone}"`);
}

/* ---------------- photos ---------------------------------------------- */
includes('carriedPhotos: (latest.photos || []).slice()', 'Existing photos must carry into the revision');
includes('return carried.concat(added);', 'New photos must be appended to the carried ones');
includes('Nothing is ever dropped.', 'The no-photo-loss intent must be recorded');

/* ---------------- PDF content ----------------------------------------- */
includes("dmodel.title = 'Job Hazard Analysis';", 'PDF must be titled Job Hazard Analysis');
includes("dmodel.meta['Status'] = rec.revision_number > 1 ? 'REVISED' : 'Original';",
  'PDF must show Original vs Revised');
includes("dmodel.meta['Revision']", 'PDF must show the revision number');
includes("dmodel.meta['Original submitted']", 'PDF must show the original submission time');
includes("dmodel.meta['Latest revision']", 'PDF must show the latest revision time');
includes("dmodel.meta['Description of Work']", 'PDF must show the description of work');
includes("out.push({ title: 'Crew on this JHA', items: ci });", 'PDF must show employees and assignments');
includes("out.push({ title: 'Ladder Use', items: lad });", 'PDF must show the ladder response');
includes("out.push({ title: 'Aerial Lifts', items: aer });", 'PDF must show the aerial lift response');
includes("if (subtype === 'jha' && window.JhaModel) return jhaDocFromModel(form, payload);",
  'The JHA PDF must come from the shared model');
includes("title: 'Revision History'", 'PDF must show a revision history summary');
includes("title: 'Photos'", 'PDF must show photos');

/* ---------------- compliance counting --------------------------------- */
includes("return window.JhaModel.dailyJhaCount(DEMO_JHA_STORE, (NG.job && NG.job.id) || null, jhaTodayISO());",
  'Compliance must count distinct JHAs, not revisions');
includes('One original + N revisions still counts as ONE completed daily JHA.',
  'The compliance rule must be documented');

/* ---------------- still local-only ------------------------------------ */
const jhaModule = html.slice(html.indexOf('REVISED JHA — demo (local only)'), html.indexOf('TOOLBOX TALKS — mobile demo'));
for (const forbidden of ['rpc(', 'edge(', 'fetch(', 'XMLHttpRequest', 'sendBeacon', 'webhook']) {
  assert.ok(!jhaModule.includes(forbidden),
    `The JHA module must stay local — found "${forbidden}"`);
}
// Ladder records reach the server through ONE boundary outside the JHA module,
// which is closed in demo mode and can only call the two ladder writes.
const transport = html.slice(html.indexOf('var LADDER_TRANSPORT = {'), html.indexOf("// Aerial unit picker"));
assert.ok(transport.includes("if (DEMO || !ticket) return Promise.resolve(null);"), 'ladder loading is off in demo');
assert.ok(transport.includes("if (DEMO || !ticket) return Promise.reject(new Error('no session'));"), 'ladder writes are off in demo');
assert.ok(transport.includes("fn !== 'cs_portal_field_ladder_safe' && fn !== 'cs_portal_field_ladder_defect'"), 'only the two ladder writes are allowed');
assert.equal((transport.match(/rpc\(/g) || []).length, 2, 'one read and one write call');
includes('Demo submission completed. No data was saved.', 'Generic demo notice must remain');
includes('No production data was saved.', 'JHA completion must say no production data was saved');
includes("(revised ? 'Revised JHA submitted' : 'JHA submitted')",
  'Completion must say "Revised JHA submitted" for a revision');

/* ---------------- file still parses ----------------------------------- */
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((m) => m[1]).filter((s) => s.trim());
for (const [i, s] of inlineScripts.entries()) {
  assert.doesNotThrow(() => new Function(s), `Inline script ${i + 1} has invalid JavaScript`);
}

console.log(`Revised JHA verification passed (${detailed.length} hazards, ${inlineScripts.length} inline scripts parsed).`);
