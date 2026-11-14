# Test data references: hiredesk

The application re-seeds on restart. A restart invalidates the "left in what state" column below.

## Existing data relied on (seed, run-20261115-001540 obs 005 to 008)
| Record | Where seen | Used by tests | Notes |
|---|---|---|---|
| B-1001 Returned £84.00 · B-1002 On Hire £810.00 (10 days, discounted) · B-1003 Reserved £72.00 · B-1004 Cancelled £132.00 · B-1005 Draft £360.00 · B-1006 Reserved £44.00 | Bookings | T-001, T-007, T-010, T-011 | B-1002 and B-1005 untouched |
| Lines: Cement mixer 28.00 ×4, Scaffold tower 45.00 ×3, Floor sander 36.00 ×2, Pressure washer 22.00 ×5, Mini digger 120.00 ×1, Generator 32.00 ×6 | Inventory | T-002 to T-010 | |
| Customers: Hartley, Greenway, Whitcombe, Sutton (Active); Kestrel (On hold) | Customers | T-008, T-011, T-012 | |
| Settings: deposit 20%, maximum hire 28 days | Settings | T-007 | |

## Data created or changed by runs
| Run | Record | What was done | Left in what state | Cleanup needed? |
|---|---|---|---|---|
| run-20261115-001540 | B-1007 | created, confirmed, cancelled (manager) | Cancelled; Generator still shows 2 held (F-002) | restart |
| run-20261115-001540 | B-1008 | created, confirmed while the customer was on hold, cancelled | Cancelled; Cement mixer still shows 1 held (F-002) | restart |
| run-20261115-001540 | B-1009 | created (quantity 2 > available), cancelled by clerk | Cancelled | no |
| run-20261115-001540 | B-1003 | checked out, returned | Returned | no |
| run-20261115-001540 | Settings | deposit rate 20 → 30 | 30% | restart, or set back |
| run-20261115-001540 | Mrs J. Whitcombe | placed on hold | On hold | restart |
| run-20261115-001540 | Kestrel Property Services | hold released by clerk | Active | restart |

The fixture was restarted before run-20261115-003018: every row above this line is history only; the
seed state was seen again at the start of that run (obs 004, 005, 008). Rows below describe the data
as left by the runs after that restart.

| Run | Record | What was done | Left in what state | Cleanup needed? |
|---|---|---|---|---|
| run-20261115-003018 | Mini digger 1.5t | daily rate 120.00 → 130.00 (manager) | 130.00 | restart, or set back |
| run-20261115-003018 | B-1007 | created (Hartley Builders Ltd, Mini digger ×1, 2026-12-01 to 2026-12-29, £3,276.00 at £130.00) | Draft, not confirmed | no (can be used for the F-002 consequence check, or cancelled) |
