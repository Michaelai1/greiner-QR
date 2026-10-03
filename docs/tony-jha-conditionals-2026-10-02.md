# Tony JHA conditional logic — implementation boundary — 2026-10-02 (updated 2026-10-03)

This is an internal build note for the isolated Greiner review branch. It is not a production promise.

## Final product decisions built in this branch (2026-10-03)

The final prompt of 2026-10-03 overrides the research report where they differ.

- Separate **Complete New JHA** and **Revise Submitted JHA** routes; New or Revised is never asked again.
- **Estimated Time of Completion** replaces Complete Time.
- The old ladder/fall-protection variance questions are retired from new and revised JHAs (form, validation,
  conditional logic, payload, revision prefill, new PDFs, new office detail). Older JHAs still show the questions and
  answers exactly as submitted.
- Ladder use = Yes asks for a **Ladder ID** (one equipment category, "Ladder"), then shows a small **Ladder inspection**
  card: Ladder ID, last inspection date, last inspected by, inspection status. **Record inspection** stamps the signed-in
  inspector and the application's time (no backdating); an optional **Add defect or unsafe condition** asks for a
  description, an optional photo, and whether the ladder was removed from service. An unresolved defect shows
  **Do Not Use**, and a JHA cannot be submitted with that ladder.
- Aerial lift use = Yes records every competent person who may conduct the lift inspections. It records planned
  responsibility only.
- Revisions: same company and job, current Indianapolis workweek (Mon 12:00 AM – Fri 11:59 PM), up to three revisions per
  original, always from the latest version, "What changed?" required, server-stamped, immutable, stale submissions refused.
- The shared JHA model (`JHA-MODEL` block in `index.html`, byte-identical copy in the dashboard's `jha-model.js`) is the
  one definition of the fields that phone review, office detail and the PDF all render.

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
- Where real ladder inspection records live in production. The demo uses fixtures; without a connected source the phone
  saves the Ladder ID and says inspection history is not connected yet.

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
