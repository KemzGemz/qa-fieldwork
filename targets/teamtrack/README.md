# TeamTrack demo

Target `teamtrack`. Generated from this target's records by the tools. Do not edit: change the records and the view follows.

## Application and environment

- **Start URL:** http://127.0.0.1:8767/
- **Environment:** local
- **Version last observed:** not observed
- **Roles:** none recorded
- **Permissions:** data changes allowed; destructive actions not allowed
- **Requirements:** [rules.md](requirements/source/rules.md)

## Latest run

- **Run:** run-20261115-002834 · mode default · closed
- **When:** started 2026-11-15 00:28, ended 2026-11-15 00:29
- **Role at the end:** project manager · **Environment:** local
- **Budget:** 6 of 15 browser actions
- **Focus:** isolation check: one rule-based test
- **Tests:** fail 1
- **Report:** [reports/run-20261115-002834.md](reports/run-20261115-002834.md)

## Findings (1)

By classification: product-failure 1. By status: open 1.

| Finding | Severity | Classification | Status | Title |
|---|---|---|---|---|
| F-001 | medium | product-failure | open | Duplicate project name accepted (differs only in case) |

Details, evidence and history: [FINDINGS.md](FINDINGS.md).

## Coverage (1 area)

| partial |
|---|
| 1 |

Not fully covered:

- Projects: create (R1-R3) (partial)

Notes and tests per area: [COVERAGE.md](COVERAGE.md).

## Open questions and blockers

No unanswered question in [knowledge/questions.md](knowledge/questions.md).

No blockers recorded.

## Next action

Read requirements/source/rules.md into knowledge/requirements.md, explore Reports, Settings and the viewer account, then test R1 and R3 and role differences.

Recorded 2026-11-15 00:29 in run-20261115-002834. State then: Isolation-check run: one test, one finding (F-001). Knowledge files are still templates; requirements not yet extracted into knowledge/requirements.md.

## Navigate

- [System model](knowledge/system-model.md): screens, entities, relationships, workflows
- [Findings](FINDINGS.md) · [Coverage](COVERAGE.md) · [Handover](HANDOVER.md)
- Latest report: [reports/run-20261115-002834.md](reports/run-20261115-002834.md)
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
