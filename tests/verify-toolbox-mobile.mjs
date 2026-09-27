/* Toolbox Talks — mobile demo verification.
 *
 * The demo is a three-step phone walkthrough:
 *   1 Choose Method   2 Review Talk   3 Record Completion
 *
 * This loads the module's logic out of index.html and exercises it directly,
 * and checks the rendered markup and the demo assets on disk. Nothing here
 * reaches Supabase, n8n, Twilio, Resend or the network; no texts are sent.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
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
    return { TBT_KEY, TBT_TALKS, TBT_CO, TBT_COMPANY, TBT_URL_MODE, TBT_MODE,
             TBT_STEP, TBT_PAGE, TBT_READ, TBT_STEP_LABELS,
             TBT_URL_FORMAT, TBT_FORMAT, TBT_SECTION, TBT_SECTION_DONE,
             tbtMondayISO, tbtDueLabel, tbtCurrentTalk, tbtState, tbtPush,
             tbtMyRecord, tbtGroupRecord, tbtStatusText, tbtMyGroup,
             tbtHasGuided, tbtSections, tbtSectionsDone, tbtSectionsDoneCount,
             tbtReviewed };
  `);
  const m = factory(new URLSearchParams(search), localStorage);
  m.store = store;
  return m;
};

/* ------------------------------------------------------------------ *
 * 1. Toolbox Talks appears on the local demo homepage
 *
 * A reviewer opening index.html?demo=1 must see it without knowing to add
 * ngform=toolbox.
 * ------------------------------------------------------------------ */
includes("Toolbox Talk — ' + esc(tbtCurrentTalk().t)",
  "the homepage tile must name this week's talk");
includes("if (key === 'toolbox') { openToolboxTalk(); return; }",
  'the homepage tile must open the real walkthrough');
excludes('Toolbox Talks — Coming next', 'Toolbox Talks must no longer be a placeholder');
// It sits alongside the other three forms on the same demo homepage.
for (const tile of ['>Complete New JHA<', '>Revise Submitted JHA<', 'Hot Work Permit']) {
  includes(tile, `the demo homepage must still offer ${tile}`);
}
// The landing screen is what opens when no form is named in the URL.
includes('if (ngform) openDemoForm(ngform);',
  'without ?ngform the demo must stay on the homepage so the tile is visible');

/* ------------------------------------------------------------------ *
 * 2. Both demo workflow options exist, with the wording that was asked for
 * ------------------------------------------------------------------ */
includes('Foreman Leads Group Talk', 'option 1 must be offered');
includes('Each Employee Completes Individually', 'option 2 must be offered');
includes('data-tbt-method="group"', 'option 1 must be selectable');
includes('data-tbt-method="individual"', 'option 2 must be selectable');

// Descriptions are built from concatenated source lines, so compare against
// the text the phone actually renders rather than the source layout.
const flatten = (s) => s.replace(/'\s*\+\s*\n\s*'/g, '').replace(/\s+/g, ' ');
const methodSrc = flatten(html.slice(html.indexOf('function renderTbtMethod()'),
  html.indexOf('/* ---------------- STEP 2')));
for (const [text, what] of [
  ['One foreman presents the talk, selects everyone who attended, adds any missing names, and submits once for the group.',
    'option 1'],
  ['Every employee reviews the same talk and submits their own acknowledgment.',
    'option 2'],
  // The selector must say plainly that production does not work this way.
  ['This selector is for the demo only. In production the office configuration decides which option an employee receives — employees do not choose the company workflow themselves.',
    'the production-configuration note'],
]) {
  assert.ok(methodSrc.includes(text), `${what} is missing its text: "${text}"`);
}

/* ------------------------------------------------------------------ *
 * 3. Switching between the two options, without touching the URL
 * ------------------------------------------------------------------ */
includes('id="tbtChangeMethod"', 'there must be an in-page way back to the method chooser');
includes('Switch demo workflow', 'the switch control needs a visible label');
includes("document.getElementById('tbtChangeMethod').onclick = function () { tbtGo('method'); };",
  'the switch control must return to the method step');
// Choosing a method resets the walkthrough so the two flows cannot bleed together.
includes("TBT_MODE = b.getAttribute('data-tbt-method');",
  'choosing an option must set the mode');
