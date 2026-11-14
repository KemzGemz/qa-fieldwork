# Coverage: hiredesk

From `coverage.json`. Generated from this target's records by the tools. Do not edit: change the records and the view follows. Overview: [README.md](README.md).

| Area | Status | Tests | Note | Updated |
|---|---|---|---|---|
| Double submit, Back and reload after actions | not-covered |  | Not run (budget) | run-20261115-001540 |
| Max hire length reduced with longer Draft existing | not-covered |  | Ambiguity A2 / Q2 | run-20261115-001540 |
| Pricing: 6-day boundary and rounding | not-covered | T-003 | T-003 not run; 6 days no discount and pence rounding (A3) untested | run-20261115-001540 |
| Settings validation | not-covered |  | BR-18 ranges not run; the form has HTML min/max so server-side enforcement may not be reachable through the UI | run-20261115-001540 |
| Concurrency: two users on the same booking or last unit | deferred |  | Concurrent scenarios are deferred in this version of the workspace; relevant to objective 1 (two clerks confirming the last unit) | run-20261115-001540 |
| Booking form validation | partial |  | BR-07: 29 days refused with message, 28 accepted (T-014, T-016). BR-01: end before start refused (T-015). Form kept values and saved nothing in both refusals. Not run: BR-06 empty customer/equipment/dates, quantity 0 / fraction / blank, past start date (Q3). | run-20261115-003018 |
| Clerk workflow parity | partial | T-011, T-012 | Clerk cancelled a Draft and was refused a held-customer booking; clerk create/confirm/check out/return not run end to end (manager path was) | run-20261115-001540 |
| Inventory: rate change vs existing and new bookings | partial |  | BR-04 holds for a Draft created before the change (T-013: B-1005 kept GBP 120.00 / 360.00) and a booking created after uses the new rate (T-016: B-1007 at GBP 130.00). Not run: Reserved/On Hire bookings after a rate change, and invalid rates zero/negative/non-numeric (A5, Q4). | run-20261115-003018 |
| Sign-in and session | partial |  | Sign in/out and identity shown for both roles; wrong password, signed-out access to pages and Back after sign-out not run | run-20261115-001540 |
| Bookings: availability check | covered | T-004 | Over-availability confirm refused with count | run-20261115-001540 |
| Bookings: cancel Reserved (reversal) | covered | T-006, T-009 | Stock not released (F-002), 2/2 lines | run-20261115-001540 |
| Bookings: check out and return | covered | T-010 | Passes; On Hire offers no cancel; Returned offers nothing | run-20261115-001540 |
| Bookings: create-review-confirm workflow | covered | T-002, T-004, T-005 | Happy path, over-availability refusal, same-day minimum seen. Mandatory-field and end-before-start validation not run | run-20261115-001540 |
| Customers: hold blocks new bookings | covered | T-012 | Refused with message, form values kept, nothing saved | run-20261115-001540 |
| Customers: hold vs existing Draft | covered | T-008 | Confirmation allowed (F-005, suspected; Q1) | run-20261115-001540 |
| Dashboard figures | covered | T-001, T-002, T-006 | Counts correct; value includes Cancelled (F-003); units follow Inventory (so inherit F-002) | run-20261115-001540 |
| Draft reopen from list to Review | covered | T-008 | Seen in T-008 (B-1008 > Review and confirm) | run-20261115-001540 |
| Pricing: weekly discount | covered | T-002, T-005 | 7 days fails (F-001), 8 passes, 6 not run | run-20261115-001540 |
| Roles: clerk restrictions | covered | T-011 | Settings refused (403); rate change, place hold, cancel Reserved not offered; cancel Draft allowed; release hold wrongly allowed (F-006). Server-side refusal of hidden controls not testable through the UI | run-20261115-001540 |
| Settings: deposit rate vs existing bookings | covered | T-007, T-010 | Reserved bookings recalculated (F-004); On Hire/Returned keep fixed deposit; Draft follows estimate | run-20261115-001540 |
