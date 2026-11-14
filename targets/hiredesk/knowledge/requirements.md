# Requirements: hiredesk

Source: `requirements/source/FSD.md` (FSD-HD-001, "Applies to HireDesk 1.4.x", Approved for build).
Section numbers refer to that document. Extracted in run-20261115-001540 before any browsing.

## Objectives (§1)
1. No double-booking: availability figure per equipment line is trustworthy at any moment.
2. Consistent pricing: system-calculated charge, discount, deposit; a quoted price does not change afterwards.
3. Credit control: manager can stop new business with customers on hold.
4. Management visibility: dashboard is a reliable summary of committed business.

## Actors and permissions (§2)
| Role | May | May not | Source |
|---|---|---|---|
| Clerk | view Dashboard/Bookings/Inventory/Customers; create booking; confirm; check out; record return; cancel Draft | cancel Reserved; change daily rate; hold/release customer; view or change Settings | §2, BR-12..14 |
| Manager | everything above plus cancel Reserved, change rate, hold/release, Settings | (cancel On Hire: nobody) | §2, §3.1 |

Refused capability: "access denied" message and no data change (§2). Header shows name and role on every page. Not signed in: sent to sign-in.

## Entities and lifecycle states (§3)
| Entity | States | Allowed transitions | Source |
|---|---|---|---|
| Booking | Draft, Reserved, On Hire, Returned (final), Cancelled (final) | Draft→Reserved (confirm), Reserved→On Hire (check out), On Hire→Returned (record return), Draft→Cancelled, Reserved→Cancelled (manager). No others; On Hire cannot be cancelled; final states cannot change | §3.1 |
| Customer | Active, On hold | hold / release (manager) | §3, BR-13 |
| Equipment line | n/a (rate, total stock, reserved/on hire, available) | rate change (manager) | §3, BR-04 |
| Settings | deposit rate %, max hire length days | manager edits | BR-18 |

## Business rules (§4)
| ID | Rule | Testable through the UI? |
|---|---|---|
| BR-01 | Chargeable days = end − start, minimum 1; end may not precede start | yes |
| BR-02 | Gross = rate × qty × days | yes |
| BR-03 | 10% weekly discount when days ≥ 7; none below; charge = gross − discount | yes (boundary 6/7) |
| BR-04 | Booking uses the line's rate at creation; later rate change affects only bookings created after | yes (manager) |
| BR-05 | Deposit = charge × deposit rate. Draft shows estimate at current rate; fixed at confirmation; later rate changes must not alter Reserved/On Hire/Returned | yes (manager) |
| BR-06 | Customer, equipment, qty (whole, ≥1), start, end mandatory | yes |
| BR-07 | Days may not exceed max hire length | yes |
| BR-08 | No new booking for a customer On hold | yes |
| BR-09 | Available = total − Reserved units − On Hire units; Draft/Returned/Cancelled hold none | yes |
| BR-10 | Confirm only if qty ≤ available; else stays Draft and user is told how many are available | yes |
| BR-11 | Stock released as soon as Returned or Cancelled; immediately reflected in Inventory | yes |
| BR-12 | Only Manager cancels Reserved; both cancel Draft | yes |
| BR-13 | Only Manager holds/releases | yes |
| BR-14 | Only Manager views/changes Settings or changes a rate | yes |
| BR-15 | Dashboard shows number of bookings per status | yes |
| BR-16 | Booked hire value = sum of hire charge of Reserved + On Hire + Returned | yes |
| BR-17 | Units reserved or on hire (dashboard) = total held units across lines per BR-09 | yes |
| BR-18 | Deposit rate whole 0-100; max length whole 1-365; invalid rejected, previous kept | yes |

## Workflows (§5)
- 5.1 Take a booking: New booking → (validation: form redisplayed with error and entered values, nothing saved) → Draft saved → Review (breakdown + current availability) → Confirm reservation (→ Reserved, detail shown) / Cancel booking / back to list. Draft reopenable from list to Review.
- 5.2 Check out (Reserved→On Hire); Record return (On Hire→Returned, stock released).
- 5.3 Cancel from detail (or Review for Draft); control offered only to permitted users; stock released.
- 5.4 Manager: Settings, Inventory rate, Customers hold/release.
- Every successful action: status message; every refusal explains why; booking keeps history of status changes and who.

## Dependencies stated (§6)
Bookings←Inventory (rate copy, availability at confirm); Bookings←Customers (hold at creation); Bookings←Settings (max length, deposit rate); Inventory←Bookings (held/available); Customers←Bookings (open bookings count = Draft+Reserved+On Hire); Dashboard←Bookings, Inventory, Settings (counts, value, units held, current deposit rate).

## Ambiguities, gaps and contradictions
| # | What is unclear or missing | Where | Working expectation and its basis | Status |
|---|---|---|---|---|
| A1 | Customer put On hold after a Draft exists: may that Draft still be confirmed? BR-08 speaks only of creating | BR-08, objective 3 | Confirmation should be refused: objective 3 is to stop new business, and a Draft is not yet committed business (hypothesis; literal reading of BR-08 allows it) | open → Q1 |
| A2 | Max hire length reduced after a longer Draft exists: can it be confirmed? | BR-07 | Not tested this run | open → Q2 |
| A3 | Rounding of discount and deposit to pence | BR-03, BR-05, §7 | Half-up to 2 dp (domain practice) | assumption |
| A4 | Start date in the past | BR-01/06 | No expectation; note what happens | open → Q3 |
| A5 | Validation of a new daily rate (zero, negative, non-numeric) | BR-04, §5.4 | Should be refused (domain: a hire rate must be a positive amount) | open → Q4 |
| A6 | Whether existing bookings of a held customer may proceed (check out, return) | BR-08 | Should proceed: equipment already committed (hypothesis) | not tested |
| A7 | Draft quantity above total stock: accepted at creation? | BR-06, BR-10 | Allowed as Draft, refused at confirm per BR-10 | from rules |
