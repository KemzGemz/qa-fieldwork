# Findings: hiredesk

From `findings.json`. Generated from this target's records by the tools. Do not edit: change the records and the view follows. Overview: [README.md](README.md).

### F-001: No weekly discount on a hire of exactly 7 chargeable days

- **Classification:** product-failure · **Severity:** high · **Status:** retest-failed
- **Found:** run-20261115-001540, role manager, local, version 1.4.2
- **Tests:** T-002, T-005, T-020 · **Requirements:** BR-03
- **Expected:** A hire of 7 chargeable days or more gets a 10% weekly discount (7 days at £32.00 x 2: discount £44.80, charge £403.20)
- **Actual:** At exactly 7 days the Review and detail screens show Weekly discount 'None' and charge £448.00; at 8 days the discount is applied (£22.40 on £224.00). The deposit (£89.60 vs £80.64) and dashboard value inherit the overcharge.
- **Steps:**
  1. Sign in (manager)
  2. Bookings > New booking: any active customer, Generator 3kVA, qty 2, start 2026-12-01, end 2026-12-08
  3. Continue to review: Chargeable days 7, Weekly discount None
- **Reproduction:** 1/1 at 7 days (B-1007); control at 8 days discounted (B-1008, T-005); seed booking B-1002 at 10 days discounted. Not repeated at 7 days to save budget.
- **Impact (observed):** Customer charged £448.00 instead of £403.20; deposit £89.60 instead of £80.64
- **Impact (reasoned):** Every exactly-one-week hire is overcharged by 10%; conflicts with objective 2 (consistent pricing)
- **Duplicate check:** First finding recorded; distinct from the dashboard total (T-001), which is wrong on seed data whose charges are correct
- **Evidence:** [016-t002-review.png](runs/run-20261115-001540/evidence/016-t002-review.png), [017-t002-confirmed.png](runs/run-20261115-001540/evidence/017-t002-confirmed.png), [027-t005-review-8-days.png](runs/run-20261115-001540/evidence/027-t005-review-8-days.png)
- *2026-11-15T01:01 (run-20261115-005911, version 1.4.2): open → retest-failed. Retest: still no discount at exactly 7 days; now seen twice (reproduction 2/2).* Evidence: [020-t020-review-7-days.png](runs/run-20261115-005911/evidence/020-t020-review-7-days.png)

### F-002: Cancelling a Reserved booking does not release its stock

- **Classification:** product-failure · **Severity:** critical · **Status:** retest-failed
- **Found:** run-20261115-001540, role manager, local, version 1.4.2
- **Tests:** T-006, T-009, T-019 · **Requirements:** BR-11, BR-09, BR-17
- **Expected:** Stock held by a booking is released as soon as it is Cancelled and Inventory reflects it immediately (Generator: reserved 0, available 6; dashboard units held 4)
- **Actual:** After a manager cancelled Reserved booking B-1007 (Generator x2), Inventory still shows Generator reserved 2 / available 4 and the dashboard still shows 6 units held, although no Reserved or On Hire booking for Generator exists
- **Steps:**
  1. Sign in as manager; create and confirm a booking for Generator 3kVA x2 (Inventory: reserved 2, available 4)
  2. Open the booking, Cancel booking, accept the confirmation: status Cancelled
  3. Open Inventory: Generator still reserved 2, available 4
- **Reproduction:** 1/1 so far; a second cancellation is planned on another line (see T-009)
- **Impact (observed):** 2 of 6 generators shown as unavailable with no live booking holding them; dashboard units held overstated by 2
- **Impact (reasoned):** Each cancelled reservation permanently removes units from availability, so later confirmations would be refused under BR-10 for stock that is actually free; undermines objective 1 (trustworthy availability)
- **Duplicate check:** Different from F-001 (pricing). Related to the dashboard value issue only in that both involve cancelled bookings; the dashboard total is wrong on seed data without any cancellation in this run, so it is filed separately
- **Evidence:** [039-t006-cancelled.png](runs/run-20261115-001540/evidence/039-t006-cancelled.png), [040-t006-inventory.png](runs/run-20261115-001540/evidence/040-t006-inventory.png), [041-t006-dashboard.png](runs/run-20261115-001540/evidence/041-t006-dashboard.png)
- *2026-11-15T00:22 (run-20261115-001540, version 1.4.2): open → confirmed. Reproduced on a second line (T-009): cancelling Reserved B-1008 left Cement mixer at reserved 1 / available 3. Reproduction now 2/2 on two equipment lines.* Evidence: [057-t009-b1008-cancelled.png](runs/run-20261115-001540/evidence/057-t009-b1008-cancelled.png), [058-t009-inventory.png](runs/run-20261115-001540/evidence/058-t009-inventory.png)
- *2026-11-15T00:28 (run-20261115-001540, version 1.4.2): confirmed → confirmed. Linked reproduction test T-009 to this finding.*
- *2026-11-15T01:00 (run-20261115-005911, version 1.4.2): confirmed → retest-failed. Retest on a third line (Pressure washer): stock still not released.* Evidence: [013-t019-inventory.png](runs/run-20261115-005911/evidence/013-t019-inventory.png)

