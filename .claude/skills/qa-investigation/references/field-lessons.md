# Field lessons

General lessons carried over from earlier work. Each keeps its provenance. They are aids to
judgment, not rules about any other application. New proposals go to `lessons-proposed.md` through
`records.ts lesson` and are moved here only after the tester reviews them.

Provenance of the first three sections: a two-hour specification-based test event against a live
multi-role ordering system, 14 November 2026, recorded in `qa-pipeline/targets/meja-marmar/summary.md`
(140 cases, 25 confirmed defects, 2 findings withdrawn). The last section has its own provenance.

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

## From an investigation without requirements

Provenance: five runs against a small public appointment-booking site with online deposit payment
and no written requirements, 15 November 2026 (34 tests, 13 findings, 1 withdrawn and refiled),
followed by a retrospective kept with that target. Each lesson below was a correction the user had
to make or a problem the tools did not handle; the method they led to is in the references named.

- **A design review that only measures is not one.** Contrast, labels and focus were checked from
  the page; four visible design problems were missed until the user sent screenshots, because the
  screens and the opened controls were never looked at. (design-review.md)
- **A normal pattern was filed as a high-severity defect.** A slot held during payment was reported
  as "removed for everyone" after a single later look; the user pointed out that holds are
  standard, and a recheck found it ended by itself within the hour. What remained was narrower and
  less severe. Time the state before judging it. (investigation-heuristics.md, expectations-and-verdicts.md)
- **Return paths from a payment provider are separate tests.** The success and cancel addresses
  pointed to another host; nothing showed it until each path was taken to the end.
- **"Left out for budget" was written with half the budget unused.** The real reason was that the
  area had not been asked for. The user had to ask whether it was covered.
- **Ask for the improvement, not only the defect.** The user expected suggestions (show what is
  unavailable before it is chosen); the records had no place for one that was not a defect.
- **A stakeholder questioned a finding from its title alone.** "What does this mean? Isn't that
  standard practice?" Titles that describe behaviour without saying what is wrong get that answer.
  (reporting.md)
- **Chained commands ran blind after a refused click,** twice in this work and once on an earlier
  target (the proposal that used to be in lessons-proposed.md). The tool now refuses the next step
  until the page is observed. In Git Bash, also pass application paths as full URLs or without a
  leading slash.
- **A verdict was recorded in the same command as the check it depended on,** and the check had
  failed. The claim happened to be true when verified afterwards; the order was still wrong.
- **A time was written from memory and was 15 minutes off.** Read the clock.
- **Word-matching safety guards produce false positives** (answer options containing "remove").
  A named exception is better than switching the guard off for the whole target.