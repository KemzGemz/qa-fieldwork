# Field lessons

General lessons carried over from earlier work. Each keeps its provenance. They are aids to
judgment, not rules about any other application. New proposals go to `lessons-proposed.md` through
`records.ts lesson` and are moved here only after the tester reviews them.

Provenance of all entries below: a two-hour specification-based test event against a live multi-role
ordering system, 14 November 2026, recorded in `qa-pipeline/targets/meja-marmar/summary.md`
(140 cases, 25 confirmed defects, 2 findings withdrawn).

## Method

- **The specification's exact wording is the best oracle.** Using quoted messages and stated limits
  as expected results made most verdicts an objective match or mismatch.
- **Compute figures independently before comparing.** Differences of a few cents in rounding, tax
  on refunds and daily takings were only visible against a separately calculated value.
- **Decision tables separate a missing check from an off-by-one.** Trying each payment path against
  each rule showed one rule absent on two paths and another triggering one unit late.
- **Compare the same figure and state on every screen that shows it.** Several defects were one
  screen summing a different field from another.
- **An action on one item can spill onto its siblings.** Cancelling or completing one part of a
  grouped record affected the whole group; check the neighbours after acting on one.
- **Reversals are a rich area.** Refund amount, what stays visible after cancellation, and whether a
  cancelled item can be acted on again each produced defects.
- **Follow up a symptom until the cause is narrow.** One extra experiment usually turned "wrong at
  some times" into a statement a developer can act on.
- **Cross-check coverage against the plan before finishing.** A second pass over the plan's risk
  list found untested areas and two further defects.

## Discipline

- **Record the before-state; do not remember it.** Both withdrawn findings came from comparing
  against a remembered state that an earlier test had changed.
- **Keep a list of data you changed.** An exploratory input ("7.4" in an amount field) turned out to
  be valid and paid a seeded record. It was caught because data changes were being listed.
- **Withdraw openly.** Withdrawn findings stayed in the record with the reason.
- **Following the document literally has a cost.** Behaviour the specification did not describe was
  not reported in that event. Reasoned expectations for undocumented behaviour belong in the plan.

## Environment and browser

- **Shared environments move under you.** A teammate was using the same account; switching to
  accounts nobody else used removed the interference. Ask which accounts and data are shared.
- **One tab, click to navigate.** New tabs and typed addresses stopped getting responses partway
  through; working in the one open tab and clicking links kept working.
- **Short bounded waits.** Long fixed pauses between clicks were the main cause of a slow first
  session; waiting for the document plus a brief network quiet was enough.
- **Leave shared and destructive actions alone unless approved.** Data reset, password reset and
  deletes of records with history were listed as residual risk rather than run.
- **Some rules can only be tested at certain times.** Note the window in coverage and the next
  action rather than dropping the test silently.
- **Say what was not tested and why.** The residual-risk list (direct requests, simultaneous users,
  out-of-window times, shared accounts, destructive actions) was as useful to the reader as the
  defect list.
