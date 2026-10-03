import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const conditionals = fs.readFileSync(
  new URL('../docs/tony-jha-conditionals-2026-10-02.md', import.meta.url), 'utf8');

const includes = (text, message) => assert.ok(html.includes(text), message);
const excludes = (text, message) => assert.ok(!html.includes(text), message);

excludes('name="jhaNewRevised"', 'JHA must not ask New or Revised after route selection');
excludes('aria-label="New or Revised"', 'redundant New or Revised control must be removed');
includes('>Estimated Time of Completion <', 'JHA completion time label was not updated');

includes('id="hotWorkType" name="hotWorkType" required', 'Hot Work type must be required');
const hotWorkTypeAt = html.indexOf('id="hotWorkType"');
const hotWorkDescriptionAt = html.indexOf('id="hotWorkDescription"');
assert.ok(hotWorkTypeAt > -1 && hotWorkTypeAt < hotWorkDescriptionAt,
  'Hot Work type must appear above Description of Work Being Performed');

includes("Manufacturer Operator's Manual Present and Readable",
  "Forklift operator's-manual question is missing");
// Required Yes/No (final prompt). Yes/No are shown and printed; the stored
// safe/defect values keep the defect count and defect-detail panel working.
includes('name="fl_chk_operator_manual" value="safe" data-display="Yes" required> Yes</label>',
  "Forklift operator's-manual question must be a required Yes");
includes('name="fl_chk_operator_manual" value="defect" data-display="No"> No</label>',
  "Forklift operator's-manual No must flag a defect");
includes("if (ck && ck.getAttribute('data-display')) response = ck.getAttribute('data-display');",
  'The PDF must print the Yes/No the inspector saw');
excludes('id="openJobSiteAnalysisBtn"', 'The older checklist JHA must no longer be offered');

includes('var TBT_MODE = TBT_URL_MODE || TBT_CO[TBT_COMPANY].mode;',
  'Toolbox Talk must start from the company-configured workflow');
includes('Greiner currently uses the foreman-led group workflow.',
  'the demo must identify Greiner\'s current workflow');

for (const required of [
  'The approved ladder-inspection freshness rule and source.',
  'The authoritative competent-person roster',
  'Whether notification to a named competent person is required',
  'do not invent',
]) {
  assert.ok(conditionals.toLowerCase().includes(required.toLowerCase()),
    `conditional-logic boundary is missing: ${required}`);
}

const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1]).filter((script) => script.trim());
for (const [index, script] of inlineScripts.entries()) {
  assert.doesNotThrow(() => new Function(script),
    `Inline script ${index + 1} has invalid JavaScript syntax`);
}

console.log(`Tony feedback verification passed (${inlineScripts.length} inline scripts parsed).`);
