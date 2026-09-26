import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const includes = (text, message) => assert.ok(html.includes(text), message);
const excludes = (text, message) => assert.ok(!html.includes(text), message);

includes('id="hotWorkFloor" name="hotWorkFloor" required', 'Floor / Level must be required');
includes('id="hotWorkArea" name="hotWorkArea" required', 'Specific Area / Room must be required');

/* --- Location workflow: free text, no admin setup, no dropdowns ---------- */
// Floor / Level and Specific Area / Room must be free-text inputs.
includes('type="text" class="form-input" id="hotWorkFloor" name="hotWorkFloor" required',
  'Floor / Level must be a required free-text input');
includes('type="text" class="form-input" id="hotWorkArea" name="hotWorkArea" required',
  'Specific Area / Room must be a required free-text input');
// Building / General Location stays, filled from the signed-in jobsite.
includes('id="hotWorkLocation" name="hotWorkLocation" required',
  'Building / General Location must remain a required field');
includes('[name="hotWorkLocation"]\', NG.job.name',
  'Building / General Location must be filled from the signed-in jobsite');

// The Building/Floor dropdown hierarchy must be gone for good.
excludes('hotWorkBuildingSelect', 'Building dropdown must be removed');
excludes('hotWorkFloorSelect', 'Floor dropdown must be removed');
excludes('name="hotWorkBuilding"', 'Hidden building field (dropdown-only) must be removed');
includes('function setupHotWorkLocation() { /* intentionally disabled',
  'setupHotWorkLocation must be disabled so the dropdowns cannot reappear');

// No job-specific location memory yet, but the intent is recorded.
includes('job-specific autocomplete suggestions',
  'A note about future job-specific floor/area suggestions must be present');
includes('value="Greiner Brothers Employee" required', 'Greiner employee option is missing');
includes('id="hotWorkSkillLevelGroup" style="display:none"', 'Conditional skill-level group is missing');
includes('id="hotWorkSkillLevel" name="hotWorkSkillLevel"', 'Skill-level select is missing');
includes('value="Superintendent"', 'Expected skill levels are incomplete');
includes('type="hidden" id="hotWorkSignedWorker"', 'Worker signature compatibility field must be hidden');
includes('Person Conducting Fire Watch', 'Fire-watch label was not updated');
includes('id="hotWorkFinalCheckupTime" name="hotWorkFinalCheckupTime" required', 'Final-checkup time must be a required datetime');
includes('Final Checkup Performed By', 'Final-checkup performer label was not updated');
includes("function isHotWorkStartBeforeNow(value, now)", 'Deterministic start-time validator is missing');
includes("if (form.id === 'hotWorkForm' && !validateHotWorkTiming()) return;", 'Hot Work submission does not enforce start-time validation');
includes("workerSignature.value = workerName ? workerName.value.trim() : '';", 'Top worker name is not copied into the compatibility field');
includes("params.get('review') === '1'", 'Safe no-submit review mode is missing');

const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((script) => script.trim());

for (const [index, script] of inlineScripts.entries()) {
  assert.doesNotThrow(() => new Function(script), `Inline script ${index + 1} has invalid JavaScript syntax`);
}

console.log(`Hot Work demo verification passed (${inlineScripts.length} inline scripts parsed).`);
