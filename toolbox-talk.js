/* Toolbox Talk — one implementation for the phone, used by both
 *   /phone/        a safe preview (no client, no network, nothing recorded)
 *   /field/#token  a real recipient's assigned talk
 *
 * The flow, layout and wording are the Greiner Toolbox Talk's (greiner-QR
 * index.html, "TOOLBOX TALKS — mobile demo"): View Original Document or Guided
 * Talk over the same source, section-by-section progress, the completion
 * statement, and a confirmation of what was recorded. What differs per company
 * is only the data the page hands in: the talk, the recipient, their role and
 * the server calls.
 *
 * The office decides who leads. A real recipient never chooses: they are a
 * participant unless the page is told role: 'leader', in which case they get the
 * Greiner foreman-led group form (pick who attended, add anyone missing, confirm
 * they presented, submit once). Only the /phone/ preview passes chooseMethod, to
 * show both workflows side by side while Peine decides which one it uses.
 *
 *   var talk = ToolboxTalk.mount(el, {
 *     talk: { title, filename, weekStart: 'YYYY-MM-DD', pages: [{src,w,h}], sections },
 *     company, employeeName, role: 'participant' | 'leader',
 *     roster: [{n: name, g: group}] (who the leader can mark present), groups: [names],
 *     chooseMethod: bool (preview only: start on Greiner's Choose Method step),
 *     defaultFormat: 'doc' | 'guided' | 'both', preview: bool,
 *     pinRequired: bool, verifyPin(pin) -> Promise<{verified, locked, locked_until, attempts_remaining}>,
 *     submit({format, activeMs, sectionsViewed, sectionsTotal, role}) -> Promise<{submitted_at, active_ms} | null>,
 *     progress({activeMs, sectionsViewed, format}), onLocked(until)
 *   });
 */
