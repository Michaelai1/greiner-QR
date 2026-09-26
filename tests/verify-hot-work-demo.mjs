import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const includes = (text, message) => assert.ok(html.includes(text), message);

includes('id="hotWorkFloor" name="hotWorkFloor" required', 'Floor / Level must be required');
includes('id="hotWorkArea" name="hotWorkArea" required', 'Specific Area / Room must be required');
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
