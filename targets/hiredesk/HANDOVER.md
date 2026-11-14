# Handover: hiredesk

From `handover.json`. Generated from this target's records by the tools. Do not edit: change the records and the view follows. Overview: [README.md](README.md).

A fresh session starts with `npx tsx tools/target.ts status --target hiredesk`, then reads `knowledge/`.

- **Saved:** 2026-11-15T01:02:16+08:00 · run run-20261115-005911 · version 1.4.2 · 26/36 actions
- **State:** Retest run on version 1.4.2 after the tools and fixture were ported to TypeScript: F-001, F-002, F-003, F-004 and F-006 all reproduce (retest-failed). F-005 not retested (waits on Q1). Application data is modified; restart the fixture (npm run fixture:hiredesk) to re-seed.
- **Next action:** Restart the fixture to re-seed, run tools/target.ts check, confirm version 1.4.2 in the footer. Then in priority order: (1) consequence of F-002: confirm a Mini digger booking (stock 1), cancel it as manager, then check whether a new Mini digger confirmation is refused; (2) BR-06 mandatory fields and quantity 0 / fraction; (3) invalid daily rates (Q4); (4) clerk end-to-end booking; (5) sign-in and session checks. Get an answer to Q1 before reclassifying F-005.
- **Blockers:** none
- **Open questions:** Q1 to Q5 in knowledge/questions.md; Q1 decides F-005
- **Latest report:** [reports/run-20261115-005911.md](reports/run-20261115-005911.md)
