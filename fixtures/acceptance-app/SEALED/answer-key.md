SEALED — do not open until the blind investigation report is complete.

# Tallyard HireDesk — answer key (seeded defects)

Five deliberate defects and one intentionally unspecified behaviour. Everything else is intended to work per the FSD.

## D1 — Weekly discount boundary (explicit business-rule violation) — BR-03

- **What:** The 10% weekly discount is applied only when chargeable days are *greater than* 7; a hire of exactly 7 chargeable days gets no discount.
- **Where:** Pricing on New booking → Review, booking detail, bookings list (`price()` uses `days > 7`).
- **Observe:** Create a booking with end date = start date + 7 days (e.g. Generator 3kVA x1: gross £224.00). Review shows "Weekly discount: None", hire charge £224.00; expected discount £22.40, charge £201.60. 8 days or more is discounted correctly; 6 days correctly not.

## D2 — Cancelling a Reserved booking does not release stock (cross-module) — BR-11, BR-09 (and BR-17, BR-10 downstream)

- **What:** When a Reserved booking is cancelled the equipment line's "Reserved / on hire" count is not reduced, so Available stays too low. Recording a return releases stock correctly; cancelling a Draft is correctly a no-op.
- **Where:** Bookings (cancel) → Inventory, Review "Currently available", Dashboard "Units reserved or on hire".
- **Observe:** As maria, note Inventory for Floor sander (2 total, 1 held, 1 available). Cancel B-1003 (Reserved). Inventory still shows 1 held / 1 available (expected 0 / 2). Dashboard units remains 4 (expected 3). A new booking for 2 floor sanders is then wrongly refused at confirmation.

## D3 — Clerk can release a customer hold (role/permission) — BR-13

- **What:** The "Release hold on …" button is shown to Clerks and the server performs the release for them. "Place hold" is correctly hidden from and refused to Clerks.
- **Where:** Customers page.
- **Observe:** Sign in as tom; on Customers, Kestrel Property Services (On hold) has a "Release hold" button; pressing it succeeds ("Hold released…") and the clerk can then create bookings for that customer.

## D4 — Deposit of Reserved bookings changes when the deposit rate changes (configuration change vs existing records) — BR-05

- **What:** For Reserved bookings the detail screen shows the deposit recalculated from the current Settings deposit rate instead of the value fixed at confirmation. On Hire and Returned bookings correctly keep their fixed deposit.
- **Where:** Settings → Booking detail of any Reserved booking.
- **Observe:** B-1003 (Reserved) shows "Deposit (20%) £14.40". As maria set the deposit rate to 50 and save. B-1003 now shows "Deposit (50%) £36.00" (expected still 20% / £14.40). B-1002 (On Hire) still shows 20% / £162.00 (correct). Checking out a Reserved booking after the change shows the originally fixed value again, so the figure also flips at check-out.

## D5 — Dashboard "Booked hire value" includes Cancelled bookings (state / cross-module reporting) — BR-16

- **What:** The total sums every booking that is not a Draft, so Cancelled bookings are included.
- **Where:** Dashboard.
- **Observe:** On a fresh start the dashboard shows £1,142.00. Expected: B-1001 £84.00 + B-1002 £810.00 + B-1003 £72.00 + B-1006 £44.00 = £1,010.00; the extra £132.00 is cancelled B-1004. Also: cancel any Reserved booking and the value does not go down; create a Draft, cancel it, and the value goes *up*.

## Intentionally unspecified behaviour (not a defect)

- **Confirming an existing Draft for a customer who has since been placed on hold.** BR-08 only says a *new booking cannot be created* for an On hold customer. The FSD is silent about Drafts that already exist when the hold is placed. The app allows such a Draft to be confirmed to Reserved (and later checked out). Seed data supports this: B-1005 is a Draft for Sutton & Daughters Roofing — place that customer on hold as maria, then confirm B-1005. A tester should raise this as a question/observation with reasoning (business objective 3, credit control, suggests it probably should be blocked), not as a clear-cut rule violation.

Other minor unspecified points a tester may legitimately raise as questions (none are seeded defects): start dates in the past are accepted; a Clerk's direct request to cancel a Reserved booking is refused server-side (correct); equipment rate changes do not re-price existing bookings (correct per BR-04).

## Seed reference (fresh start, default deposit rate 20%, max hire 28 days)

| Ref | Status | Customer | Equipment | Qty | Days | Hire charge |
|---|---|---|---|---|---|---|
| B-1001 | Returned | Hartley Builders Ltd | Cement mixer 140L | 1 | 3 | £84.00 |
| B-1002 | On Hire | Greenway Landscapes | Scaffold tower 5m | 2 | 10 | £810.00 (after 10%) |
| B-1003 | Reserved | Mrs J. Whitcombe | Floor sander | 1 | 2 | £72.00 |
| B-1004 | Cancelled | Hartley Builders Ltd | Pressure washer | 2 | 3 | £132.00 |
| B-1005 | Draft | Sutton & Daughters Roofing | Mini digger 1.5t | 1 | 3 | £360.00 |
| B-1006 | Reserved | Greenway Landscapes | Pressure washer | 1 | 2 | £44.00 |

Note: seeded B-1004 was cancelled from Draft, so seed inventory is consistent (D2 is not visible until a Reserved booking is cancelled in the session).
