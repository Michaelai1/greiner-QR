import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const includes = (text, message) => assert.ok(html.includes(text), message);

/* ------------------------------------------------------------------ *
 * 1. Demo mode uses clearly fake local data
 * ------------------------------------------------------------------ */
includes("var DEMO = params.get('demo') === '1';", 'demo=1 flag is not parsed');
includes("user: 'Demo Foreman'", 'Demo user must be Demo Foreman');
includes("name: 'Demo Greiner Job'", 'Demo job name is missing');
includes("job_number: 'DEMO-001'", 'Demo job number must be DEMO-001');

// Hot Work location is free text now, so the demo must not ship fake
// buildings/floors that would imply an admin has to configure them.
assert.ok(!html.includes('Demo Building'),
  'Demo must not contain fake Building fixtures — Hot Work location is free text');
includes('hotwork_locations: []',
  'Demo job must carry no configured hot-work buildings/floors');

// several fake employees for roster testing
const peopleBlock = html.slice(html.indexOf('people: ['), html.indexOf('equipment: ['));
const demoPeople = [...peopleBlock.matchAll(/name: '([^']+)'/g)].map((m) => m[1]);
assert.ok(demoPeople.length >= 5, `expected several demo employees, found ${demoPeople.length}`);
assert.ok(demoPeople.every((n) => /Demo|Foreman/i.test(n)),
  `every demo employee must be obviously fake: ${demoPeople.join(', ')}`);

/* ------------------------------------------------------------------ *
 * 2. Demo mode cannot reach any external service
 * ------------------------------------------------------------------ */
// It must never adopt a ticket — not even one cached in localStorage.
includes('var ticket = DEMO ? null : (urlTicket || loadTicket());',
  'Demo mode must refuse any real/cached ticket');

// Every outbound webhook is blanked for a demo tab.
includes("['WEBHOOK_REPORT', 'WEBHOOK_TRANSPORT', 'WEBHOOK_INSPECTION', 'WEBHOOK_DAILY_LOG', 'WEBHOOK_RENTAL']",
  'Demo mode must blank every webhook URL');

// The demo submit path itself must contain no network call whatsoever.
const demoSubmitSrc = html.slice(
  html.indexOf('function ngDemoSubmit('),
  html.indexOf('// Completion screen for a JHA')
);
assert.ok(demoSubmitSrc.length > 100, 'could not isolate ngDemoSubmit source');
for (const forbidden of ['rpc(', 'edge(', 'fetch(', 'XMLHttpRequest', 'navigator.sendBeacon', 'webhook']) {
  assert.ok(!demoSubmitSrc.includes(forbidden),
    `ngDemoSubmit must not contain "${forbidden}" — demo must stay local`);
}

/* ------------------------------------------------------------------ *
 * 3. Demo submissions never write data
 * ------------------------------------------------------------------ */
// The demo short-circuit must come FIRST in handleSaveData, ahead of the
// inspection branch, so no submit of any kind can fall through.
const saveDataSrc = html.slice(
  html.indexOf('window.handleSaveData = function'),
  html.indexOf('function extractJsaDoc')
);
const demoIdx = saveDataSrc.indexOf('if (DEMO) return ngDemoSubmit(');
const inspectionIdx = saveDataSrc.indexOf("payload.form_type === 'inspection'");
assert.ok(demoIdx > -1, 'handleSaveData has no demo short-circuit');
assert.ok(inspectionIdx > -1, 'handleSaveData lost its inspection branch');
assert.ok(demoIdx < inspectionIdx,
  'the demo short-circuit must run BEFORE the inspection branch');

includes('Demo submission completed. No data was saved.',
  'Demo success screen must state clearly that nothing was saved');
includes('return Promise.resolve({ demo: true, saved: false });',
  'Demo submit must resolve locally without writing');

/* ------------------------------------------------------------------ *
 * 4. Production flow is untouched and still requires a valid ticket
 * ------------------------------------------------------------------ */
includes("rpc('cs_portal_field_home', { p_token: ticket })",
  'Production boot must still validate the ticket server-side');
includes("rpc('cs_portal_field_submit'",
  'Production submit path must still exist');
includes("if (!NG.ticket) {", 'Production submit must still require a ticket');
includes("toast('error', 'Sign in required', 'Open this form from your Greiner dashboard.');",
  'Production must still refuse to submit without a session');

// The authenticated branch still runs when there is a ticket and no demo flag.
includes('} else if (ticket) {', 'Production ticket branch must remain in the boot chain');

// Existing safe review mode preserved.
includes("params.get('review') === '1'", 'Safe no-submit review mode must be preserved');

/* ------------------------------------------------------------------ *
 * 5. Review-demo labelling and routing
 * ------------------------------------------------------------------ */
includes('Greiner Review Demo', 'Visible "Greiner Review Demo" label is missing');
// JHA is built now; only Toolbox Talks remains unbuilt.
includes('>Complete New JHA<', 'Landing must offer "Complete New JHA"');
includes('>Revise Submitted JHA<', 'Landing must offer "Revise Submitted JHA"');
assert.ok(!html.includes('JHA — Coming next'), 'JHA must no longer be marked "Coming next"');
// Toolbox Talks is built now too — the landing shows the live weekly talk.
assert.ok(!html.includes('Toolbox Talks — Coming next'),
  'Toolbox Talks must no longer be marked "Coming next"');
includes("if (key === 'toolbox') { openToolboxTalk(); return; }",
  'Toolbox Talks must open the real workflow');
// Landing first: a form only auto-opens when the link names one.
includes('if (ngform) openDemoForm(ngform);',
  'Demo must stay on the landing screen unless a form is named in the URL');

/* ------------------------------------------------------------------ *
 * 6. Whole file still parses
 * ------------------------------------------------------------------ */
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((m) => m[1])
  .filter((s) => s.trim());
for (const [i, script] of inlineScripts.entries()) {
  assert.doesNotThrow(() => new Function(script), `Inline script ${i + 1} has invalid JavaScript`);
}

console.log(`Demo mode verification passed (${demoPeople.length} demo employees, ${inlineScripts.length} inline scripts parsed).`);
