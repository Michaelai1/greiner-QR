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

/* ---------------- current job + current date filtering ---------------- */
includes('if (r.job_id !== jobId || r.work_date !== today) return;',
  'Revision list must filter to the current job AND the current date');
includes('function jhaTodayISO()', 'A single source for "today" is required');

/* ---------------- picker shows the required columns ------------------- */
for (const bit of ['Submitted ', 'Last revised ', 'Revision ', 'employee']) {
  includes(bit, `Revision picker must show "${bit.trim()}"`);
}
includes('r.data.jhaDescriptionOfWork', 'Picker must show the description of work');
includes('r.revised_by', 'Picker must show who submitted it');

/* ---------------- selecting loads the LATEST revision ----------------- */
includes('var latest = hist[hist.length - 1];', 'Selecting a JHA must load its latest revision');
includes('revision_number: latest.revision_number + 1', 'The revision number must increase');
includes('previous_revision_id: latest.id', 'A revision must link to the revision it came from');
includes('original_submitted_at: latest.original_submitted_at',
  'A revision must carry the ORIGINAL submission time forward');

/* ---------------- the demo revision model ---------------- */
for (const field of ['root_jha_id', 'previous_revision_id', 'revision_number',
  'original_submitted_at', 'revised_at', 'revised_by', 'job_id', 'work_date', 'status']) {
  includes(field, `Revision model must track ${field}`);
}

/* ---------------- original is never overwritten or removed ------------ */
includes('DEMO_JHA_STORE.push(jhaRec);', 'A revision must be appended, never replace a record');
excludes('DEMO_JHA_STORE.splice', 'Nothing may be removed from the demo store');
excludes('DEMO_JHA_STORE = DEMO_JHA_STORE.filter', 'Records must never be filtered out');
// The submit path must not mutate the record it came from.
const submitSrc = html.slice(html.indexOf('function buildJhaRecord('), html.indexOf('function decorateJhaDoc('));
excludes('JHA_CTX.source.status =', 'The previous revision must not be mutated');
assert.ok(!/source\.\w+\s*=/.test(submitSrc), 'buildJhaRecord must not write back to the source record');

/* ---------------- no drafts / autosave / recovery --------------------- */
for (const banned of ['Resume Draft', 'resumeDraft', 'autoSave(', 'saveDraft',
  'Copy Previous JHA', 'copyPreviousJha', 'restoreDraft']) {
  excludes(banned, `Drafts/autosave are out of scope: "${banned}" must not exist`);
}
assert.ok(!/localStorage\.setItem\(\s*['"]jha/i.test(html), 'JHA state must not be persisted to localStorage');
includes('no autosave', 'The no-drafts intent should be recorded in a comment');

/* ---------------- no reason-for-revision field ------------------------ */
for (const banned of ['revision_reason', 'revisionReason', 'Reason for Revision', 'reasonForRevision']) {
  excludes(banned, `A reason-for-revision field must not exist: "${banned}"`);
}

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

/* ---------------- ladder ---------------------------------------------- */
includes('Planned or expected use of any ladder?', 'The required ladder question must exist');
includes('name="jhaLadderUse" value="yes" required', 'The ladder question must be required');
includes('function syncLadderPanel()', 'Ladder answers must drive the conditional panel');
// Only questions the supplied variance form actually contains.
includes('Can this work be done safely from a ladder?', 'Ladder question from the variance form is missing');
includes('Explain why a one-man scissor lift, or being tied off while using a ladder, will not work in this instance',
  'Ladder variance explanation question is missing');
includes('Above-ceiling hindrances / obstacles', 'Above-ceiling obstacle list is missing');
includes('Explain how the use of fall protection poses a greater risk than not using it',
  'Greater-risk explanation is missing');
includes('id="jhaLadderObstacle5"', 'The variance form lists five obstacle lines');
includes('Nothing\n                             here is invented', 'Provenance note for ladder questions is missing');

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
includes("title: 'Employees and Assignments'", 'PDF must show employees and assignments');
includes("title: 'Ladder Use'", 'PDF must show the ladder response');
includes("title: 'Revision History'", 'PDF must show a revision history summary');
includes("title: 'Photos'", 'PDF must show photos');

/* ---------------- compliance counting --------------------------------- */
includes('function demoDailyJhaCompliance() { return jhaRootsForToday().length; }',
  'Compliance must count distinct JHAs, not revisions');
includes('One original + N revisions still counts as ONE completed daily JHA.',
  'The compliance rule must be documented');

/* ---------------- still local-only ------------------------------------ */
const jhaModule = html.slice(html.indexOf('REVISED JHA — demo (local only)'), html.indexOf('// ---------- boot: validate ticket'));
for (const forbidden of ['rpc(', 'edge(', 'fetch(', 'XMLHttpRequest', 'sendBeacon', 'webhook']) {
  assert.ok(!jhaModule.includes(forbidden),
    `The JHA module must stay local — found "${forbidden}"`);
}
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
