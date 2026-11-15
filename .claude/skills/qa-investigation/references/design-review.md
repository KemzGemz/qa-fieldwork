# Design and usability review

How to review what a product looks like and how it is to use. Read before any UI/UX, usability,
look-and-feel or "first impression" work, and before telling a user that such work was covered.

## When it applies

- The user asks for UI/UX, usability, design or accessibility coverage.
- The product is customer-facing, so its first impression and ease of use are part of what it is
  for. Then register a design coverage area in step 5 even if nobody asked, and say whether it was
  reviewed.

It does not apply to a product nobody looks at (an API, a batch job), or when the user limited the
work to function: register the area as `out-of-scope` with that reason and spend nothing on it.

## The rule that matters

Measuring is not looking. Contrast ratios, label checks, tab order and element sizes read from the
page are useful, and they miss most of what a person sees in two seconds: a link in the wrong place,
a control that does not match the page, a half-empty layout, placeholder text. A design review in
which the screenshots were not read, state by state, is a mechanics check: call it that in the
coverage note, not "UI/UX covered".

## Method

1. **List screens and states before looking.** Every page, and for each page the states a user
   meets: each control opened (a dropdown's list, a date picker, a menu, a dialog), each message
   state (empty, error, nothing available, success), and each of these at desktop and at phone width
   (`browser.ts viewport --width 375`, reload, look; `--reset` afterwards).
2. **Look at each one.** Read the screenshot image itself, not only the observation text
   (`shot --full-page` for long pages). Text output shows a link exists; only the image shows it
   floating alone in the header.
3. **Controls the page does not draw.** The opened list of a built-in select, a built-in date or
   time picker, a file chooser and `alert` boxes are drawn by the browser, outside the page, so tool
   screenshots never contain them. Find out what the control is (`eval`: tag, `type`, computed
   `appearance`), then either look in a visible browser, or ask the user for a screenshot of the
   open control. Say which you did. A built-in control inside a custom design is itself worth
   noting: styling cannot change its pop-up.
4. **Compare against the product's own visual language, not your taste.** The questions below.
5. **Propose as well as judge.** Where nothing is wrong against any expectation but a clearly
   better way exists, file it with `--classification improvement` and the benefit to the user.

## Questions for every screen and state

| Area | Ask |
|---|---|
| Navigation | Is the header the same on every page: same items, same grouping, same position? Does any link lead to the page already open? Is there a way back from every page, and does a "Back" control on a first step have somewhere to go? |
| Consistency | One primary button colour, one heading style, one corner radius, one card style across pages? Is the same thing written the same way everywhere (times, dates, durations, money, names of things)? Does the look change at the step where the user commits or pays? |
| Controls | Does an opened control match its field in width, shape and font? Would a few fixed choices be clearer as buttons than as a list? |
| Seeing before choosing | Can the user see what is unavailable (a full day, a sold-out size, a disabled option) before choosing it, or only after? Where does the message appear relative to the control that caused it? Does it say what to do next? |
| Completeness | Placeholder text or images, empty areas, items without names or captions. Can the user reach a person (contact details)? After finishing, are they told what happens next: a reference, a receipt, where to go, how to change or cancel? |
| Readability | Contrast of the main action buttons, not only of body text. Text size on a phone (form text under 16px makes iPhone Safari zoom). Size of things to tap. |
| Keyboard | `act press --key Tab` prints the focused control and whether focus is visibly marked. Is the order the visual order? Does a dialog take focus, close on Escape and give focus back? |
| Layout | Empty columns, uneven grids, content hidden under a fixed header, sideways scrolling at phone width. |

## Expectations and verdicts

- Two screens of the same product that disagree (two headers, two button styles, two formats for
  one date) rest on the product's own other screen: cite both observations. The owner may intend the
  difference, so the verdict is `suspected` unless a style guide was supplied.
- Everything else is `domain` practice: say which practice, and what the owner might reasonably
  prefer instead.
- Evidence is a screenshot of each side of a comparison. For a browser-drawn control, the user's
  screenshot, copied into the run's evidence folder and named as user-supplied.
- The coverage note lists which screens and states were looked at, which were only measured, and
  which were not reached.

## Example (synthetic)

A cinema site lets the user pick a showing and then a seat. Function tests pass: a seat can be
chosen and paid for. Listing states before looking adds "showing with no seats left" and "seat list
open at phone width". Looking shows three things no measurement would: the sold-out showing looks
like any other until it is clicked and an error appears at the bottom of the page; the seat list is
the browser's own grey list inside a dark custom page; and the confirmation page has a different
header from the rest. The first becomes a suspected defect (availability is not visible before
choosing), the second an improvement with the user benefit stated, the third a suspected
inconsistency citing both screenshots.

Where it does not apply: the same cinema's nightly export job has nothing to look at. Its coverage
entry says `out-of-scope` for design, and no time goes into it.