includes('TBT_PAGE = 0; TBT_READ = false;', 'choosing an option must restart the review');

// Both paths exist and are distinct.
includes('function renderTbtGroup()', 'the group completion path must exist');
includes('function renderTbtIndividual()', 'the individual completion path must exist');
includes("if (TBT_MODE === 'individual') return renderTbtIndividual();",
  'the completion step must branch on the chosen method');

/* ------------------------------------------------------------------ *
 * 4. The actual Toolbox Talk content is displayed
 *
 * Not a title and a "view document" button: real rendered pages.
 * ------------------------------------------------------------------ */
excludes('View the Toolbox Talk document',
  'the talk must be shown inline, not behind a "view document" button');
excludes('tbtOpenDoc', 'the old file:// document opener must be gone');
includes('id="tbtPageImg"', 'the talk pages must be rendered in the page');
includes('class="tbt-page-img"', 'page images need their mobile styling');

const manifestPath = new URL('demo-assets/toolbox-talks/manifest.json', root);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert.equal(manifest.talks.length, 3, 'three talks are rendered for the walkthrough');

const mod = makeModule('?demo=1');
assert.equal(mod.TBT_TALKS.length, 3, 'the module must carry the three walkthrough talks');
assert.equal(mod.tbtCurrentTalk().t, 'Fall Protection',
  'Fall Protection is the first walkthrough talk');

// Content is never invented: the module's talks must match the manifest
// exactly, and the manifest must match what was actually rendered.
for (const t of mod.TBT_TALKS) {
  const entry = manifest.talks.find((x) => x.id === t.i);
  assert.ok(entry, `talk "${t.i}" is missing from the manifest`);
  assert.equal(t.t, entry.title, `title mismatch for ${t.i}`);
  assert.equal(t.f, entry.originalFilename, `original filename must be preserved for ${t.i}`);
  // The module's inert source string is normalised for the public repo; the
  // manifest keeps the real path so the resolve check below still guards
  // against a wrong path. The hosted build drops sourcePath entirely.
  const norm = (p) => p.replace(/[A-Z][a-z]+ Thread Batch (\d+)/, 'Source Batch C$1')
                       .replace(/[A-Z][a-z]+ Toolbox Email (\d+)/, 'Source Batch $1');
  assert.equal(t.src, norm(entry.sourcePath),
    `source path must match the manifest for ${t.i}`);
  assert.equal(t.pages.length, entry.pageCount, `page count mismatch for ${t.i}`);
  assert.deepEqual(t.pages, entry.pages.map((p) => p.src),
    `page list must match the manifest for ${t.i}`);
}

/* ------------------------------------------------------------------ *
 * 4b. Guided Talk — the second content format
 *
 * Content format is a separate axis from the completion method: either
 * method can be reached through either format.
 * ------------------------------------------------------------------ */
includes('data-tbt-format="doc"', 'the original-document format must be selectable');
includes('data-tbt-format="guided"', 'the Guided Talk format must be selectable');
includes('>View Original Document<', 'the document option needs its label');
includes('>Guided Talk<', 'the guided option needs its label');
includes('id="tbtFmtNote"', 'the format selector must carry a demo-only note');
assert.ok(flatten(html.slice(html.indexOf('function tbtFormatBarHtml()'),
  html.indexOf('function tbtWireFormatBar()')))
  .includes('Format switching is for the demo only. In production the office chooses ' +
            'the default format for each Toolbox Talk.'),
  'the format selector must say the office chooses the default in production');

// Only Fall Protection has a guided version so far.
const guidedTalks = mod.TBT_TALKS.filter((t) => t.sections && t.sections.length);
assert.equal(guidedTalks.length, 1, 'only one talk should be converted so far');
assert.equal(guidedTalks[0].i, 'fall', 'Fall Protection is the converted talk');
includes('function tbtHasGuided(', 'the guided format must be offered only where it exists');
assert.match(html, /if \(!tbtHasGuided\(tbtCurrentTalk\(\)\)\) return '';/,
  'a talk with no guided version must not offer the switcher');