(function (root) {
  'use strict';

  var PARTICIPANT_STATEMENT = 'I reviewed the complete Toolbox Talk and understand it.';
  var LEADER_STATEMENT = 'I presented this Toolbox Talk to the people listed above.';
  var TZ = 'America/Indiana/Indianapolis';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtWhen(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', month: 'short',
      day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function fmtWeek(ymd) {
    if (!ymd) return '';
    var p = String(ymd).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2], 12).toLocaleDateString('en-US',
      { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  }
  function fmtDuration(ms) {
    var s = Math.max(0, Math.round((ms || 0) / 1000)), m = Math.floor(s / 60);
    return m ? m + ' min ' + (s % 60) + ' sec' : s + ' sec';
  }

  /* Two section shapes reach this code: Greiner's verbatim sections
     ({h, p: [...], pgl}, a paragraph starting "*" is a bullet) and Peine's stored
     guided_sections ({h, b: [...] | "text"}, an array is a bullet list). Both
     render the same way; nothing is rewritten. */
  function normalizeSections(list) {
    return (list || []).map(function (s, i) {
      var paras;
      if (Array.isArray(s.p)) {
        paras = s.p.map(function (t) {
          return /^\*/.test(t) ? { text: t.replace(/^\*\s*/, ''), bullet: true } : { text: t, bullet: false };
        });
      } else if (Array.isArray(s.b)) {
        paras = s.b.map(function (t) { return { text: t, bullet: true }; });
      } else {
        paras = [{ text: s.b || s.text || '', bullet: false }];
      }
      return { h: s.h || ('Section ' + (i + 1)), paras: paras, src: s.pgl || '' };
    });
  }

  function mount(el, o) {
    o = o || {};
    var talk = o.talk || {};
    var pages = talk.pages || [];
    var sections = normalizeSections(talk.sections);
    var leader = o.role === 'leader';
    var roster = (o.roster || []).map(function (p) { return typeof p === 'string' ? { n: p, g: '' } : p; });
    var groups = (o.groups && o.groups.length) ? o.groups
      : roster.reduce(function (a, p) { if (p.g && a.indexOf(p.g) === -1) a.push(p.g); return a; }, []);
    var S = {
      step: o.chooseMethod && !o.role ? 'method' : 'review',
      grp: { group: groups[0] || '', presenter: o.employeeName || '', attendees: [], manual: [], presented: false },
      format: (o.defaultFormat === 'guided' && sections.length) || !pages.length ? 'guided' : 'doc',
      page: 0, read: false, sec: 0, done: [],
      ack: false, presented: false, pinOk: !o.pinRequired, finished: false
    };
    if (!sections.length && pages.length) S.format = 'doc';

    /* ---------------- active time: counted only while visible ---------------- */
    var eng = { ms: 0, t0: null, timer: null };
    function startEng() {
      if (eng.t0 !== null || S.finished || document.hidden) return;
      eng.t0 = Date.now();
      eng.timer = setInterval(ping, 15000);
    }
    function stopEng() {
      if (eng.t0 !== null) { eng.ms += Date.now() - eng.t0; eng.t0 = null; }
      if (eng.timer) { clearInterval(eng.timer); eng.timer = null; }
    }
    function activeMs() { return eng.ms + (eng.t0 === null ? 0 : Date.now() - eng.t0); }
    function sectionsDone() { return S.done.filter(Boolean).length; }
    function ping() {
      if (S.finished || typeof o.progress !== 'function') return;
      o.progress({ activeMs: Math.min(activeMs(), 86400000), sectionsViewed: sectionsDone(), format: S.format });
    }
    function onVis() { if (document.hidden) { stopEng(); ping(); } else startEng(); }
    function onHide() { stopEng(); ping(); }
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);

    /* Whichever format is on screen decides whether completion is unlocked. */
    function allSectionsDone() {
      if (!sections.length) return false;
      for (var i = 0; i < sections.length; i++) if (!S.done[i]) return false;
      return true;
    }
    function reviewed() { return S.format === 'guided' ? allSectionsDone() : (pages.length > 0 && S.read); }

    /* ---------------- shell ---------------- */
    function shell(bodyHtml) {
      var steps = [['review', 'Review Talk'], ['complete', 'Record Completion']];
      if (o.chooseMethod) steps.unshift(['method', 'Choose Method']);
      var order = steps.map(function (x) { return x[0]; });
      var at = S.step === 'done' ? steps.length : order.indexOf(S.step);
      el.innerHTML =
        '<div class="tbt-brand">' + esc(o.company || '') + '</div>' +
        '<h2 class="form-title">Toolbox Talk</h2>' +
        '<p class="tbt-week">' + esc(talk.title) + (talk.weekStart ? ' · week of ' + esc(fmtWeek(talk.weekStart)) : '') + '</p>' +
        (o.preview ? '<div class="tbt-notice" id="tbtPreviewNotice"><span>&#9888;</span><span>Preview — a sample talk ' +
          'and a sample name. Nothing is recorded and nothing is sent.</span></div>' : '') +
        '<div class="tbt-steps">' + steps.map(function (s, i) {
          return '<div class="tbt-step' + (i === at ? ' is-on' : (i < at ? ' is-done' : '')) + '">' + esc(s[1]) + '</div>';
        }).join('') + '</div>' +
        '<div id="tbtBody">' + bodyHtml + '</div>';
    }
    function $(id) { return document.getElementById(id); }

    /* ---------------- preview only: choose the workflow to show ---------------- */
    function renderMethod() {
      var ICON = {
        group: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/>' +
          '<circle cx="17" cy="9" r="2.6"/><path d="M16.5 13.6c2.6.2 4.5 2.1 4.5 4.9"/></svg>',
        individual: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5"/></svg>'
      };
      function card(key, title, desc, meta) {
        return '<button type="button" class="tbt-choice' + (S.method === key ? ' is-on' : '') + '" data-tbt-method="' + key + '">' +
          '<span class="ic">' + ICON[key] + '</span>' +
          '<span class="tx"><span class="t">' + esc(title) + '</span>' +
            '<span class="d">' + esc(desc) + '</span>' +
            '<span class="m">' + esc(meta) + '</span></span>' +
          '<span class="go" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"><path d="M9 6l6 6-6 6"/></svg></span></button>';
      }
      shell(
        '<p class="tbt-choice-lead">Choose which completion workflow to preview.</p>' +
        '<div class="tbt-choices">' +
          card('group', 'Foreman Leads Group Talk',
            'One foreman presents the talk, selects everyone who attended, adds any missing names, and submits once for the group.',
            '1 submission per crew') +
          card('individual', 'Each Employee Completes Individually',
            'Every employee reviews the same talk and submits their own acknowledgment.', '1 submission per employee') +
        '</div>' +
        '<p class="tbt-note">Preview only. In production the office sets this for each talk; employees never choose.</p>');
      Array.prototype.forEach.call(el.querySelectorAll('[data-tbt-method]'), function (b) {
        b.onclick = function () {
          S.method = b.getAttribute('data-tbt-method');
          leader = S.method === 'group';
          S.page = 0; S.read = false; S.sec = 0; S.done = []; S.ack = false;
          S.grp = { group: groups[0] || '', presenter: leader ? (o.leaderName || o.employeeName || '') : '', attendees: [], manual: [], presented: false };
          S.step = 'review'; render();
        };
      });
    }
    function switchHtml() {
      return o.chooseMethod ? '<button type="button" class="back-button" id="tbtChangeMethod">Switch preview workflow</button>' : '';
    }

    /* ---------------- STEP 1: review the talk ---------------- */
    function formatBar() {
      return '<div class="tbt-fmt">' +
        '<button type="button" class="tbt-fmtbtn' + (S.format === 'doc' ? ' is-on' : '') +
          '" data-tbt-format="doc">View Original Document</button>' +
        '<button type="button" class="tbt-fmtbtn' + (S.format === 'guided' ? ' is-on' : '') +
          '" data-tbt-format="guided">Guided Talk</button></div>';
    }
    function continueHtml(hint) {
      var ready = reviewed();
      return (ready || !hint ? '' : '<p class="tbt-hint" id="tbtHint">' + esc(hint) + '</p>') +
        '<button type="button" class="submit-button" id="tbtToComplete"' + (ready ? '' : ' disabled') +
        '>Continue to completion</button>' + switchHtml();
    }
    function wireReview() {
      Array.prototype.forEach.call(el.querySelectorAll('[data-tbt-format]'), function (b) {
        b.onclick = function () { S.format = b.getAttribute('data-tbt-format'); render(); };
      });
      var go = $('tbtToComplete');
      if (go) go.onclick = function () {
        if (!reviewed()) return;       // the button state is not trusted on its own
        S.step = 'complete'; render();
      };
      var sw = $('tbtChangeMethod');
      if (sw) sw.onclick = function () { S.step = 'method'; render(); };
    }
    function renderDoc() {
      var total = pages.length, body;
      if (!total) {
        body = formatBar() +
          '<div class="tbt-doc"><h3 class="tbt-doc-title">' + esc(talk.title) + '</h3>' +
            '<div class="tbt-doc-sub">' + esc(talk.filename || '') + '</div>' +
            '<p class="tbt-doc-empty" id="tbtNoOriginal">The original document for this talk has not been ' +
              'attached yet.' + (sections.length ? ' Use Guided Talk to review it.' : ' Ask your supervisor for a copy.') +
            '</p></div>';
        shell(body); wireReview(); return;
      }
      if (S.page >= total) S.page = total - 1;
      if (S.page < 0) S.page = 0;
      if (S.page === total - 1) S.read = true;
      var pg = pages[S.page];
      body = formatBar() +
        '<div class="tbt-doc">' +
          '<h3 class="tbt-doc-title">' + esc(talk.title) + '</h3>' +
          '<div class="tbt-doc-sub">' + esc(talk.filename || '') + (o.company ? ' · ' + esc(o.company) : '') + '</div>' +
          '<img class="tbt-page-img" id="tbtPageImg" alt="' + esc(talk.title) + ', page ' + (S.page + 1) +
            ' of ' + total + '" src="' + esc(pg.src) + '"' +
            (pg.w && pg.h ? ' width="' + pg.w + '" height="' + pg.h + '"' : '') + '>' +
          '<div class="tbt-pager">' +
            '<button type="button" class="tbt-pagebtn" id="tbtPrev"' + (S.page === 0 ? ' disabled' : '') + '>&larr; Previous</button>' +
            '<div class="count" id="tbtPageCount">Page ' + (S.page + 1) + ' of ' + total + '</div>' +
            '<button type="button" class="tbt-pagebtn" id="tbtNext"' + (S.page >= total - 1 ? ' disabled' : '') + '>Next &rarr;</button>' +
          '</div></div>' +
        continueHtml('Read to the last page before recording completion.');
      shell(body);
      $('tbtPrev').onclick = function () { if (S.page > 0) { S.page--; render(); } };
      $('tbtNext').onclick = function () { if (S.page < total - 1) { S.page++; render(); } };
      wireReview();
    }
    function renderGuided() {
      var total = sections.length, body;
      if (!total) {
        body = formatBar() +
          '<div class="tbt-doc"><h3 class="tbt-doc-title">' + esc(talk.title) + '</h3>' +
            '<p class="tbt-doc-empty">This talk has not been prepared as a Guided Talk yet. ' +
            'Use View Original Document.</p></div>';
        shell(body); wireReview(); return;
      }
      if (S.sec >= total) S.sec = total - 1;
      if (S.sec < 0) S.sec = 0;
      var s = sections[S.sec], done = !!S.done[S.sec], n = sectionsDone();
      // The wording differs by who is confirming, as in the Greiner talk.
      var checkLabel = leader ? 'This section was covered' : 'I reviewed this section';
      body = formatBar() +
        '<div class="tbt-doc">' +
          '<h3 class="tbt-doc-title">' + esc(talk.title) + '</h3>' +
          '<div class="tbt-doc-sub">' + esc(talk.filename || '') + (s.src ? ' · ' + esc(s.src) : '') +
            (o.company ? ' · ' + esc(o.company) : '') + '</div>' +
          '<div class="tbt-sec"><h4 class="tbt-sec-h">' + esc(s.h) + '</h4>' +
            s.paras.map(function (p) {
              return '<p class="tbt-sec-b' + (p.bullet ? ' tbt-sec-bullet' : '') + '">' + esc(p.text) + '</p>';
            }).join('') +
            (s.src ? '<div class="tbt-sec-src">From ' + esc(talk.filename || talk.title) + ', ' + esc(s.src) + '</div>' : '') +
          '</div>' +
          '<label class="tbt-sec-check' + (done ? ' is-on' : '') + '" for="tbtSecDone">' +
            '<input type="checkbox" id="tbtSecDone"' + (done ? ' checked' : '') + '>' +
            '<span>' + esc(checkLabel) + '</span></label>' +
          '<div class="tbt-pager">' +
            '<button type="button" class="tbt-pagebtn" id="tbtSecPrev"' + (S.sec === 0 ? ' disabled' : '') + '>&larr; Previous</button>' +
            '<div class="count" id="tbtSecCount">Section ' + (S.sec + 1) + ' of ' + total + '</div>' +
            '<button type="button" class="tbt-pagebtn" id="tbtSecNext"' + (S.sec >= total - 1 ? ' disabled' : '') + '>Next &rarr;</button>' +
          '</div></div>' +
        '<div class="tbt-secprog" id="tbtSecProg"><div class="bar"><span style="width:' +
          Math.round(n / total * 100) + '%"></span></div>' +
          '<div class="lbl">' + n + ' of ' + total + ' sections checked</div></div>' +
        continueHtml('Check every section before recording completion.');
      shell(body);
      $('tbtSecDone').onchange = function () { S.done[S.sec] = this.checked; render(); ping(); };
      $('tbtSecPrev').onclick = function () { if (S.sec > 0) { S.sec--; render(); } };
      $('tbtSecNext').onclick = function () { if (S.sec < total - 1) { S.sec++; render(); } };
      wireReview();
    }

    /* ---------------- STEP 2: record completion ---------------- */
    function renderComplete(err) {
      if (!reviewed()) { S.step = 'review'; render(); return; }
      if (leader) { renderGroup(err); return; }
      var body =
        '<div class="tbt-doc" style="padding:12px 14px">' +
          '<div class="tbt-doc-title" style="font-size:16px">' + esc(talk.title) + '</div>' +
          '<div class="tbt-doc-sub" style="margin-bottom:0">' + esc(o.company || '') +
            (o.company ? ' · ' : '') + 'Individual completion</div></div>' +
        '<div class="tbt-field"><label>Employee</label><div class="val" id="tbtMe">' + esc(o.employeeName || '') + '</div></div>' +
        '<label class="tbt-check"><input type="checkbox" id="tbtAck"' + (S.ack ? ' checked' : '') + '>' +
          '<span>' + esc(PARTICIPANT_STATEMENT) + '</span></label>' +
        '<p class="tbt-err" id="tbtErr" role="alert">' + esc(err || '') + '</p>' +
        '<button type="button" class="submit-button" id="tbtSubmit">Submit My Completion</button>' +
        (o.pinRequired && !S.pinOk ? '<p class="tbt-note">You will confirm with your 4-digit PIN on the next screen.</p>' : '') +
        '<button type="button" class="back-button" id="tbtBackToTalk">&larr; Back to the talk</button>';
      shell(body);
      $('tbtAck').onchange = function () { S.ack = this.checked; };
      $('tbtBackToTalk').onclick = function () { S.step = 'review'; render(); };
      $('tbtSubmit').onclick = function () {
        if (!S.ack) { $('tbtErr').textContent = 'Tick the box to confirm you reviewed the talk.'; return; }
        // The talk can be read without a PIN. Recording it cannot.
        if (o.pinRequired && !S.pinOk) { renderPin(); return; }
        send();
      };
    }

    /* The foreman-led group talk: Greiner's form. One submission for everyone
       the foreman marks as present, plus anyone typed in who is not on the list. */
    function renderGroup(err) {
      var G = S.grp;
      var list = roster.filter(function (p) { return !G.group || !p.g || p.g === G.group; });
      var picked = G.attendees.length + G.manual.length;
      var body =
        '<div class="tbt-doc" style="padding:12px 14px">' +
          '<div class="tbt-doc-title" style="font-size:16px">' + esc(talk.title) + '</div>' +
          '<div class="tbt-doc-sub" style="margin-bottom:0">' + esc(o.company || '') +
            (o.company ? ' · ' : '') + 'Foreman-led group talk</div></div>' +
        (groups.length ? '<div class="tbt-field"><label for="tbtGroupSel">Crew or meeting group</label>' +
          '<select class="tbt-input" id="tbtGroupSel">' + groups.map(function (g) {
            return '<option' + (g === G.group ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('') + '</select></div>' : '') +
        '<div class="tbt-field"><label for="tbtPresenter">Presenter</label>' +
          '<input type="text" class="tbt-input" id="tbtPresenter" value="' + esc(G.presenter) + '" placeholder="Who presented"></div>' +
        '<div class="tbt-field"><label>Attendees <span id="tbtCount">(' + picked + ' selected)</span></label>' +
          (list.length ? '<div class="tbt-row"><button type="button" class="tbt-btn2" id="tbtAll">Select All Assigned</button>' +
            '<button type="button" class="tbt-btn2" id="tbtNone">Clear</button></div>' +
            '<div class="tbt-rosterlist">' + list.map(function (p) {
              var on = G.attendees.indexOf(p.n) !== -1;
              return '<button type="button" class="tbt-rosterrow' + (on ? ' is-on' : '') + '" data-tbt-att="' + esc(p.n) +
                '" aria-pressed="' + (on ? 'true' : 'false') + '"><span class="box">' + (on ? '&#10003;' : '') + '</span>' +
                '<span>' + esc(p.n) + '</span></button>';
            }).join('') + '</div>'
            : '<p class="tbt-hint">No crew list is assigned yet. Add each person below.</p>') + '</div>' +
        '<div class="tbt-field"><label for="tbtManual">Add someone not listed</label>' +
          '<div class="tbt-row"><input type="text" class="tbt-input" id="tbtManual" placeholder="Type a name" style="flex:2">' +
          '<button type="button" class="tbt-btn2" id="tbtManualAdd">Add Name</button></div>' +
          (G.manual.length ? '<div>' + G.manual.map(function (n) {
            return '<span class="tbt-manualpill">' + esc(n) + '<span class="tag">MANUAL ENTRY</span>' +
              '<button type="button" data-tbt-rmm="' + esc(n) + '" aria-label="Remove ' + esc(n) + '">&times;</button></span>';
          }).join('') + '</div>' : '') + '</div>' +
        '<label class="tbt-check"><input type="checkbox" id="tbtPresented"' + (G.presented ? ' checked' : '') + '>' +
          '<span>' + esc(LEADER_STATEMENT) + '</span></label>' +
        '<p class="tbt-err" id="tbtErr" role="alert">' + esc(err || '') + '</p>' +
        '<button type="button" class="submit-button" id="tbtSubmitGroup">Submit Group Toolbox Talk</button>' +
        (o.pinRequired && !S.pinOk ? '<p class="tbt-note">You will confirm with your 4-digit PIN on the next screen.</p>' : '') +
        '<button type="button" class="back-button" id="tbtBackToTalk">&larr; Back to the talk</button>';
      shell(body);
      if ($('tbtGroupSel')) $('tbtGroupSel').onchange = function () { G.group = this.value; G.attendees = []; renderGroup(); };
      $('tbtPresenter').oninput = function () { G.presenter = this.value; };
      if ($('tbtAll')) $('tbtAll').onclick = function () { G.attendees = list.map(function (p) { return p.n; }); renderGroup(); };
      if ($('tbtNone')) $('tbtNone').onclick = function () { G.attendees = []; G.manual = []; renderGroup(); };
      Array.prototype.forEach.call(el.querySelectorAll('[data-tbt-att]'), function (b) {
        b.onclick = function () {
          var n = b.getAttribute('data-tbt-att'), i = G.attendees.indexOf(n);
          if (i === -1) G.attendees.push(n); else G.attendees.splice(i, 1);
          renderGroup();
        };
      });
      Array.prototype.forEach.call(el.querySelectorAll('[data-tbt-rmm]'), function (b) {
        b.onclick = function () { var i = G.manual.indexOf(b.getAttribute('data-tbt-rmm')); if (i !== -1) G.manual.splice(i, 1); renderGroup(); };
      });
      $('tbtManualAdd').onclick = function () {
        var n = ($('tbtManual').value || '').trim();
        if (!n) return;
        if (G.manual.indexOf(n) === -1 && G.attendees.indexOf(n) === -1) G.manual.push(n);
        renderGroup();
      };
      $('tbtPresented').onchange = function () { G.presented = this.checked; };
      $('tbtBackToTalk').onclick = function () { S.step = 'review'; render(); };
      $('tbtSubmitGroup').onclick = function () {
        if (!G.presenter.trim()) { $('tbtErr').textContent = 'Enter who presented the talk.'; return; }
        if (!G.attendees.length && !G.manual.length) { $('tbtErr').textContent = 'Select who attended.'; return; }
        if (!G.presented) { $('tbtErr').textContent = 'Tick the box confirming you presented the talk.'; return; }
        if (o.pinRequired && !S.pinOk) { renderPin(); return; }
        send();
      };
    }

    /* PIN confirmation, only at the final acknowledgement. Four digits, checked
       by the server against this link's own employee. */
    function renderPin(msg, markBad) {
      var body =
        '<div class="tbt-card">' +
          '<div class="tbt-doc-title" style="color:var(--color-text-primary);font-size:17px">Confirm it is you</div>' +
          '<p class="tbt-note" style="margin-top:4px">Enter your 4-digit PIN to record this talk.</p>' +
          '<div class="pin">' + [0, 1, 2, 3].map(function (i) {
            return '<input id="p' + i + '" type="tel" inputmode="numeric" maxlength="1" autocomplete="off" aria-label="PIN digit ' + (i + 1) + '">';
          }).join('') + '</div>' +
          '<p class="perr" id="perr">' + esc(msg || '') + '</p>' +
          '<button type="button" class="submit-button" id="pgo" disabled>Confirm</button>' +
          '<p class="phint">' + esc(o.pinHint || 'Your PIN is the last 4 digits of your mobile number.') + '</p>' +
        '</div>' +
        '<button type="button" class="back-button" id="pback">&larr; Back</button>';
      shell(body);
      var boxes = [0, 1, 2, 3].map(function (i) { return $('p' + i); });
      function value() { return boxes.map(function (b) { return b.value; }).join(''); }
      function sync() { $('pgo').disabled = !/^[0-9]{4}$/.test(value()); }
      boxes.forEach(function (b, i) {
        b.oninput = function () {
          b.value = b.value.replace(/[^0-9]/g, '').slice(0, 1);
          b.classList.remove('bad');
          if (b.value && i < 3) boxes[i + 1].focus();
          sync();
        };
        b.onkeydown = function (e) {
          if (e.key === 'Backspace' && !b.value && i > 0) boxes[i - 1].focus();
          if (e.key === 'Enter' && !$('pgo').disabled) verify();
        };
        b.onpaste = function (e) {
          var t = (e.clipboardData || window.clipboardData).getData('text') || '';
          var d = t.replace(/[^0-9]/g, '').slice(0, 4);
          if (d.length === 4) { e.preventDefault(); boxes.forEach(function (x, j) { x.value = d[j]; }); sync(); boxes[3].focus(); }
        };
      });
      if (markBad) boxes.forEach(function (x) { x.classList.add('bad'); });
      boxes[0].focus();
      $('pgo').onclick = verify;
      $('pback').onclick = function () { S.step = 'complete'; render(); };
      function verify() {
        var btn = $('pgo');
        btn.disabled = true; btn.textContent = 'Checking…';
        Promise.resolve(o.verifyPin ? o.verifyPin(value()) : { verified: false }).then(function (out) {
          out = out || {};
          if (out.verified) { S.pinOk = true; send(); return; }
          if (out.locked) { stop(); if (o.onLocked) o.onLocked(out.locked_until); return; }
          var left = out.attempts_remaining;
          renderPin(left == null ? 'That did not work. Check with your supervisor.'
            : 'That PIN did not match. ' + left + ' attempt' + (left === 1 ? '' : 's') + ' left.', true);
        }, function () { renderPin('That did not go through. Please try again.'); });
      }
    }

    function send() {
      var b = $('tbtSubmit') || $('pgo');
      if (b) { b.disabled = true; b.textContent = 'Sending…'; }
      stopEng();
      var args = { format: S.format, activeMs: Math.min(activeMs(), 86400000),
        sectionsViewed: sectionsDone(), sectionsTotal: sections.length, role: leader ? 'leader' : 'participant' };
      if (leader) {
        args.group = S.grp.group; args.presenter = S.grp.presenter.trim();
        args.attendees = S.grp.attendees.slice(); args.manual = S.grp.manual.slice();
      }
      Promise.resolve(o.submit ? o.submit(args) : null).then(function (rec) {
        if (!rec) {
          S.step = 'complete'; startEng();
          renderComplete('That did not go through. Please try again.');
          return;
        }
        S.finished = true; stop();
        renderDone({ submitted_at: rec.submitted_at, active_ms: rec.active_ms != null ? rec.active_ms : args.activeMs,
          format: S.format, sectionsViewed: args.sectionsViewed, group: args.group, presenter: args.presenter,
          attendees: args.attendees, manual: args.manual, attendeesStored: !!rec.attendees_stored });
      }, function () {
        S.step = 'complete'; startEng();
        renderComplete('That did not go through. Please try again.');
      });
    }

    /* ---------------- confirmation: exactly what was recorded ---------------- */
    function renderDone(rec) {
      S.step = 'done';
      var kv = function (k, v, id) {
        return '<div class="kv"' + (id ? ' id="' + id + '"' : '') + '><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span></div>';
      };
      var fmtName = rec.format === 'doc' ? 'Original document' : rec.format === 'guided' ? 'Guided Talk' : '';
      var body =
        '<div class="tbt-notice is-ok tbt-done" id="tbtDoneNotice">' +
          '<div class="big">' + (o.preview ? 'Preview complete' : 'Toolbox Talk recorded') + '</div>' +
          '<div style="margin-top:6px">' + esc(talk.title) + '</div>' +
          (o.preview ? '<div style="margin-top:6px">Preview — nothing was recorded and nothing was sent.</div>' : '') +
        '</div>' +
        '<div class="tbt-rec">' +
          kv('Talk', talk.title) +
          (talk.weekStart ? kv('Week of', fmtWeek(talk.weekStart)) : '') +
          (leader ? kv('Group', rec.group || '') + kv('Presented by', rec.presenter || '') +
            kv('Attendees', (rec.attendees.length + rec.manual.length) + ' (' + rec.attendees.length + ' from the list' +
              (rec.manual.length ? ' + ' + rec.manual.length + ' added by name' : '') + ')')
            : kv('Completed by', o.employeeName || '')) +
          (fmtName ? kv('Format', fmtName) : '') +
          (rec.format === 'guided' && sections.length ? kv('Sections reviewed', rec.sectionsViewed + ' of ' + sections.length) : '') +
          (rec.active_ms != null ? kv('Active time', fmtDuration(rec.active_ms)) : '') +
          kv('Recorded at', o.preview ? 'Not recorded (preview)' : fmtWhen(rec.submitted_at), 'tbtRecordedAt') +
          (leader ? kv('Statement', LEADER_STATEMENT) : kv('Statement', PARTICIPANT_STATEMENT)) +
        '</div>' +
        (leader ? '<div class="tbt-field"><label>Who attended</label><ul class="tbt-people" id="tbtAttendeeList">' +
          rec.attendees.concat(rec.manual).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div>' +
          (o.preview || rec.attendeesStored ? '' : '<p class="tbt-note">The attendee list is confirmed on this phone; ' +
            'the server does not store it yet.</p>') : '') +
        '<p class="tbt-note">' + (o.preview ? 'This was a preview. Employees receive their own link by text.'
          : 'Nothing else is needed. You can close this page.') + '</p>';
      shell(body);
    }

    function render() {
      if (S.step === 'method') return renderMethod();
      if (S.step === 'complete') return renderComplete();
      if (S.format === 'guided') return renderGuided();
      return renderDoc();
    }
    function stop() {
      stopEng();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
    }

    render();
    startEng();
    return {
      activeMs: activeMs,
      state: function () { return { step: S.step, format: S.format, sectionsViewed: sectionsDone(), pinOk: S.pinOk }; },
      pinOk: function () { return S.pinOk; },
      stop: stop
    };
  }

  /* Already acknowledged: the confirmation, without the talk in front of it. */
  function renderRecorded(el, o) {
    var t = (o && o.talk) || {};
    el.innerHTML =
      '<div class="tbt-brand">' + esc(o.company || '') + '</div>' +
      '<h2 class="form-title">Toolbox Talk</h2>' +
      '<div class="tbt-notice is-ok tbt-done"><div class="big">Toolbox Talk recorded</div>' +
        '<div style="margin-top:6px">' + esc(t.title) + '</div></div>' +
      '<div class="tbt-rec">' +
        '<div class="kv"><span class="k">Talk</span><span class="v">' + esc(t.title) + '</span></div>' +
        (t.weekStart ? '<div class="kv"><span class="k">Week of</span><span class="v">' + esc(fmtWeek(t.weekStart)) + '</span></div>' : '') +
        '<div class="kv"><span class="k">Recorded at</span><span class="v">' + esc(fmtWhen(o.submittedAt)) + '</span></div>' +
      '</div>' +
      '<p class="tbt-note">This talk is already recorded. Nothing else is needed.</p>';
  }

  root.ToolboxTalk = { mount: mount, renderRecorded: renderRecorded,
    PARTICIPANT_STATEMENT: PARTICIPANT_STATEMENT, LEADER_STATEMENT: LEADER_STATEMENT,
    normalizeSections: normalizeSections };
})(window);
