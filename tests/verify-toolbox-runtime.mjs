/* Toolbox Talks — mobile demo, driven in a real browser at phone width.
 *
 * verify-toolbox-mobile.mjs checks the source and the assets on disk. This one
 * drives the rendered page: it walks the three steps, pages through the talk,
 * proves the completion gate and the contrast, and watches the network.
 *
 * Requires the gstack browse helper. Skips cleanly when it is not built, so
 * the suite still runs on a machine without it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(new URL('../', import.meta.url).pathname);
// Greiner no longer shows a workflow selector (lead/participant roles instead;
// covered by verify-jha-runtime.mjs). The shared selector machinery still runs
// for Choice, so this suite drives it there.
const BASE_PAGE = `file://${ROOT}/index.html?demo=1`;
const PAGE = `${BASE_PAGE}&company=choice`;

const BROWSE = [
  path.join(ROOT, '.claude/skills/gstack/browse/dist/browse'),
  path.join(os.homedir(), '.claude/skills/gstack/browse/dist/browse'),
].find((p) => fs.existsSync(p));

if (!BROWSE) {
  console.log('Toolbox Talk runtime verification skipped (gstack browse not built).');
  process.exit(0);
}

const run = (...args) =>
  execFileSync(BROWSE, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// The browse `js` command evaluates an expression, so every snippet is an IIFE.
const js = (expr) => {
  const out = run('js', `(function(){${expr}})()`);
  const line = out.split('\n').filter(Boolean).pop() || '';
  try { return JSON.parse(line); } catch { return line; }
};
const goto = (url) => run('goto', url);

const openWalkthrough = () => {
  goto(PAGE);
  js(`try{localStorage.removeItem('cs_tbt_mobile_demo_v1');}catch(e){} return 'ok';`);
  goto(PAGE);
  return js(`
    var b=null;
    Array.prototype.forEach.call(document.querySelectorAll('[data-demoform]'),function(x){
      if(/Toolbox/.test(x.textContent)) b=x; });
    if(!b) return JSON.stringify({opened:false});
    b.click();
    return JSON.stringify({opened:true, view:(document.querySelector('.view.active')||{}).id});
  `);
};

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${name}\n       ${e.message}`); }
};

try {
  run('viewport', '390x844');
  const size = js(`return window.innerWidth+'x'+window.innerHeight;`);
  assert.equal(size, '390x844', 'viewport must be phone width');

  /* 1. Toolbox Talks is on the demo homepage, no ngform needed */
  goto(PAGE);
  const home = js(`return JSON.stringify({
    view:(document.querySelector('.view.active')||{}).id,
    tiles:Array.prototype.map.call(document.querySelectorAll('[data-demoform]'),
      function(b){return b.textContent.trim();})
  });`);
  check('Toolbox Talks appears on the demo homepage', () => {
    assert.equal(home.view, 'landingView', 'the demo must open on the homepage');
    assert.ok(home.tiles.some((t) => /^Toolbox Talk/.test(t)),
      `no Toolbox Talk tile among: ${home.tiles.join(' | ')}`);
    for (const want of ['Complete New JHA', 'Revise Submitted JHA', 'Hot Work Permit']) {
      assert.ok(home.tiles.some((t) => t.includes(want)), `missing tile: ${want}`);
    }
  });

  /* 2. Both workflow options are visible on step 1 */
  const opened = openWalkthrough();
  const step1 = js(`return JSON.stringify({
    steps:Array.prototype.map.call(document.querySelectorAll('[data-tbt-step]'),
      function(s){return s.textContent.replace(/\\s+/g,' ').trim();}),
    active:(document.querySelector('.tbt-step.is-on')||{}).textContent.replace(/\\s+/g,' ').trim(),
    options:Array.prototype.map.call(document.querySelectorAll('[data-tbt-method]'),
      function(o){return o.querySelector('.t').textContent;}),
    notice:(document.getElementById('tbtNotice')||{textContent:''}).textContent
  });`);
  check('both workflow options are visible', () => {
    assert.equal(opened.opened, true, 'the tile must open the walkthrough');
    assert.deepEqual(step1.steps, ['Choose Method', 'Review Talk', 'Record Completion']);
    assert.equal(step1.active, 'Choose Method', 'it must open on step 1');
    assert.deepEqual(step1.options,
      ['Foreman Leads Group Talk', 'Each Employee Completes Individually']);
    assert.match(step1.notice, /Demo only/, 'the demo notice must be visible');
  });

  /* 3. Choosing a method advances to the talk */
  const step2 = js(`
    document.querySelector('[data-tbt-method="group"]').click();
    return JSON.stringify({
      active:(document.querySelector('.tbt-step.is-on')||{}).textContent.replace(/\\s+/g,' ').trim(),
      title:(document.querySelector('.tbt-doc-title')||{}).textContent,
      sub:(document.querySelector('.tbt-doc-sub')||{}).textContent,
      count:(document.getElementById('tbtPageCount')||{}).textContent,
      contDisabled:document.getElementById('tbtToComplete').disabled
    });`);
  check('the actual talk content is displayed', () => {
    assert.equal(step2.active, 'Review Talk');
    assert.equal(step2.title, 'Fall Protection', 'the real talk title must show');
    assert.match(step2.sub, /Fall Protection\.pdf/, 'the original filename must show');
    assert.equal(step2.count, 'Page 1 of 2');
  });

  /* 4. Page images really load */
  const img = js(`var i=document.getElementById('tbtPageImg');
    return JSON.stringify({src:i.getAttribute('src'),w:i.naturalWidth,h:i.naturalHeight});`);
  check('source files resolve and render', () => {
    assert.match(img.src, /^demo-assets\/toolbox-talks\//, 'pages must load from relative assets');
    assert.ok(img.w > 0 && img.h > 0, `page image failed to load: ${img.src}`);
  });

  /* 5. Completion is gated until the last page */
  check('completion is disabled until the talk is read', () => {
    assert.equal(step2.contDisabled, true, 'Continue must start disabled');
    const blocked = js(`document.getElementById('tbtToComplete').click();
      return JSON.stringify({active:(document.querySelector('.tbt-step.is-on')||{}).textContent.replace(/\\s+/g,' ').trim()});`);
    assert.equal(blocked.active, 'Review Talk', 'clicking a disabled Continue must not advance');
  });

  /* 6. Every page is reachable */
  js(`document.getElementById('tbtNext').click(); return 'ok';`);
  // The swapped-in image needs a moment to decode before naturalWidth is real.
  const imgLoaded = () => js(`var i=document.getElementById('tbtPageImg');
    return JSON.stringify({complete:i.complete, w:i.naturalWidth});`);
  for (let i = 0; i < 40 && !(imgLoaded().w > 0); i++) {
    execFileSync('sleep', ['0.1']);
  }
  const paged = js(`
    return JSON.stringify({
      count:document.getElementById('tbtPageCount').textContent,
      src:document.getElementById('tbtPageImg').getAttribute('src'),
      w:document.getElementById('tbtPageImg').naturalWidth,
      prev:document.getElementById('tbtPrev').disabled,
      next:document.getElementById('tbtNext').disabled,
      cont:document.getElementById('tbtToComplete').disabled
    });`);
  check('all document pages are reachable', () => {
    assert.equal(paged.count, 'Page 2 of 2', 'Next must advance the page');
    assert.ok(paged.w > 0, `page 2 image failed to load: ${paged.src}`);
    assert.equal(paged.prev, false, 'Previous must be enabled after page 1');
    assert.equal(paged.next, true, 'Next must be disabled on the last page');
    assert.equal(paged.cont, false, 'Continue must unlock on the last page');
  });

  /* 7-9. Group completion: no search, roster visible, manual entry */
  const group = js(`
    document.getElementById('tbtToComplete').click();
    return JSON.stringify({
      active:(document.querySelector('.tbt-step.is-on')||{}).textContent.replace(/\\s+/g,' ').trim(),
      hasSearch:!!document.getElementById('tbtSearch'),
      roster:Array.prototype.map.call(document.querySelectorAll('[data-tbt-att]'),
        function(b){return b.getAttribute('data-tbt-att');}),
      rosterVisible:Array.prototype.every.call(document.querySelectorAll('[data-tbt-att]'),
        function(b){var r=b.getBoundingClientRect();return r.width>0&&r.height>0;}),
      selectAll:!!document.getElementById('tbtAll'),
      clear:!!document.getElementById('tbtNone'),
      count:document.getElementById('tbtCount').textContent
    });`);
  check('the employee search field is absent', () => {
    assert.equal(group.active, 'Record Completion');
    assert.equal(group.hasSearch, false, 'the search field must be gone');
  });
  check('the roster is visible directly', () => {
    assert.ok(group.roster.length >= 4, `expected a visible roster, got ${group.roster.length}`);
    assert.equal(group.rosterVisible, true, 'every roster row must be rendered and visible');
    assert.ok(group.selectAll && group.clear, 'Select All Assigned and Clear must be present');
    assert.equal(group.count, '(0 selected)');
  });

  const manual = js(`
    var r=document.querySelectorAll('[data-tbt-att]'); r[0].click(); r[1].click();
    var afterPick=document.getElementById('tbtCount').textContent;
    var m=document.getElementById('tbtManual'); m.value='Temp Helper (Labor Ready)';
    document.getElementById('tbtManualAdd').click();
    var afterAdd=document.getElementById('tbtCount').textContent;
    var m2=document.getElementById('tbtManual'); m2.value='Temp Helper (Labor Ready)';
    document.getElementById('tbtManualAdd').click();
    return JSON.stringify({
      afterPick:afterPick, afterAdd:afterAdd,
      afterDup:document.getElementById('tbtCount').textContent,
      pills:document.querySelectorAll('.tbt-manualpill').length,
      tag:(document.querySelector('.tbt-manualpill .tag')||{}).textContent
    });`);
  check('manual attendee entry works', () => {
    assert.equal(manual.afterPick, '(2 selected)', 'tapping rows must select them');
    assert.equal(manual.afterAdd, '(3 selected)', 'a manual name must join the count');
    assert.equal(manual.afterDup, '(3 selected)', 'a duplicate manual name must be ignored');
    assert.equal(manual.pills, 1, 'exactly one manual pill');
    assert.equal(manual.tag, 'MANUAL ENTRY', 'manual names must be flagged');
  });

  /* 10. Back navigation walks the three steps */
  check('back navigation follows the three-step flow', () => {
    const b1 = js(`document.getElementById('tbtBack').click();
      return JSON.stringify({active:(document.querySelector('.tbt-step.is-on')||{}).textContent.replace(/\\s+/g,' ').trim(),
        view:(document.querySelector('.view.active')||{}).id});`);
    assert.equal(b1.active, 'Review Talk', 'completion must go back to Review Talk');
    const b2 = js(`document.getElementById('tbtBack').click();
      return JSON.stringify({active:(document.querySelector('.tbt-step.is-on')||{}).textContent.replace(/\\s+/g,' ').trim(),
        view:(document.querySelector('.view.active')||{}).id});`);
    assert.equal(b2.active, 'Choose Method', 'Review Talk must go back to Choose Method');
    const b3 = js(`document.getElementById('tbtBack').click();
      return JSON.stringify({view:(document.querySelector('.view.active')||{}).id});`);
    assert.equal(b3.view, 'landingView', 'Choose Method must go back to the homepage');
  });

  /* 11. Switching workflows mid-demo, no URL change */
  check('switching between the two options works', () => {
    openWalkthrough();
    const toGroup = js(`document.querySelector('[data-tbt-method="group"]').click();
      return JSON.stringify({hasSwitch:!!document.getElementById('tbtChangeMethod')});`);
    assert.equal(toGroup.hasSwitch, true, 'the review step must offer a workflow switch');
    const back = js(`document.getElementById('tbtChangeMethod').click();
      return JSON.stringify({active:(document.querySelector('.tbt-step.is-on')||{}).textContent.replace(/\\s+/g,' ').trim()});`);
    assert.equal(back.active, 'Choose Method', 'the switch must return to the chooser');
    const toInd = js(`
      document.querySelector('[data-tbt-method="individual"]').click();
      document.getElementById('tbtNext').click();
      document.getElementById('tbtToComplete').click();
      return JSON.stringify({
        individual:!!document.getElementById('tbtSubmitInd'),
        group:!!document.getElementById('tbtSubmitGroup'),
        me:(document.getElementById('tbtMe')||{}).value,
        readonly:(document.getElementById('tbtMe')||{}).readOnly,
        job:(document.getElementById('tbtMyJob')||{}).value
      });`);
    assert.equal(toInd.individual, true, 'the individual form must render after switching');
    assert.equal(toInd.group, false, 'the group form must not render in individual mode');
    assert.ok(toInd.me, 'the individual must be named from the signed-in profile');
    assert.equal(toInd.readonly, true, 'the identity must not be editable');
    assert.ok(toInd.job, 'the job assignment must be shown');
  });

  /* 12. Contrast meets WCAG AA, and nothing overflows the phone width */
  check('text and button contrast meet accessible minimums', () => {
    const report = js(`
      function toRgb(s){var m=s.match(/rgba?\\(([^)]+)\\)/);if(!m)return null;
        var p=m[1].split(',').map(parseFloat);
        return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};}
      function effBg(el){var e=el;
        while(e&&e!==document.documentElement){
          var c=toRgb(getComputedStyle(e).backgroundColor);
          if(c&&c.a>0.95)return c; e=e.parentElement;}
        return {r:5,g:10,b:32,a:1};}
      function lum(c){var f=['r','g','b'].map(function(k){var v=c[k]/255;
        return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
        return 0.2126*f[0]+0.7152*f[1]+0.0722*f[2];}
      function ratio(a,b){var L1=lum(a),L2=lum(b),hi=Math.max(L1,L2),lo=Math.min(L1,L2);
        return (hi+0.05)/(lo+0.05);}
      var sel=['.tbt-doc-title','.tbt-doc-sub','#tbtPageCount','.tbt-pagebtn','#tbtBack',
               '.form-title','.tbt-step.is-on','.tbt-step','#tbtNotice','.tbt-rosterrow',
               '.tbt-optcard .t','.tbt-optcard .d'];
      var bad=[];
      sel.forEach(function(s){
        var el=document.querySelector(s); if(!el)return;
        var cs=getComputedStyle(el), fg=toRgb(cs.color), bg=effBg(el);
        if(!fg)return;
        var size=parseFloat(cs.fontSize), bold=(parseInt(cs.fontWeight,10)||400)>=700;
        var need=(size>=24||(size>=18.66&&bold))?3:4.5;
        var r=ratio(fg,bg);
        if(r<need) bad.push(s+' '+Math.round(r*100)/100+':1 (needs '+need+')');
      });
      var de=document.documentElement;
      return JSON.stringify({bad:bad, overflow:de.scrollWidth>de.clientWidth,
        scrollW:de.scrollWidth, clientW:de.clientWidth});`);
    assert.deepEqual(report.bad, [], `low-contrast text: ${report.bad.join('; ')}`);
    assert.equal(report.overflow, false,
      `content overflows the phone width (${report.scrollW} > ${report.clientW})`);
  });

  /* 14. Guided Talk: the second content format */
  check('the PDF walkthrough still works unchanged', () => {
    openWalkthrough();
    const doc = js(`
      document.querySelector('[data-tbt-method="group"]').click();
      return JSON.stringify({
        formats:Array.prototype.map.call(document.querySelectorAll('[data-tbt-format]'),
          function(f){return f.textContent.trim()+(f.className.indexOf('is-on')>-1?'*':'');}),
        hasImg:!!document.getElementById('tbtPageImg'),
        count:(document.getElementById('tbtPageCount')||{}).textContent,
        cont:document.getElementById('tbtToComplete').disabled
      });`);
    assert.deepEqual(doc.formats, ['View Original Document*', 'Guided Talk'],
      'the document format must still be the default');
    assert.equal(doc.hasImg, true, 'the PDF pages must still render');
    assert.equal(doc.count, 'Page 1 of 2', 'the PDF pager must still work');
    assert.equal(doc.cont, true, 'the PDF gate must still start locked');
  });

  check('Guided Talk shows verbatim sections with their source page', () => {
    const g = js(`
      document.querySelector('[data-tbt-format="guided"]').click();
      return JSON.stringify({
        count:document.getElementById('tbtSecCount').textContent,
        heading:document.querySelector('.tbt-sec-h').textContent,
        body:Array.prototype.map.call(document.querySelectorAll('.tbt-sec-b'),
          function(p){return p.textContent;}),
        src:document.querySelector('.tbt-sec-src').textContent,
        sub:document.querySelector('.tbt-doc-sub').textContent,
        check:document.querySelector('.tbt-sec-check span').textContent,
        prog:document.querySelector('.tbt-secprog .lbl').textContent,
        cont:document.getElementById('tbtToComplete').disabled,
        note:(document.getElementById('tbtFmtNote')||{textContent:''}).textContent
      });`);
    assert.equal(g.count, 'Section 1 of 8', 'the guided view must show section progress');
    assert.equal(g.heading, 'Fall Protection', 'the first section heading comes from the PDF');
    assert.ok(g.body.join(' ').includes('falls remain one of the top causes of fatalities'),
      'the section must carry the original wording');
    assert.equal(g.src, 'From Fall Protection.pdf, page 1',
      'each section must name its source file and page');
    assert.match(g.sub, /Fall Protection\.pdf · page 1/, 'the header must cite the source page');
    assert.equal(g.check, 'This section was covered', 'group wording on the checkbox');
    assert.equal(g.prog, '0 of 8 sections checked', 'progress starts empty');
    assert.equal(g.cont, true, 'completion starts locked');
    assert.match(g.note, /demo only/i, 'the format selector must carry its demo-only note');
  });

  check('every guided section is reachable and cites a real page', () => {
    const walk = js(`
      while(!document.getElementById('tbtSecPrev').disabled)
        document.getElementById('tbtSecPrev').click();
      var out=[];
      for(var i=0;i<20;i++){
        out.push({n:document.getElementById('tbtSecCount').textContent,
                  h:document.querySelector('.tbt-sec-h').textContent,
                  src:document.querySelector('.tbt-sec-src').textContent,
                  paras:document.querySelectorAll('.tbt-sec-b').length});
        if(document.getElementById('tbtSecNext').disabled) break;
        document.getElementById('tbtSecNext').click();
      }
      return JSON.stringify(out);`);
    assert.equal(walk.length, 8, `expected 8 reachable sections, got ${walk.length}`);
    walk.forEach((s, i) => {
      assert.equal(s.n, `Section ${i + 1} of 8`, `section ${i + 1} mislabelled: ${s.n}`);
      assert.ok(s.h, `section ${i + 1} has no heading`);
      assert.ok(s.paras > 0, `section ${i + 1} has no content`);
      assert.match(s.src, /^From Fall Protection\.pdf, pages? \d/,
        `section ${i + 1} does not cite its source page: ${s.src}`);
    });
    // The section that runs over the page break must say so.
    assert.ok(walk.some((s) => /pages 1–2/.test(s.src)),
      'the section spanning the page break must cite both pages');
  });

  check('checked progress is preserved while navigating', () => {
    const p = js(`
      while(!document.getElementById('tbtSecPrev').disabled)
        document.getElementById('tbtSecPrev').click();
      document.getElementById('tbtSecDone').click();          // tick section 1
      var afterTick=document.querySelector('.tbt-secprog .lbl').textContent;
      document.getElementById('tbtSecNext').click();           // section 2
      var s2=document.getElementById('tbtSecDone').checked;
      document.getElementById('tbtSecPrev').click();           // back to 1
      var s1=document.getElementById('tbtSecDone').checked;
      return JSON.stringify({afterTick:afterTick, section2Unchecked:s2, section1StillChecked:s1});`);
    assert.equal(p.afterTick, '1 of 8 sections checked', 'ticking must move progress');
    assert.equal(p.section2Unchecked, false, 'a tick must not leak to other sections');
    assert.equal(p.section1StillChecked, true, 'a tick must survive navigating away and back');
  });

  check('completion stays locked until every section is checked', () => {
    const partial = js(`
      while(!document.getElementById('tbtSecPrev').disabled)
        document.getElementById('tbtSecPrev').click();
      // tick all but the last
      for(var i=0;i<7;i++){
        if(!document.getElementById('tbtSecDone').checked)
          document.getElementById('tbtSecDone').click();
        document.getElementById('tbtSecNext').click();
      }
      return JSON.stringify({prog:document.querySelector('.tbt-secprog .lbl').textContent,
                             cont:document.getElementById('tbtToComplete').disabled});`);
    assert.equal(partial.prog, '7 of 8 sections checked');
    assert.equal(partial.cont, true, '7 of 8 must still be locked');
    const blocked = js(`document.getElementById('tbtToComplete').click();
      return JSON.stringify({step:(document.querySelector('.tbt-step.is-on')||{}).textContent.replace(/\s+/g,' ').trim()});`);
    assert.equal(blocked.step, 'Review Talk', 'a locked Continue must not advance');
    const full = js(`
      if(!document.getElementById('tbtSecDone').checked)
        document.getElementById('tbtSecDone').click();
      return JSON.stringify({prog:document.querySelector('.tbt-secprog .lbl').textContent,
                             cont:document.getElementById('tbtToComplete').disabled});`);
    assert.equal(full.prog, '8 of 8 sections checked');
    assert.equal(full.cont, false, 'all 8 checked must unlock completion');
  });

  check('Guided Talk leads into group completion', () => {
    const grp = js(`document.getElementById('tbtToComplete').click();
      return JSON.stringify({
        step:(document.querySelector('.tbt-step.is-on')||{}).textContent.replace(/\s+/g,' ').trim(),
        roster:document.querySelectorAll('[data-tbt-att]').length,
        submit:(document.getElementById('tbtSubmitGroup')||{}).textContent});`);
    assert.equal(grp.step, 'Record Completion');
    assert.ok(grp.roster > 0, 'the group roster must render after a guided talk');
    assert.equal(grp.submit, 'Submit Group Toolbox Talk');
  });

  check('Guided Talk leads into individual completion, with its own wording', () => {
    goto(`${BASE_PAGE}&company=peine`);
    js(`try{localStorage.removeItem('cs_tbt_mobile_demo_v1');}catch(e){} return 'ok';`);
    goto(`${BASE_PAGE}&company=peine`);
    const ind = js(`
      var b=null;
      Array.prototype.forEach.call(document.querySelectorAll('[data-demoform]'),function(x){
        if(/Toolbox/.test(x.textContent)) b=x; });
      b.click();
      document.querySelector('[data-tbt-method="individual"]').click();
      document.querySelector('[data-tbt-format="guided"]').click();
      return JSON.stringify({check:document.querySelector('.tbt-sec-check span').textContent,
                             count:document.getElementById('tbtSecCount').textContent});`);
    assert.equal(ind.check, 'I reviewed this section',
      'individual mode must reword the section checkbox');
    assert.equal(ind.count, 'Section 1 of 8');
    const done = js(`
      for(var i=0;i<8;i++){
        if(!document.getElementById('tbtSecDone').checked)
          document.getElementById('tbtSecDone').click();
        if(!document.getElementById('tbtSecNext').disabled)
          document.getElementById('tbtSecNext').click();
      }
      document.getElementById('tbtToComplete').click();
      return JSON.stringify({
        step:(document.querySelector('.tbt-step.is-on')||{}).textContent.replace(/\s+/g,' ').trim(),
        me:(document.getElementById('tbtMe')||{}).value,
        submit:(document.getElementById('tbtSubmitInd')||{}).textContent});`);
    assert.equal(done.step, 'Record Completion');
    assert.ok(done.me, 'the individual must be named');
    assert.equal(done.submit, 'Submit My Completion');
  });

  check('switching format keeps each format progress', () => {
    const kept = js(`
      document.getElementById('tbtBack').click();               // back to Review Talk
      var onGuided=!!document.getElementById('tbtSecCount');
      var progBefore=document.querySelector('.tbt-secprog .lbl').textContent;
      document.querySelector('[data-tbt-format="doc"]').click();
      var onDoc=!!document.getElementById('tbtPageImg');
      document.querySelector('[data-tbt-format="guided"]').click();
      return JSON.stringify({onGuided:onGuided, onDoc:onDoc, progBefore:progBefore,
        progAfter:document.querySelector('.tbt-secprog .lbl').textContent});`);
    assert.equal(kept.onGuided, true, 'Back must return to the guided format it left');
    assert.equal(kept.onDoc, true, 'the document format must still open');
    assert.equal(kept.progAfter, kept.progBefore,
      'guided progress must survive a trip through the document format');
  });

  /* 13. A real submission makes zero network requests */
  check('demo submissions make zero network requests', () => {
    openWalkthrough();
    js(`
      window.__net=[];
      var of=window.fetch;
      window.fetch=function(){window.__net.push('fetch');return of.apply(window,arguments);};
      var ox=XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open=function(m,u){window.__net.push('xhr '+u);return ox.apply(this,arguments);};
      if(navigator.sendBeacon){var ob=navigator.sendBeacon;
        navigator.sendBeacon=function(u){window.__net.push('beacon '+u);return ob.apply(navigator,arguments);};}
      return 'ok';`);
    const done = js(`
      document.querySelector('[data-tbt-method="group"]').click();
      document.getElementById('tbtNext').click();
      document.getElementById('tbtToComplete').click();
      document.getElementById('tbtAll').click();
      document.getElementById('tbtPresented').click();
      document.getElementById('tbtSubmitGroup').click();
      var saved=null;
      try{saved=JSON.parse(localStorage.getItem('cs_tbt_mobile_demo_v1'));}catch(e){}
      return JSON.stringify({
        recorded:!!document.getElementById('tbtDoneNotice'),
        notice:(document.getElementById('tbtDoneNotice')||{textContent:''}).textContent,
        records:saved?saved.records.length:0,
        net:window.__net
      });`);
    assert.equal(done.recorded, true, 'the submission must reach the confirmation');
    assert.match(done.notice, /No production data was saved/,
      'the confirmation must say nothing was saved');
    assert.equal(done.records, 1, 'the record stays in localStorage only');
    assert.deepEqual(done.net, [], `demo submit made network calls: ${JSON.stringify(done.net)}`);
  });
} finally {
  try { run('stop'); } catch { /* leave the browser alone if it is already gone */ }
}

if (failures) {
  console.error(`\nToolbox Talk runtime verification FAILED (${failures} check(s)).`);
  process.exit(1);
}
console.log('Toolbox Talk runtime verification passed (21 checks, phone width 390x844).');