const guided = manifest.talks.find((t) => t.id === 'fall').guided;
assert.ok(guided, 'the manifest must record the guided conversion');
assert.equal(guided.sectionCount, 8, 'Fall Protection has 8 sections');
assert.equal(guided.sections.length, 8, 'the manifest must list all 8 sections');
assert.equal(guidedTalks[0].sections.length, guided.sectionCount,
  'the module and the manifest must agree on the section count');

// Guided content is verbatim: it must match the manifest, and the manifest
// must match the text actually inside the source PDF.
guidedTalks[0].sections.forEach((sec, i) => {
  const m = guided.sections[i];
  assert.equal(sec.h, m.heading, `section ${i + 1} heading must match the manifest`);
  assert.deepEqual(sec.p, m.paras, `section ${i + 1} text must match the manifest`);
  assert.equal(sec.pg, m.page, `section ${i + 1} page must match the manifest`);
  assert.equal(sec.pgl, m.pageLabel, `section ${i + 1} page label must match the manifest`);
});

// Every section names its source page, and the pages are real.
const talkPageCount = manifest.talks.find((t) => t.id === 'fall').pageCount;
guidedTalks[0].sections.forEach((sec, i) => {
  assert.ok(sec.pgl, `section ${i + 1} must name its source page`);
  assert.match(sec.pgl, /^pages? \d+(–\d+)?$/, `odd page label on section ${i + 1}: ${sec.pgl}`);
  assert.ok(sec.pg >= 1 && sec.pg <= talkPageCount,
    `section ${i + 1} cites page ${sec.pg}, outside the ${talkPageCount}-page document`);
  assert.ok(sec.p.length > 0, `section ${i + 1} must carry its content`);
});
includes('From ' + "' + esc(t.f) + ', ' + esc(s.pgl)",
  'each section must display its source filename and page');

// Nothing is summarised: the section text must appear in the source PDF.
// demo-assets/toolbox-talks/fall-source-text.txt is the extracted source,
// committed so this check does not need the PDF or a PDF library.
const sourceText = fs.readFileSync(
  new URL('demo-assets/toolbox-talks/fall-source-text.txt', root), 'utf8');
const norm = (t) => t.replace(/\u2019/g, "'").replace(/\s+/g, ' ').trim();
const flatSource = norm(sourceText);
for (const [i, sec] of guidedTalks[0].sections.entries()) {
  assert.ok(flatSource.includes(norm(sec.h)),
    `section ${i + 1} heading is not verbatim from the source: "${sec.h}"`);
  for (const para of sec.p) {
    const probe = norm(para).replace(/^\*\s*/, '');
    assert.ok(flatSource.includes(probe),
      `section ${i + 1} text is not verbatim from the source: "${probe.slice(0, 70)}..."`);
  }
}
// And nothing was dropped: every body line of the source talk is covered.
const covered = norm(guidedTalks[0].sections
  .map((s) => s.h + ' ' + s.p.join(' ')).join(' ')).replace(/\*/g, '');
for (const probe of ['It may seem that a job can be performed more efficiently',
  'guardrails and toeboards or other effective barriers',
  'A full body harness is required with a fall arrest system',
  'restraining a worker from getting too close to an unprotected edge',
  'safety nets must be used instead',
  'Nets must extend at least eight feet beyond the building',
  'American National Standards Institute',
  'The use of fall protection can prevent serious injury and save your life']) {
  assert.ok(covered.includes(norm(probe)),
    `guided sections dropped source content: "${probe}"`);
}

/* Guided completion gate and progress */
includes('function tbtSectionsDone()', 'the gate must know when every section is ticked');
includes('function tbtSectionsDoneCount()', 'progress must be countable');
includes("Section ' + (TBT_SECTION + 1) +", 'the viewer must show "Section N of X"');
includes("doneCount + ' of ' + total + ' sections checked", 'progress must be shown');
includes('id="tbtSecPrev"', 'Previous must exist in the guided view');
includes('id="tbtSecNext"', 'Next must exist in the guided view');
includes('TBT_SECTION_DONE[TBT_SECTION] = this.checked;',
  'ticking a section must be recorded');
includes('var TBT_SECTION_DONE = [];',
  'ticked sections must live outside the render so they survive navigation');
includes("(allDone ? '' : ' disabled')",
  'completion must stay locked until every section is checked');
