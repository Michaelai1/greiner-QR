# Tony JHA conditional logic — implementation boundary — 2026-10-02 (updated 2026-10-03)

This is an internal build note for the isolated Greiner review branch. It is not a production promise.

## Final product decisions built in this branch (corrected 2026-10-04)

- Separate **Complete New JHA** and **Revise Submitted JHA** routes; New or Revised is never asked again.
- **Estimated Time of Completion** replaces Complete Time.
- The old ladder/fall-protection variance questions are retired from new and revised JHAs. Older JHAs still show the
  questions and answers exactly as submitted.
- **Ladders are selected, never typed.** Ladder use = Yes asks **Which ladder or ladders will be used today?** and offers a
  searchable multi-select of the ladders assigned to the job (ID, description, last inspection, Do Not Use). No ladders
  assigned → "No ladders are assigned to this job. Contact the office before using a ladder." and the JHA cannot be
  submitted with ladder use. There is no free-text fallback.
- Each selected ladder has its own card: **Ladder {ID}**, last inspected, inspected by, current status.
  **Inspect for today's use** records the signed-in employee (user id + name), job, company, server time, the JHA root and
  version being written, and the exact versioned attestation "I inspected this ladder before use today and found it safe
  to use." (`ladder-safe-use-v1`). Signed out → "Sign in with your employee access before recording an inspection." No
  typed name is accepted. This is an attestation, not a handwritten signature, and makes no OSHA claim.
- **Report a defect or unsafe condition** (hidden until chosen): required description, optional camera-first photo
  (`accept="image/*" capture="environment"`, preview, retake, remove, same 1600 px JPEG compression as other inspection
  photos), and the required acknowledgment "I marked or tagged this ladder 'Do Not Use' and removed it from service."
  (`ladder-do-not-use-v1`). The ladder then shows Do Not Use, cannot be confirmed safe, and blocks the JHA until a
  different assigned ladder is used. The defect stays on the JHA (review, office detail, revision prefill, PDF).
- Aerial lift use = Yes asks **Who will conduct the lift inspections?** and records names only.
- Revisions: tapping an eligible JHA opens the editor populated from the latest version, with a compact banner. No
  required "What changed?"; the app stores a field-level difference automatically, plus an optional revision note. All
  protections stay: immutable versions, same company and job, Mon–Fri Indianapolis workweek, three-revision cap, server
  time, latest-head branching, stale-submission refusal.
- Toolbox Talks (Greiner): no workflow selector. One assigned talk per job; the designated lead presents and records
  attendance ("Leading this talk"); each participant follows along (original document or Guided Talk) and submits their
  own acknowledgment. The office sees the lead's presentation and each acknowledgment separately, with engagement time.

### Ladder inspector (Tony, meeting of 2026-10-09)

- Ladder use = Yes asks one follow-up: **Who will inspect the ladders prior to use?** It is required, uses the same
  crew picker as the aerial lift question (names from the job crew list, more than one allowed), and stores the names
  (`jhaLadderInspectors`) plus the time they were picked (`jhaLadderInspectorsAt`, the phone's clock, set each time the
  pick changes). Both show in the phone review, `fields.doc`, the PDF and the office detail as
  "Who will inspect the ladders prior to use?" and "Ladder inspector selected at".
- Ladder use = No asks nothing else and stores no ladder answers.
- No ladder quantity, 30-day check or ladder ID question in production. The interim quantity / 30-day design
  (unmerged branch `feature/tony-feedback-2026-10-02`) is rejected. Ladder ID selection stays demo-only (below).
- JHAs stored before this change have no inspector answer and render exactly as before; revising one asks for it.

### Ladder IDs in production (updated 2026-10-05)

Ladders are ordinary equipment units (`cs_equipment` rows whose type contains "ladder"), managed on the office Equipment
tab and assigned to jobs through the same single write path as lifts and forklifts. Safe-use checks and defects are
append-only rows in `cs_equipment_events`. The phone reads them with `cs_portal_field_equipment` and writes them with
`cs_portal_field_ladder_safe` / `cs_portal_field_ladder_defect`, which take the employee from the session and the time from
the server clock. All of this is in the dashboard repo's `sql/2026-10-05-equipment-management.sql`, which is **proposed
and not applied**. Until it is applied, the phone shows "Ladder records are not connected for this job yet."

There are no ladders in production today. **Greiner must still confirm how physical Ladder IDs will be labeled before the
office enters them.** The demo uses fixture ladders on the demo job only.

Production JHAs do not yet carry a root JHA id (see "loading a JHA to revise" below), so a production ladder event is
not linked back to its JHA by id; the JHA stores the server's event id in its ladder snapshot instead.

