# Domain guidance

Expectations to reach for when the requirements say nothing. Each is a **soft** basis (`domain` or
`standard`) unless the target's requirements adopt it, so a violation is a suspected defect with a
question for the owner. A requirement of the target always wins over anything here.

Condensed from the eight knowledge packs of the earlier `qa-pipeline` helper (50 checks). The named
standards are the ones those packs cite. Before quoting a clause in a finding, verify it against the
standard itself if you can reach it; otherwise cite the practice in words and say it was not verified.

## Data and records

- A created record appears, with the values entered, on every screen that lists or counts such records.
- A second record with the same identifying values (differing only in case or surrounding spaces) is refused or clearly distinguishable.
- An edit survives a reload and shows everywhere the value is displayed; leaving without saving discards it.
- Delete asks first or offers undo; afterwards the record is gone everywhere and nothing that referred to it breaks.
- State-changing actions are offered only in states where they are allowed, cannot be repeated on a finished item, and the new state reads the same on every screen. (ISTQB: state transition testing)
- Lists: a clear empty state, stable order, paging that neither skips nor repeats.
- Search and filter: no-match message, `% _ '` and leading spaces handled, case-insensitive, clearing restores the list.
- Two people changing one record: neither change is lost silently. (Deferred in this version: record as coverage.)
- Quality model for wording impact: ISO/IEC 25010 (functional correctness, completeness, reliability); ISO/IEC 25012 (data consistency).

## Forms and input

- A required field left empty blocks the submit, saves nothing, and the error names the field. (WCAG 2.2 SC 3.3.1 Error Identification)
- A length limit accepts exactly the limit and refuses one more, by typing and by pasting; the same limit holds after submit, not only in the form.
- A numeric range accepts both ends and refuses values just outside, with a message. With no stated range: negative, zero where meaningless, fractional where whole numbers are meant, and huge values are refused. (ISTQB: boundary value analysis, equivalence partitioning)
- Whitespace-only counts as empty; padding is trimmed or treated the same way everywhere.
- Special and international characters (`O'Brien`, `Ünïcødé`, `中文`, `&`, `<b>QA</b>`) are stored and shown exactly as typed, as text.
- Pressing a submit control twice quickly creates one record.
- Other entered values survive a validation error. (WCAG 2.2 SC 3.3.7 Redundant Entry)
- Errors say what is wrong and how to fix it. (WCAG 2.2 SC 3.3.3 Error Suggestion; Nielsen heuristic 9)
- Email fields refuse addresses without `@` or with spaces and accept valid unusual ones (`name+tag@example.com`).

## Money and quantities

- One currency is shown with the same number of decimals everywhere. (ISO 4217 minor units)
- Amount fields refuse zero where meaningless, negatives, too many decimals, non-numbers and absurd values; accept the smallest and largest valid amount.
- Quantities refuse zero, negatives, fractions and more than is available.
- Money moves only after the amount and purpose are shown and can be cancelled. (WCAG 2.2 SC 3.3.4 Error Prevention: Legal, Financial, Data)
- After a payment, every screen showing the amount or balance agrees; totals equal the sum of their lines; rounding happens once. Compute the figure independently before comparing.
- A refund or cancellation cannot return more than was paid, cannot be applied twice, and leaves item and balance in a consistent final state.

## Dates and time

- Impossible dates are refused; an end before its start is refused; behaviour is right at midnight, month end and year end.
- One date format throughout. (ISO 8601 as the unambiguous reference)
- At a time-window boundary, behaviour one minute before and one minute after matches the rule, in the application's time zone.

## Access control and sessions

- A screen reachable by one role is refused, or reduced to what is permitted, for another role, including when its address is opened directly. (OWASP Top 10 2021 A01 Broken Access Control)
- A data-changing control is offered only to roles allowed to use it, and the server refuses the others: hiding the button is not enough.
- Changing a record identifier in the address to someone else's record is refused. (A01, insecure direct object reference)
- After signing out, Back and reopening a signed-in page show no protected data. (OWASP Top 10 2021 A07)
- Wrong password and unknown account give the same message. (A07)
- Password fields are masked; paste and password managers are allowed. (NIST SP 800-63B)

Only on environments where `target.yaml` permits it, and never against production without explicit
approval: script-like input shown as text and never run (OWASP A03); redirect parameters that only
lead to the application's own pages (CWE-601).

## General behaviour and accessibility

- Users never see raw programming values (`undefined`, `NaN`, `null`, `[object Object]`) or stack traces. (OWASP A05 for verbose errors)
- After an action completes, Back or reload does not repeat it.
- Every page has a heading saying what it is for; controls have meaningful names; tables have header cells; fields have visible labels. (WCAG 2.2 SC 2.4.6, 4.1.2, 1.3.1, 3.3.2)
- Everything works by keyboard alone with visible focus; status messages are announced. (WCAG 2.2 SC 2.1.1, 2.4.7, 4.1.3)

The observation output already shows unlabelled fields (label source `placeholder`, `name` or
`none`), missing headings and console or HTTP errors, so several of these can be noticed without
spending actions.

## Using this file

Pick the items that matter for the feature under test and the business at hand. A list of forty
generic checks run against every form is not an investigation; three well-chosen ones on the field
that feeds a calculation are.