### F-003: Dashboard 'Booked hire value' includes Cancelled bookings

- **Classification:** product-failure · **Severity:** medium · **Status:** retest-failed
- **Found:** run-20261115-001540, role manager, local, version 1.4.2
- **Tests:** T-001, T-006, T-017 · **Requirements:** BR-16
- **Expected:** Booked hire value = sum of hire charges of Reserved, On Hire and Returned bookings only (seed: £1,010.00)
- **Actual:** Seed dashboard shows £1,142.00 = £1,010.00 + £132.00 (Cancelled B-1004). After B-1007 (£448.00) was cancelled the value stayed at £1,590.00 instead of dropping to £1,142.00
- **Steps:**
  1. Sign in; compare Bookings list charges by status with Dashboard > Booked hire value
- **Reproduction:** 2/2: seed data on two loads, and again after cancelling B-1007
- **Impact (observed):** Committed business overstated by £132.00 on seed data and by £580.00 after one cancellation
- **Impact (reasoned):** Managers reading the dashboard overestimate committed revenue; grows with every cancellation (objective 4)
- **Duplicate check:** Separate from F-002: that is about units, this about value, and this one shows on untouched seed data. Draft bookings are correctly excluded (value did not move when Drafts B-1008/B-1009 were created)
- **Evidence:** [009-t001-dashboard-seed.png](runs/run-20261115-001540/evidence/009-t001-dashboard-seed.png), [005-bookings-list-seed.png](runs/run-20261115-001540/evidence/005-bookings-list-seed.png), [041-t006-dashboard.png](runs/run-20261115-001540/evidence/041-t006-dashboard.png)
- *2026-11-15T00:32 (run-20261115-003018, version 1.4.2): open → open. Seen again after the fixture restart (re-seeded data, version 1.4.2): dashboard Booked hire value GBP 1,142.00 with the same seed bookings (Reserved+On Hire+Returned = GBP 1,010.00, Cancelled B-1004 GBP 132.00). Status unchanged; this was a resume spot-check, not a planned retest.* Evidence: [004-signed-in-manager.png](runs/run-20261115-003018/evidence/004-signed-in-manager.png), [008-t013-bookings-after-rate.png](runs/run-20261115-003018/evidence/008-t013-bookings-after-rate.png)
- *2026-11-15T00:59 (run-20261115-005911, version 1.4.2): open → retest-failed. Retest: still £1,142.00 on freshly seeded data.* Evidence: [004-t017-dashboard-seed.png](runs/run-20261115-005911/evidence/004-t017-dashboard-seed.png)

### F-004: Changing the deposit rate alters the deposit of an already Reserved booking

- **Classification:** product-failure · **Severity:** high · **Status:** retest-failed
- **Found:** run-20261115-001540, role manager, local, version 1.4.2
- **Tests:** T-007, T-018 · **Requirements:** BR-05
- **Expected:** The deposit and its rate are fixed when the reservation is confirmed; later deposit-rate changes do not alter Reserved, On Hire or Returned bookings (B-1006 stays £8.80 at 20%)
- **Actual:** After the manager changed the deposit rate from 20 to 30, Reserved booking B-1006 shows 'Deposit (30%) £13.20' instead of 'Deposit (20%) £8.80'
- **Steps:**
  1. Sign in as manager; open Reserved booking B-1006: Deposit (20%) £8.80
  2. Settings: set Deposit rate to 30, Save settings
  3. Open B-1006 again: Deposit (30%) £13.20