### Not enforced yet (future Greiner decisions)

- **Ladder training.** No training or qualification check gates "Inspect for today's use", because the production training
  source is incomplete. Enforcement is a future Greiner decision.
- **Defect resolution.** Field users can never resolve or delete a defect. Clearing an established defect will need an
  office/admin resolution workflow, which is not built in this demo.

### Production requirement — loading a JHA to revise

The phone reads revisable JHAs through one data-access boundary (`JHA_SOURCE` in `index.html`). Demo mode uses the in-page
fixtures; the production source is deliberately not connected on this branch. The production implementation must:

1. **Query by company and job** — only the signed-in user's company and the job of the field session.
2. **Use a stable root JHA ID** — every version of a family shares `root_jha_id`; versions are never re-keyed.
3. **Resolve the latest revision** server-side (highest `revision_number`; the head is the only version a revision may
   start from).
4. **Authorize** — field-session scope plus the job assignment; never trust ids sent by the phone.
5. **Apply workweek eligibility** — America/Indiana/Indianapolis, Monday 12:00 AM to Friday 11:59 PM (configurable).
6. **Enforce the three-revision cap** in the database write, not only in the UI.
7. **Protect against stale heads** — the write names the base version id and fails if the head has moved.
8. **Hydrate every stored field and conditional state** — ladder selections, per-ladder checks, defects, aerial
   inspectors, crew, photos — so the editor opens exactly as the latest version was submitted.

## Unresolved behavior — do not invent

- The approved ladder-inspection freshness rule and source. Tony mentioned weekly; until he confirms, the last inspection
  date is informational (`LADDER_INSPECTION_CADENCE` in the shared model — change one object to enforce 7 days or the
  workweek).
- Weekend revision behavior. The demo uses Tony's literal Monday–Friday window (`JHA_REVISION_RULES.workdays`).
- The authoritative competent-person roster and whether free-text names are allowed (the demo uses the job's crew roster).
- What happens when the selected person lacks a required training record (nothing is blocked today).
- Whether notification to a named competent person is required for the first rollout, and the approved message and
  consent rules if it is.
- Tony's Oct 1 fall-protection branch for ladder use ("Is fall protection planned or expected during ladder use" → No:
  "Explain why using any fall restraint system is not needed in this instance" / Yes: who inspects the fall-protection
  equipment). The final prompt replaced the ladder section with the Ladder ID card and does not include this branch, so
  it is **not built**. Needs a product decision.
- Office resolution of a Do Not Use defect (who may clear it, and what they must record). Not built; field users can
  never clear one.

## RFI-dependent fields — pending Tony's RFIs (added 2026-10-05)

Tony is waiting on RFIs before confirming, for each form field:

- which fields use dropdowns,
- which fields stay free entry,
- what auto-populates,
- what stays editable after submission.

**None of these is decided, and no form was changed for them.** Fields keep their current behavior until Tony answers.
When the answers arrive, change one field at a time with a test for each, and record the decision here.

## Backlog — after the Peine launch

### Scaffolding branch (Tony, Oct 1, verbatim intent)

Tony's request: add **"Is there any planned or expected use of scaffolding today"** after the ladder section. If Yes,
ask **"has the scaffolding been inspected by a competent person"**. If Yes, ask **"Who was the competent person that did
the inspection"**. Tony: **"This specific section wait until we get through the Peine launch if needed."**

Open before building: what a No answer does (block, warn, or remove scaffolding from the plan), the inspection date/time
source, and the competent-person source.

### Competent-person notifications

Today the JHA records the names only and sends nothing. Before any message is sent:

- **Delivery**: who receives it (resolved from the roster, never a typed number), the approved message text, and whether
  it is informational or asks the person to accept the responsibility.
- **Failure handling**: retries, what the foreman sees when a message cannot be delivered, and that the JHA never waits
  on delivery.
- **Consent**: an opt-in record for every recipient before any text is sent.
- **Audit**: every notification stored as sent, delivered, accepted, declined or failed, tied to the JHA version — and
  delivery is never treated as proof that an inspection happened.

## Safe implementation sequence

1. Obtain Tony's answers to the unresolved behavior above.
2. Replace any further branch in one isolated change; do not layer it on top of an older one.
3. Add deterministic tests for every Yes and No path, clearing hidden required fields when a parent answer changes.
4. Verify the submitted record, office detail, and PDF all carry the same answers.
5. Confirm revision loading restores the conditional state without changing the original record.
6. Review in the Greiner demo before any production merge or deployment.