includes('Check every section before recording completion.',
  'the reviewer must be told why completion is locked');
includes("if (!tbtSectionsDone()) {", 'the continue handler must re-check the gate');

// Checkbox wording differs by completion method.
const guidedSrc = flatten(html.slice(html.indexOf('function renderTbtGuided()'),
  html.indexOf('/* ---------------- STEP 3A')));
assert.ok(guidedSrc.includes("'I reviewed this section'") &&
          guidedSrc.includes("'This section was covered'"),
  'both checkbox wordings must exist');
assert.match(guidedSrc, /TBT_MODE === 'individual'\s*\? 'I reviewed this section' : 'This section was covered'/,
  'the checkbox must be worded for the chosen completion method');

// The gate is per-format, and the document format keeps its own rule.
includes("return TBT_FORMAT === 'guided' ? tbtSectionsDone() : TBT_READ;",
  'each format must supply its own completion gate');

/* The document walkthrough is unchanged */
includes('function renderTbtDoc()', 'the document walkthrough must still exist');
assert.equal(mod.TBT_FORMAT, 'doc', 'the original document is still the default format');
assert.equal(makeModule('?demo=1&tbtformat=guided').TBT_FORMAT, 'guided',
  '?tbtformat=guided must open the guided version for testing');
assert.equal(makeModule('?demo=1&tbtformat=nonsense').TBT_FORMAT, 'doc',
  'an invalid tbtformat must fall back to the document');

/* ------------------------------------------------------------------ *
 * 5. Every page is reachable, and the assets resolve
 * ------------------------------------------------------------------ */
includes('id="tbtPrev"', 'a Previous control must exist');
includes('id="tbtNext"', 'a Next control must exist');
includes("Page ' + (TBT_PAGE + 1) + ' of ' + total",
  'the viewer must show "Page 1 of X"');
// Previous/Next are disabled at the ends rather than wrapping around.
includes("(TBT_PAGE === 0 ? ' disabled' : '')", 'Previous must be disabled on the first page');
includes("(TBT_PAGE >= total - 1 ? ' disabled' : '')", 'Next must be disabled on the last page');
includes('if (TBT_PAGE > 0) { TBT_PAGE--; renderTbtDoc(); }', 'Previous must step back one page');
includes('if (TBT_PAGE < total - 1) { TBT_PAGE++; renderTbtDoc(); }', 'Next must step forward one page');

