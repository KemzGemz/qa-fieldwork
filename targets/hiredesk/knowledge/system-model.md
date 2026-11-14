# System model: hiredesk

Status labels: **documented** (FSD), **observed** (run and observation number), **hypothesized**.
Observed behaviour is what the application does, not proof it is right.
All observations below: run-20261115-001540, application version 1.4.2.

## Screens and states
| Screen / state | URL or how reached | Roles | Evidence |
|---|---|---|---|
| Sign in (also the signed-out state, "You have signed out.") | /login | none | obs 001, 064 |
| Dashboard: status counts, booked hire value, units held, current deposit rate | / | both | obs 004, 067 |
| Bookings list with Status filter | /bookings | both | obs 005, 073 |
| New booking form; same URL redisplayed with error and entered values | /bookings/new | both | obs 010, 087 |
| Review (Draft): price breakdown, availability, Confirm / Cancel | /bookings/B-nnnn/review | both | obs 016, 036 |
| Booking detail, by status: Draft (Review and confirm, Cancel), Reserved (Check out; Cancel for manager only), On Hire (Record return), Returned / Cancelled (no actions); History | /bookings/B-nnnn | both | obs 017, 039, 050, 061, 062, 077, 080 |
| Inventory; manager gets a rate field and Update rate per line, clerk does not | /inventory | both | obs 006, 071 |
| Customers; manager gets Place hold / Release hold, clerk gets Release hold only | /customers | both | obs 007, 072 |
| Settings (deposit rate, maximum hire length) | /settings | manager | obs 008 |
| Access denied page (HTTP 403) | /settings as clerk | clerk | obs 070 |

## Entities
| Entity | Key attributes | States | Created / changed by | Shown on |
|---|---|---|---|---|
| Booking | reference, customer, line, quantity, dates, days, rate, gross, discount, charge, deposit and its rate, created by, history | Draft, Reserved, On Hire, Returned, Cancelled | New booking; Confirm; Check out; Record return; Cancel | Bookings, Review, detail, Dashboard (counts, value), Inventory (held units), Customers (open count) |
| Equipment line | name, daily rate, total, held, available | none | Update rate (manager) | Inventory, New booking options, Review availability |
| Customer | name, phone, status, open bookings | Active, On hold | Place / Release hold | Customers, New booking options ("(on hold)" suffix) |
| Settings | deposit rate, maximum hire length | none | Save settings (manager) | Settings, Dashboard (current deposit rate), deposit lines |

## Relationships and dependencies
| # | Relationship | Status | Source or evidence | Still uncertain | Changes that could affect it |
|---|---|---|---|---|---|
| 1 | Confirm adds the quantity to the line's held units; Inventory and Dashboard units follow | documented, observed correct | BR-09, BR-17; T-002 obs 018, 020 | none | confirm logic |
| 2 | Record return releases held units | documented, observed correct | BR-11; T-010 obs 063 | none | none known |
| 3 | Cancelling a **Reserved** booking releases held units | documented; **observed not happening** | BR-11; T-006, T-009 (F-002) | Whether units are ever released later; whether the over-count then blocks confirmations (expected through BR-10) | cancel logic |
| 4 | Cancelling a Draft changes no stock | documented, observed consistent | BR-09; T-011 (B-1009) | none | none known |
| 5 | Dashboard status counts = bookings per status | documented, observed correct | BR-15; obs 004, 020, 041 | none | none known |
| 6 | Dashboard booked value = Reserved + On Hire + Returned charges | documented; **observed to include Cancelled** | BR-16; T-001, T-006 (F-003) | none | dashboard calculation |
| 7 | Weekly discount applies from 7 chargeable days | documented; **observed from 8** | BR-03; T-002, T-005 (F-001) | 6-day case untested | pricing |
| 8 | Deposit fixed at confirmation | documented; **Reserved view recalculates at the current rate**, On Hire and Returned show the fixed value | BR-05; T-007, T-010 (F-004) | What the customer is actually charged is not visible in the UI | settings change |
| 9 | Draft deposit estimate follows the current rate | documented, observed correct | BR-05; T-007 obs 050 | none | none known |
| 10 | A hold blocks creating a booking | documented, observed correct | BR-08; T-012 | none | none known |
| 11 | A hold does not block confirming an existing Draft | **undocumented**; observed | T-008 (F-005) | Intended or not (Q1) | none known |
| 12 | Customer open-bookings count = Draft + Reserved + On Hire | documented, observed consistent | FSD section 3; obs 007, 019, 052, 072 | none | none known |
| 13 | Clerk cannot reach Settings, change rates, place holds, cancel Reserved | documented, observed in the UI | BR-12 to BR-14; T-011 | Server-side refusal where the control is hidden | none known |
| 14 | Clerk can release a hold | **contradicts BR-13**; observed | T-011 (F-006) | none | none known |
| 15 | A booking keeps the line's rate at creation after a rate change; bookings created afterwards use the new rate | documented, observed correct for a Draft and a new booking | BR-04; run-20261115-003018 T-013 (obs 007 to 009), T-016 (obs 020) | Reserved / On Hire bookings after a rate change not checked (F-004 shows Reserved views can recalculate); invalid rate values (Q4) | rate change |
| 16 | Maximum hire length applies at creation only | hypothesized | BR-07 | Existing longer Drafts after a reduction (Q2) | settings change |
| 17 | New booking validation: more than the maximum hire length refused, exactly the maximum accepted; end before start refused; form keeps values, nothing saved | documented, observed correct | BR-07, BR-01, FSD 5.1; run-20261115-003018 T-014 to T-016 (obs 016, 018, 020, 021) | BR-06 mandatory fields and quantity values not run | settings change (maximum) |

## Workflows (as observed)
- Take a booking: Bookings > New booking > Continue to review (Draft saved, reference issued) > Confirm reservation > detail (Reserved). Matches FSD 5.1. A refused confirmation stays on Review and gives the reason.
- Hand out and receive: detail > Check out > Record return, each behind a native confirm dialog. Matches 5.2.
- Cancel: detail > Cancel booking (native confirm). Matches 5.3 except for stock (relationship 3).

## Investigation ideas generated by the model
- After F-002: once cancellations have wrongly reduced a line's available count to 0, is a new confirmation refused? That would show the business consequence directly.
- BR-04: done for Draft B-1005 and a new booking (run-20261115-003018). Remaining: a Reserved booking's rate and charge after a rate change; invalid rates (Q4).
- BR-07 boundary 28/29 and BR-01 end before start: done (run-20261115-003018). Remaining: BR-06 empty fields and zero or fractional quantity.
- Does setting the deposit rate back restore the Reserved deposit display? (confirms "recalculated on view" for F-004)
- Clerk end-to-end booking; sign out then Back; a booking page address while signed out.
- Two users confirming the last unit at once (deferred: concurrency).
