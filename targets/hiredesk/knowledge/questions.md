# Assumptions and unresolved questions: hiredesk

## Assumptions in use
| # | Assumption | Why it is reasonable | What depends on it | Confirmed? |
|---|---|---|---|---|
| S1 | Seed bookings were confirmed at a 20% deposit rate | Settings showed 20% at the start; B-1003 shows (20%) £14.40 once On Hire | Expected values in F-004 | Supported by T-010 |
| S2 | Money rounds half-up to pence | FSD section 7 says two decimals; common practice | Expected deposits (no case so far needed rounding) | no |
| S3 | The hire charge on the Bookings list is the booking's stored charge | Same figure on list, Review and detail in every case seen | Expected total in T-001 | observed consistent |

## Questions for the business / product owner
| # | Question | Why it matters | Raised (run) | Answer |
|---|---|---|---|---|
| Q1 | When a customer is placed On hold, should confirming their existing Draft bookings be refused? | F-005 is a defect only if yes | run-20261115-001540 | |
| Q2 | If the maximum hire length is reduced, may an existing longer Draft still be confirmed? | Untested; decides the expectation | run-20261115-001540 | |
| Q3 | Are start dates in the past allowed? | No rule; affects validation tests | run-20261115-001540 | |
| Q4 | Which values are valid for a daily rate (zero, negative, pence precision)? | BR-04 gives no validation rule | run-20261115-001540 | |
| Q5 | Should existing bookings of a held customer still be checked out and returned? | Not stated; assumed yes | run-20261115-001540 | |
