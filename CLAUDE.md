# qa-fieldwork

A workspace in which the active Claude Code session does QA fieldwork on running web applications:
it reads the requirements, explores the application in a browser, decides what to test, records
expectations, executes tests, investigates surprises, and reports. The session does the reasoning;
`tools/` only drives the browser and keeps records. No other model or API is used.

## Entry point

Use the `qa-investigation` skill for any testing, exploring, resuming or retesting request:

```
/qa-investigation <target-id> <url> <fsd paths...> [mode=default|discovery|resume|retest] [budget=N] [focus=...]
```

The procedure, record rules and completion criteria are in `.claude/skills/qa-investigation/SKILL.md`;
its `references/` are loaded only when a step needs them.

## Operating rules

1. **Explicit target, always.** Every investigation names a target ID and every tool call passes
   `--target <id>`. Never infer the target from the last one used. If none is given, run
   `tools/target.ts list` and ask.
2. **Check before acting.** `tools/target.ts status` then `tools/target.ts check --url ...` at the
   start of every session. A mismatch (exit code 3) is resolved before any browser action or record
   update.
3. **One worktree per application.** `main` never holds `targets/<id>/`. Each application lives on its
   own branch `sut/<id>`, checked out as a worktree (`git worktree add ../qa-fieldwork-<id> -b sut/<id> main`,
   then `npm install` in the new folder).
   Before creating or updating a target, check the branch (`git branch --show-current`): on `main`,
   stop and tell the user to open or create the worktree. Changes to shared files (`tools/`, the skill,
   `references/`, `templates/`) made while testing go back to `main` separately, without `targets/`.
4. **Stay inside the target.** Read and write only `targets/<id>/`. Another target is read only when
   the task explicitly requires it. Never carry one application's rules into another.
5. **Requirements and the browser are the only sources about the application.** Do not read a
   target's source code, database or any answer key (for the bundled fixtures: never open
   `fixtures/*/app.ts` or `fixtures/*/SEALED/` during an investigation).
6. **Expectation before verdict.** `records.ts test-plan` precedes execution; observed behaviour is
   not a basis for correctness; revisions keep the original.
7. **Only executed tests are marked executed.** The tools refuse verdicts without logged browser
   activity and evidence. Do not work around a refusal.
8. **Secrets stay out of records.** Credentials live in `targets/<id>/.local/accounts.yaml`
   (git-ignored) and are entered with `--secret`. Never put them in knowledge files, notes, reports
   or command lines.
9. **Destructive or shared-data actions need the user's approval**, recorded in the target's
   `knowledge/scope.md` and `target.yaml`. A harmless control that the word guard misreads is allowed
   by name (`permissions.destructive_allow`) with the reason in `scope.md`; that is not an approval
   to destroy anything.
10. **Save as you go.** Knowledge files, coverage and `records.ts checkpoint` are updated during the
   run, and part of the budget is kept for reporting.
11. **Look, then claim.** A screen is reviewed when its screenshot was read, a state is permanent
   when it was rechecked later, and an area is covered when the coverage note says how. Do not report
   UI/UX, mobile or accessibility as covered on measurements alone.
12. **The shared framework has a version.** Each run records the commit of the shared files it was
   made with (`run.json`, `framework`). Improvements to shared files are made on `main` and reach a
   target by merging `main` into its `sut/<id>` branch.

## Selecting and resuming a target

```
npx tsx tools/target.ts list
npx tsx tools/target.ts status --target <id>     # config, knowledge, runs, findings, NEXT ACTION
npx tsx tools/target.ts check  --target <id> --url <url>
```

To resume: run the three commands above, read `targets/<id>/HANDOVER.md`, `knowledge/` and the latest
file in `reports/`, check what changed (requirement hashes, application version, environment), then
`records.ts run-start --target <id> --mode resume` and continue from the recorded next action.

## Layout

- `tools/`: `target.ts`, `browser.ts`, `records.ts`, `report.ts` (thin command-line entry points; `--help` on each),
  `defaults.yaml`, and `lib/` (the implementation: `core`, `schemas`, `records`, `browser`, `target`, `report`).
- `tests/`: unit tests for the record rules and the browser-free parts (`npm test`; `npm run typecheck`).
- `templates/target/`: what a new target starts with. `templates/report/`: the stakeholder report's
  stylesheet and an example `report-brief.yaml`.
- `targets/<id>/` (only on that application's `sut/<id>` branch): authoritative records are `target.yaml`, `knowledge/` (reusable understanding),
  `requirements/`, `findings.json`, `coverage.json`, `handover.json` and `runs/<run-id>/` (actions,
  observations, evidence, tests: run-specific history). `README.md` (the target overview),
  `FINDINGS.md`, `COVERAGE.md`, `HANDOVER.md` and `reports/` are generated views: never edit them or
  use them as a source; the tools rebuild them from the records. `report-brief.yaml` (the tester's
  wording for the stakeholder report) is yours to write; `stakeholder-report/` is generated from it.
- `fixtures/`: local practice applications. Their code and sealed answer keys are off limits while
  investigating them.

The tools are TypeScript run with `tsx` (no build step). Node 20 or later.
