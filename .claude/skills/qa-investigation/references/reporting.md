# Reporting to stakeholders

The run report (`report.ts --target T`) is the tester's record of one run. This reference is for the
other kind: a document for people outside testing (an owner, a client, a manager) who will read the
findings without the records beside them. Read it when the user asks for a report, summary or PDF to
share.

## How it is made

```
copy templates/report/brief.example.yaml  ->  targets/<id>/report-brief.yaml   (then write it)
npx tsx tools/report.ts --target <id> --stakeholder        # report.html and a PDF in stakeholder-report/
```

Facts come from the records and cannot be changed in the brief: counts, severities, statuses,
expected results, steps, evidence, coverage. Wording comes from the brief: the headline, the plain
account of each finding, priorities, suggested directions, which screenshot shows the point. With no
brief the report is complete and worded as the records are, which is rarely what a stakeholder
should read.

A record changed after the report was made (a finding revised or withdrawn, a test added) changes
the numbers: regenerate, never hand-edit the HTML to match.

Then **read the PDF, every page,** before giving the user the path. Say which pages you looked at
after the last change.

## What a stakeholder needs

- **The conclusion first.** The headline says what the state of the product is, not how many tests
  ran. Two or three sentences after it should let a decision-maker stop reading.
- **Scope and limits.** Who it was tested as, where, against what, and what was not tested and why.
  Limits belong in the report, not in the covering message.
- **Severity and status in words they know.** The template says Confirmed (wrong under any reading),
  Needs decision (clear behaviour, unwritten rule), Suggestion (an improvement), Fixed, Still
  failing, and explains the ones it uses.
- **Per finding:** what happens, why it matters to a customer or the business, what was expected,
  how to see it, and evidence. A suggested direction is optional and is labelled as the tester's.
- **Plain language.** No test ids, tool names, observation numbers or selector names. Times and
  amounts as a person would say them. Say who is affected.

## Wording a finding so it is not misread

A reader takes the title as the claim. A title that only describes behaviour invites "isn't that
normal?", and sometimes the reader is right.

- State what departs from the expectation, not the mechanism: "a hold lasts 30 minutes and the
  customer is not told" rather than "starting checkout takes the item".
- Before writing a finding into a report, ask of its title: could a sensible reader call this
  standard practice? If yes, either the title names the wrong part, or the finding itself needs
  another look (see "Defect or known pattern" in expectations-and-verdicts.md).
- Separate what was seen from what is inferred, and say what was not tried.

## Evidence images

- One image per point, cropped or enlarged to the part that shows it (`zoom`, `focus` in the brief),
  with a caption saying what to notice. A full screenshot at thumbnail size shows nothing.
- No image that is mostly blank. If the point is "the page says Not Found", enlarge the words.
- A screenshot supplied by the user may show their browser, bookmarks or account: crop to the page.
- Check each image in the rendered PDF, not in the HTML.

## Layout to check on every page

- No heading left at the bottom of a page, and no heading separated from its small label.
- No table with one row stranded on another page; no finding card split across pages.
- No page left almost empty by a forced break.
- Addresses and identifiers do not break in the middle.
- Images are legible at the size printed.

The template already keeps cards and rows whole and keeps short tables together; a long finding or
a tall image can still push content onto a new page, which only reading the PDF shows.

## What belongs to the target, not the template

- The accent colour (`accent` in the brief) is the only branding the template takes.
- A one-off layout for one report: edit the generated `report.html` in the target and print it; do
  not change the shared template for it.
- Internal details (test accounts, test data left behind, test addresses) are useful to the team and
  not to an external reader: ask the user who the audience is before including them.

## Example (synthetic)

Records hold F-001 "Opening checkout removes the item from stock" (high, suspected). Writing the
brief, the title fails the misreading test: reserving stock during checkout is normal. Checking the
records shows the reservation was never timed. A recheck finds it expires after 30 minutes with no
notice to the customer. The finding is revised (`finding-update --severity medium --title ...`), the
brief's wording follows, and the report is regenerated so the counts match.