// Relative paths, not absolute ones, and every file is really on disk.
let totalPages = 0;
for (const t of mod.TBT_TALKS) {
  for (const rel of t.pages) {
    assert.ok(!rel.startsWith('/') && !rel.startsWith('file:'),
      `page asset must be a relative path, got "${rel}"`);
    assert.match(rel, /^demo-assets\/toolbox-talks\//, `unexpected asset location: ${rel}`);
    const abs = new URL(rel, root);
    assert.ok(fs.existsSync(abs), `page asset is missing on disk: ${rel}`);
    assert.ok(fs.statSync(abs).size > 1000, `page asset looks empty: ${rel}`);
    totalPages++;
  }
}
assert.equal(totalPages, manifest.talks.reduce((n, t) => n + t.pageCount, 0),
  'every manifest page must be present');

// Every source PDF named in the manifest must actually exist at that path —
// this is what caught the original wrong paths.
for (const t of manifest.talks) {
  assert.ok(fs.existsSync(t.sourcePath),
    `manifest source path does not resolve: ${t.sourcePath}`);
  assert.ok(/\.pdf$/i.test(t.originalFilename), `expected a PDF for ${t.id}`);
  assert.equal(path.basename(t.sourcePath), t.originalFilename,
    `the source path and original filename disagree for ${t.id}`);
}

// The stale path that never existed must not come back.
excludes('Source Batch 01/Fall Protection.pdf',
  'the old non-existent source path must not reappear');

/* ------------------------------------------------------------------ *
 * 6. Completion is gated until the final page is reviewed
 * ------------------------------------------------------------------ */
includes('if (TBT_PAGE === total - 1) TBT_READ = true;',
  'reaching the last page must mark the talk as read');
includes("id=\"tbtToComplete\"", 'there must be a continue control');
includes("(TBT_READ ? '' : ' disabled')",
  'continuing to completion must be disabled until the talk is read');
includes('Read to the last page before recording completion.',
  'the reviewer must be told why continuing is disabled');
includes("if (!TBT_READ) {", 'the continue handler must also refuse when unread');
includes("toast('error', 'Finish the talk'", 'an early continue must be refused with a message');
// Opening the walkthrough always starts unread.
assert.equal(mod.TBT_READ, false, 'the walkthrough must start with the talk unread');
assert.equal(mod.TBT_PAGE, 0, 'the walkthrough must start on page 1');

/* ------------------------------------------------------------------ *
 * 7. The employee search field is gone
 * ------------------------------------------------------------------ */
excludes('id="tbtSearch"', 'the attendee search field must be removed');
excludes('Search employees', 'the search placeholder must be gone');
excludes('TBT_SEL.q', 'the search term state must be gone');
excludes('Nobody matches that search.', 'the empty-search message must be gone');

/* ------------------------------------------------------------------ *
 * 8. The roster is visible directly, as selectable rows
 * ------------------------------------------------------------------ */
includes('data-tbt-att=', 'every roster member must be selectable');
includes('class="tbt-rosterrow', 'roster rows need their own tap-target styling');
includes('aria-pressed=', 'selectable rows must expose their state');
includes('<span class="box">', 'each row needs a visible checkbox');
includes('id="tbtAll"', 'Select All Assigned must exist');
includes('Select All Assigned', 'Select All Assigned needs its label');
includes('id="tbtNone"', 'Clear must exist');
includes("id=\"tbtCount\"", 'the selected attendee count must be shown');
// The count is a number, not two lengths glued together ("30" for 3 + 0).
includes('var picked = TBT_SEL.attendees.length + TBT_SEL.manual.length;',
  'the count must add the roster and manual lists, not concatenate them');
includes("' + picked + ' selected)", 'the added count is what gets displayed');
includes('Job or meeting group', 'the job/meeting group picker needs its label');
includes('id="tbtPresenter"', 'the presenter must be recorded');
includes('Submit Group Toolbox Talk', 'the group submit button needs its label');

// The whole roster renders with no filtering step in between.
const choice = makeModule('?demo=1&company=choice');
assert.equal(choice.TBT_CO.choice.people.length, 12, "Choice's roster is 12 people");
assert.equal(choice.TBT_CO.choice.groups.length, 1,
  'Choice runs a single Monday morning meeting');
for (const n of ['Ainsley Frost (Demo)', 'Adrian Gable (Demo)', 'Zane Fairlie (Demo)']) {
  assert.ok(choice.TBT_CO.choice.people.some((p) => p.n === n),
    `${n} must be on Choice's roster`);
}

/* ------------------------------------------------------------------ *
 * 9. Manual attendee entry
 * ------------------------------------------------------------------ */
includes('Add someone not listed', 'the manual-entry field needs the asked-for label');
includes('id="tbtManual"', 'the manual-entry input must exist');
includes('id="tbtManualAdd"', 'the Add Name button must exist');
includes('>Add Name<', 'the Add Name button needs its label');
includes('MANUAL ENTRY', 'manually added names must be visibly flagged');
includes('class="tbt-manualpill"', 'manual names need their own styling');
includes('data-tbt-rmm=', 'a manually added name must be removable');
includes("if (TBT_SEL.manual.indexOf(n) === -1 && TBT_SEL.attendees.indexOf(n) === -1) TBT_SEL.manual.push(n);",
  'a manual name must not duplicate itself or a roster pick');

/* ------------------------------------------------------------------ *
 * 10. Back navigation follows the three steps
 * ------------------------------------------------------------------ */
assert.deepEqual(mod.TBT_STEP_LABELS.map((s) => s[1]),
  ['Choose Method', 'Review Talk', 'Record Completion'],
  'the progress indicator must name the three steps in order');
includes("if (TBT_STEP === 'complete') { tbtGo('review'); return; }",
  'Back from completion must return to Review Talk');
includes("if (TBT_STEP === 'review') { tbtGo('method'); return; }",
  'Back from Review Talk must return to Choose Method');
includes("window.showView('landing');", 'Back from Choose Method must return to the homepage');
includes('class="tbt-steps"', 'the progress indicator must be rendered');
includes('data-tbt-step=', 'each step must be identifiable');
// Without ?tbtmode the walkthrough opens on step 1.
assert.equal(mod.TBT_STEP, 'method', 'the walkthrough must open on Choose Method');
assert.equal(mod.TBT_MODE, null, 'no completion method may be preselected');
// ?tbtmode stays available for direct testing and skips to the talk.
const direct = makeModule('?demo=1&company=peine&tbtmode=individual');
assert.equal(direct.TBT_URL_MODE, 'individual', '?tbtmode must still be honoured');
assert.equal(direct.TBT_MODE, 'individual', '?tbtmode must preselect the method');
assert.equal(direct.TBT_STEP, 'review', '?tbtmode must open straight on the talk');
assert.equal(makeModule('?demo=1&tbtmode=garbage').TBT_STEP, 'method',
  'an invalid tbtmode must fall back to the chooser');

/* ------------------------------------------------------------------ *
 * 11. Contrast and layout
 *
 * The two visual bugs were unstyled classes: .back-button rendered as bare
 * text and .form-title inherited the dark theme's light colour onto a white
 * card. Both must now be styled explicitly.
 * ------------------------------------------------------------------ */
const css = html.slice(0, html.indexOf('</style>'));
assert.match(css, /\.back-button\s*\{[^}]*border:[^}]*\}/s, '.back-button must be styled');
assert.match(css, /\.back-button\s*\{[^}]*min-height:\s*44px/s,
  '.back-button must be a comfortable tap target');
