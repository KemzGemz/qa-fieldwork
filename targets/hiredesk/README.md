# Tallyard HireDesk

Target `hiredesk`. Generated from this target's records by the tools. Do not edit: change the records and the view follows.

## Application and environment

- **Start URL:** http://127.0.0.1:8791/
- **Environment:** local
- **Version last observed:** 1.4.2 (run-20261115-005911)
- **Roles:** manager, clerk
- **Permissions:** data changes allowed; destructive actions not allowed
- **Requirements:** [FSD.md](requirements/source/FSD.md)

## Latest run

- **Run:** run-20261115-005911 · mode retest · closed
- **When:** started 2026-11-15 00:59, ended 2026-11-15 01:02
- **Role at the end:** clerk · **Environment:** local
- **Budget:** 26 of 36 browser actions
- **Focus:** Retest F-001, F-002, F-003, F-004, F-006 after the tools and the fixture were ported to TypeScript (application re-seeded)
- **Tests:** fail 5
- **Report:** [reports/run-20261115-005911.md](reports/run-20261115-005911.md)

All runs (3), oldest first:

- run-20261115-001540 · default · closed · 2026-11-15 00:15 · 92/110 actions · tests: fail 6, not-run 1, pass 4, suspected 1 · [report](reports/run-20261115-001540.md)
- run-20261115-003018 · resume · closed · 2026-11-15 00:30 · 21/25 actions · tests: pass 4 · [report](reports/run-20261115-003018.md)
- run-20261115-005911 · retest · closed · 2026-11-15 00:59 · 26/36 actions · tests: fail 5 · [report](reports/run-20261115-005911.md)

## Findings (6)

By classification: product-failure 5, suspected-defect 1. By status: retest-failed 5, suspected 1.

| Finding | Severity | Classification | Status | Title |
|---|---|---|---|---|
| F-001 | high | product-failure | retest-failed | No weekly discount on a hire of exactly 7 chargeable days |
| F-002 | critical | product-failure | retest-failed | Cancelling a Reserved booking does not release its stock |
| F-003 | medium | product-failure | retest-failed | Dashboard 'Booked hire value' includes Cancelled bookings |
| F-004 | high | product-failure | retest-failed | Changing the deposit rate alters the deposit of an already Reserved booking |
| F-005 | medium | suspected-defect | suspected | A Draft can be confirmed for a customer who has since been placed on hold |
| F-006 | high | product-failure | retest-failed | A Clerk can release a customer hold |

Details, evidence and history: [FINDINGS.md](FINDINGS.md).

## Coverage (20 areas)

| not-covered | deferred | partial | covered |
|---|---|---|---|
| 4 | 1 | 4 | 11 |

Not fully covered:

- Inventory: rate change vs existing and new bookings (partial)
- Booking form validation (partial)
- Settings validation (not-covered)
- Pricing: 6-day boundary and rounding (not-covered)
- Max hire length reduced with longer Draft existing (not-covered)
- Clerk workflow parity (partial)
- Sign-in and session (partial)
- Double submit, Back and reload after actions (not-covered)
- Concurrency: two users on the same booking or last unit (deferred)

Notes and tests per area: [COVERAGE.md](COVERAGE.md).

## Open questions and blockers

- **Q1** When a customer is placed On hold, should confirming their existing Draft bookings be refused?
- **Q2** If the maximum hire length is reduced, may an existing longer Draft still be confirmed?
- **Q3** Are start dates in the past allowed?
- **Q4** Which values are valid for a daily rate (zero, negative, pence precision)?
- **Q5** Should existing bookings of a held customer still be checked out and returned?

Source: [knowledge/questions.md](knowledge/questions.md).

No blockers recorded.

## Next action

Restart the fixture to re-seed, run tools/target.ts check, confirm version 1.4.2 in the footer. Then in priority order: (1) consequence of F-002: confirm a Mini digger booking (stock 1), cancel it as manager, then check whether a new Mini digger confirmation is refused; (2) BR-06 mandatory fields and quantity 0 / fraction; (3) invalid daily rates (Q4); (4) clerk end-to-end booking; (5) sign-in and session checks. Get an answer to Q1 before reclassifying F-005.

Recorded 2026-11-15 01:02 in run-20261115-005911. State then: Retest run on version 1.4.2 after the tools and fixture were ported to TypeScript: F-001, F-002, F-003, F-004 and F-006 all reproduce (retest-failed). F-005 not retested (waits on Q1). Application data is modified; restart the fixture (npm run fixture:hiredesk) to re-seed.

## Navigate

- [System model](knowledge/system-model.md): screens, entities, relationships, workflows
- [Findings](FINDINGS.md) · [Coverage](COVERAGE.md) · [Handover](HANDOVER.md)
- Latest report: [reports/run-20261115-005911.md](reports/run-20261115-005911.md)
- Knowledge: [scope](knowledge/scope.md) · [requirements](knowledge/requirements.md) · [questions](knowledge/questions.md) · [test data](knowledge/test-data.md)
- Run records and evidence: `runs/<run-id>/` (`tests.json`, `actions.jsonl`, `journal.jsonl`, `evidence/`, `observations/`)

## Files

| Path | Role | What it is |
|---|---|---|
| `target.yaml` | authoritative | URL, environment, roles, scope, permissions. Edited by hand. |
| `knowledge/*.md` | authoritative | Reusable understanding: scope, requirements, system model, questions, test data. Edited by hand. |
| `requirements/source/, requirements/manifest.json` | authoritative | The requirement documents and their hashes. Written by `target.ts add-requirements`. |
| `findings.json, coverage.json` | authoritative | Findings and coverage, with history. Written by `records.ts`. |
| `handover.json, handover-history.jsonl` | authoritative | Latest checkpoint and every earlier one. Written by `records.ts checkpoint`. |
| `runs/<run-id>/run.json, tests.json, actions.jsonl, journal.jsonl` | authoritative | One run's history. Written by `records.ts` and `browser.ts`; never rewritten by later runs. |
| `runs/<run-id>/evidence/, observations/` | authoritative | Screenshots and page observations: the evidence behind verdicts. Written by `browser.ts`. |
| `README.md, FINDINGS.md, COVERAGE.md, HANDOVER.md` | generated | Views of the records above, rebuilt after every `records.ts`, `target.ts` and `report.ts` command. |
| `reports/<run-id>.md` | generated | One run's report, rebuilt by `report.ts --target <id> [--run <run-id>]`. |
| `.local/` | local | Accounts, browser endpoint, last observation. Git-ignored; never committed. |