- **Reproduction:** 1/1 on a Reserved booking, with before and after screenshots; not repeated because each repeat changes a global setting
- **Impact (observed):** A confirmed customer's deposit rose by £4.40 without any action on the booking
- **Impact (reasoned):** Every open reservation is repriced whenever the rate is changed; contradicts objective 2 (a quoted price does not change afterwards)
- **Duplicate check:** Not related to F-001..F-003: pricing of hire charge is unaffected, only the deposit of confirmed bookings moves with the setting
- **Evidence:** [043-t007-b1006-before.png](runs/run-20261115-001540/evidence/043-t007-b1006-before.png), [048-t007-b1006-after.png](runs/run-20261115-001540/evidence/048-t007-b1006-after.png), [046-t007-settings-saved.png](runs/run-20261115-001540/evidence/046-t007-settings-saved.png)
- *2026-11-15T00:22 (run-20261115-001540, version 1.4.2): open → open. Narrowed (T-010): B-1003 showed Deposit (30%) £21.60 while Reserved, then (20%) £14.40 once On Hire and Returned. So a deposit fixed at 20% is stored, but the Reserved view recalculates at the current rate. Second Reserved booking showing the fault: reproduction 2/2.* Evidence: [060-t010-b1003-reserved.png](runs/run-20261115-001540/evidence/060-t010-b1003-reserved.png), [061-t010-on-hire.png](runs/run-20261115-001540/evidence/061-t010-on-hire.png)
- *2026-11-15T01:00 (run-20261115-005911, version 1.4.2): open → retest-failed. Retest: still reproduces (8.80 -> 13.20).* Evidence: [011-t018-b1006-after.png](runs/run-20261115-005911/evidence/011-t018-b1006-after.png)

### F-005: A Draft can be confirmed for a customer who has since been placed on hold

- **Classification:** suspected-defect · **Severity:** medium · **Status:** suspected
- **Found:** run-20261115-001540, role manager, local, version 1.4.2
- **Tests:** T-008 · **Requirements:** BR-08
- **Expected:** Confirmation refused with an explanation while the customer is On hold (reasoned from objective 3; the FSD does not say)
- **Actual:** Draft B-1008 for Mrs J. Whitcombe was confirmed to Reserved minutes after she was placed on hold; no message mentioned the hold
- **Steps:**
  1. As manager, have a Draft for an Active customer
  2. Customers: Place hold on that customer
  3. Open the Draft > Review and confirm > Confirm reservation: becomes Reserved
- **Reproduction:** 1/1; not repeated (budget)
- **Impact (observed):** New committed business (£201.60, 1 unit held) created for a customer on hold
- **Impact (reasoned):** A clerk could prepare Drafts before a hold, or keep confirming old Drafts, defeating credit control. If the owner intends holds to affect only brand-new bookings, this is not a defect
- **Uncertainty:** Depends on the answer to Q1
- **Duplicate check:** No other finding concerns customer hold
- **Evidence:** [052-t008-hold-placed.png](runs/run-20261115-001540/evidence/052-t008-hold-placed.png), [056-t008-confirm-held-customer.png](runs/run-20261115-001540/evidence/056-t008-confirm-held-customer.png)

### F-006: A Clerk can release a customer hold

- **Classification:** product-failure · **Severity:** high · **Status:** retest-failed
- **Found:** run-20261115-001540, role clerk, local, version 1.4.2
- **Tests:** T-011, T-021 · **Requirements:** BR-13
- **Expected:** Only a Manager may place or release a hold; a clerk's attempt is refused with an access denied message and changes nothing
- **Actual:** The Customers page offers the clerk a 'Release hold' button for each held customer; clicking it for Kestrel Property Services answered 'Hold released for Kestrel Property Services.' and the account became Active. ('Place hold' is correctly not offered.)
- **Steps:**
  1. Sign in as tom (Clerk)
  2. Customers: a customer with status On hold shows 'Release hold on <name>'
  3. Click it and accept: status message, account status Active
- **Reproduction:** 1/1; a second release (Mrs J. Whitcombe) is planned if budget allows
- **Impact (observed):** A customer placed on hold by the manager was made Active by a clerk
- **Impact (reasoned):** Any clerk can undo the manager's credit-control decision and then take new bookings for that customer (objective 3)
- **Duplicate check:** Different mechanism from F-005 (that is about confirming Drafts while a hold stands)
- **Evidence:** [072-t011-clerk-customers.png](runs/run-20261115-001540/evidence/072-t011-clerk-customers.png), [075-t011-clerk-release-hold.png](runs/run-20261115-001540/evidence/075-t011-clerk-release-hold.png)
- *2026-11-15T01:02 (run-20261115-005911, version 1.4.2): open → retest-failed. Retest: clerk released the hold again (reproduction 2/2 across runs).* Evidence: [026-t021-clerk-release.png](runs/run-20261115-005911/evidence/026-t021-clerk-release.png)