assert.match(css, /\.back-button\s*\{[^}]*margin-bottom:/s, '.back-button needs spacing around it');
assert.match(css, /\.form-title\s*\{[^}]*color:\s*var\(--color-text-primary\)/s,
  '.form-title must set its own colour instead of inheriting');
// The talk panel is light, so its text is pinned dark rather than inherited.
assert.match(css, /\.tbt-doc\s*\{[^}]*background:\s*#ffffff/s, 'the talk panel must be light');
assert.match(css, /\.tbt-doc-title\s*\{[^}]*color:\s*#111827/s,
  'the talk title must be dark text on the light panel');
assert.match(css, /\.tbt-doc-sub\s*\{[^}]*color:\s*#4b5563/s,
  'the talk subtitle must be dark enough to read on white');
assert.match(css, /\.tbt-pagebtn\s*\{[^}]*color:\s*#111827/s, 'pager buttons must have dark text');
assert.match(css, /\.tbt-pagebtn\s*\{[^}]*min-height:\s*44px/s, 'pager buttons must be tappable');
assert.match(css, /\.tbt-rosterrow\s*\{[^}]*min-height:\s*48px/s, 'roster rows must be tappable');
// Nothing in the demo may rely on inherited colour on a light background.
assert.ok(!/class="tbt-doc"[^>]*>(?![\s\S]{0,400}tbt-doc-title)/.test(html),
  'the light panel must always carry an explicitly coloured title');
// Page images stay inside the phone width.
assert.match(css, /\.tbt-page-img\s*\{[^}]*width:\s*100%/s, 'page images must fit the phone width');
assert.match(css, /\.tbt-page-img\s*\{[^}]*height:\s*auto/s, 'page images must keep their aspect ratio');

// The persistent demo notice is present and does not overlay the interface.
includes('id="tbtNotice"', 'a persistent demo notice must exist');
includes('Demo only — nothing will be saved.', 'the notice must say nothing is saved');
assert.ok(!/\.tbt-notice\s*\{[^}]*position:\s*(fixed|absolute)/s.test(css),
  'the demo notice must sit in the flow, not cover the interface');

/* ------------------------------------------------------------------ *
 * 12. Rosters, week, and the two completion paths
 * ------------------------------------------------------------------ */
assert.equal(makeModule('?demo=1').TBT_COMPANY, 'greiner', 'no ?company defaults to Greiner');
assert.equal(makeModule('?demo=1&company=CHOICE').TBT_COMPANY, 'choice', 'company is case-insensitive');
assert.equal(makeModule('?demo=1&company=nope').TBT_COMPANY, 'greiner',
  'an unknown company must fall back rather than crash');
assert.equal(choice.TBT_CO.choice.mode, 'group', "Choice's configured method is group");
assert.equal(makeModule('?demo=1&company=peine').TBT_CO.peine.mode, 'individual',
  "Peine's configured method is individual");

// Peine's roster is demo data: the safety manager has not sent the real employee list.
const peine = makeModule('?demo=1&company=peine');
assert.ok(peine.TBT_CO.peine.people.every((p) => /\(Demo\)/.test(p.n)),
  "Peine's roster must stay obviously fake until the real list arrives");

// The week is always a Monday.
const wk = choice.tbtMondayISO();
assert.match(wk, /^\d{4}-\d{2}-\d{2}$/, 'the week key must be an ISO date');
const [y, m, d] = wk.split('-').map(Number);
assert.equal(new Date(y, m - 1, d).getDay(), 1, 'the due date must be a Monday');
assert.match(choice.tbtDueLabel(), /^Monday, /, 'the due label must read as a Monday');

// Group: one submission credits the whole group.
const g = makeModule('?demo=1&company=choice&tbtmode=group');
const gname = g.TBT_CO.choice.groups[0];
assert.equal(g.tbtStatusText(), '0 of 1 group submitted', 'status must start at zero');
g.tbtPush({ week: g.tbtMondayISO(), talkId: g.tbtCurrentTalk().i, kind: 'group',
  company: 'choice', group: gname, presenter: 'Ainsley Frost (Demo)',
  roster: g.TBT_CO.choice.people.map((p) => p.n), manual: ['Temp Helper'],
  at: new Date().toISOString() });
const rec = g.tbtGroupRecord(gname);
assert.ok(rec, 'the group submission must be found');
assert.equal(rec.roster.length + rec.manual.length, 13, 'attendance counts roster plus manual');
assert.equal(g.tbtStatusText(), '1 of 1 group submitted', 'status must reflect the submission');

// Individual: only your own, and only once.
const ind = makeModule('?demo=1&company=peine&tbtmode=individual');
assert.equal(ind.tbtStatusText(), 'Not completed', 'individual status starts incomplete');
assert.ok(ind.tbtMyGroup(), 'the individual must have a job assignment to show');
ind.tbtPush({ week: ind.tbtMondayISO(), talkId: ind.tbtCurrentTalk().i, kind: 'individual',
  company: 'peine', employee: ind.TBT_CO.peine.me, at: new Date().toISOString() });
assert.ok(ind.tbtMyRecord(), 'my completion must be found');
assert.equal(ind.tbtStatusText(), 'Completed', 'individual status must flip to completed');

const other = makeModule('?demo=1&company=peine&tbtmode=individual');
other.tbtPush({ week: other.tbtMondayISO(), talkId: other.tbtCurrentTalk().i,
  kind: 'individual', company: 'peine', employee: 'Finley Ward (Demo)',
  at: new Date().toISOString() });
assert.equal(other.tbtMyRecord(), null, "another employee's completion is not mine");
const indSrc = flatten(html.slice(html.indexOf('function renderTbtIndividual()'),
  html.indexOf('function tbtTalkStripHtml()')));
assert.ok(indSrc.includes('In individual mode you can only complete your own.'),
  'individual mode must say you can only complete your own');
includes('id="tbtMyJob"', "the individual's job assignment must be shown");
includes('I reviewed the complete ', 'the acknowledgement must reference the whole talk');
includes('Submit My Completion', 'the individual submit button needs its label');
includes("if (tbtMyRecord()) { toast('error', 'Already completed'",
  'a second individual completion must be refused');

// Mode and company isolation.
const x = makeModule('?demo=1&company=peine&tbtmode=individual');
x.tbtPush({ week: x.tbtMondayISO(), talkId: x.tbtCurrentTalk().i, kind: 'group',
  company: 'peine', group: x.TBT_CO.peine.groups[0], roster: ['a'], manual: [],
  at: new Date().toISOString() });
assert.equal(x.tbtMyRecord(), null, 'a group record must not satisfy individual mode');

const shared = makeModule('?demo=1&company=choice&tbtmode=group');
shared.tbtPush({ week: shared.tbtMondayISO(), talkId: shared.tbtCurrentTalk().i,
  kind: 'group', company: 'greiner', group: shared.TBT_CO.choice.groups[0],
  roster: ['Somebody'], manual: [], at: new Date().toISOString() });
assert.equal(shared.tbtGroupRecord(shared.TBT_CO.choice.groups[0]), null,
  "another company's record must not credit Choice");
includes('r.company === TBT_COMPANY', 'company must be matched explicitly on lookups');

// A completion belongs to one week and one talk.
const wkT = makeModule('?demo=1&company=peine&tbtmode=individual');
wkT.tbtPush({ week: '2020-01-06', talkId: wkT.tbtCurrentTalk().i, kind: 'individual',
  company: 'peine', employee: wkT.TBT_CO.peine.me, at: new Date().toISOString() });
assert.equal(wkT.tbtMyRecord(), null, "a past week's completion must not satisfy this week");

/* ------------------------------------------------------------------ *
 * 13. Demo submissions make no network request
 * ------------------------------------------------------------------ */
const moduleSrc = html.slice(start, html.indexOf('// ---------- boot:'));
const moduleCode = moduleSrc
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
for (const forbidden of ['rpc(', 'edge(', 'fetch(', 'XMLHttpRequest', 'sendBeacon',
  'WebSocket', 'WEBHOOK', 'supabase', 'twilio', 'resend', 'n8n', 'FormData',
  'sms', 'reminder', 'navigator.share']) {
  assert.ok(!moduleCode.toLowerCase().includes(forbidden.toLowerCase()),
    `the mobile toolbox module must stay local — found "${forbidden}"`);
}
// Its only persistence is its own localStorage key.
const csRefs = [...moduleCode.matchAll(/['"](cs_[A-Za-z0-9_]+)['"]/g)].map((m) => m[1]);
assert.deepEqual(csRefs, ['cs_tbt_mobile_demo_v1'],
  `the only cs_* name may be the demo localStorage key, found: ${csRefs.join(', ')}`);
assert.notEqual(mod.TBT_KEY, 'cs_tbt_demo_v1', 'mobile and office demos keep separate state');
includes('No production data was saved.', 'completion must say nothing was saved');

// No absolute local path is used to load anything. The source paths that
// remain are inert manifest strings for traceability, never fetched.
assert.ok(!/src\s*[:=]\s*['"]?file:/.test(moduleCode), 'nothing may be loaded over file://');
assert.ok(!/window\.open\(/.test(moduleCode), 'the demo must not open external windows');
for (const t of mod.TBT_TALKS) {
  assert.ok(t.src.startsWith('/Users/'), 'the manifest keeps the original source path');
  assert.ok(!t.pages.some((p) => p.includes(t.src)), 'page assets must not use the source path');
}

/* ------------------------------------------------------------------ *
 * 14. Production behaviour is unchanged
 * ------------------------------------------------------------------ */
includes("rpc('cs_portal_field_home', { p_token: ticket })",
  'production boot must still validate the ticket server-side');
includes("rpc('cs_portal_field_submit'", 'the production submit path must still exist');
includes('var ticket = DEMO ? null : (urlTicket || loadTicket());',
  'demo mode must still refuse any real or cached ticket');
includes("['WEBHOOK_REPORT', 'WEBHOOK_TRANSPORT', 'WEBHOOK_INSPECTION', 'WEBHOOK_DAILY_LOG', 'WEBHOOK_RENTAL']",
  'demo mode must still blank every webhook URL');
includes("if (!NG.ticket) {", 'production submit must still require a ticket');
// The Toolbox Talk walkthrough is only reachable in the demo build.
assert.ok(moduleCode.includes('DEMO') || html.includes("if (key === 'toolbox')"),
  'the walkthrough must hang off the demo landing screen');

/* ------------------------------------------------------------------ *
 * 15. The file still parses
 * ------------------------------------------------------------------ */
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((m) => m[1]).filter((s) => s.trim());
for (const [i, s] of inlineScripts.entries()) {
  assert.doesNotThrow(() => new Function(s), `Inline script ${i + 1} has invalid JavaScript`);
}

console.log('Toolbox Talk mobile verification passed ' +
  `(3 talks, ${totalPages} rendered pages, both completion paths, ` +
  `${inlineScripts.length} inline scripts parsed).`);
