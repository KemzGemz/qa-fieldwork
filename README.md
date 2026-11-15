# qa-fieldwork

A Claude Code workspace for black-box QA of running web applications. Given a target ID, a URL and
(optionally) an FSD, the active Claude Code session reads the requirements, explores the application
in a browser, builds a system model, decides what deserves testing, records each expected result and
its basis, executes the tests, investigates surprises, and reports findings and coverage. Everything
it learns is saved per target so a fresh session can continue.

The session does the reasoning. The repository supplies a skill (the procedure), references
(heuristics and guidance), and small TypeScript tools that drive the browser, capture evidence and
keep records. No model API or separate reasoning engine is used.

## Setup

Requirements: Claude Code and Node.js 20 or later (Windows, macOS or Linux).

```bash
npm install
```

```bash
npx playwright install chromium
```

```bash
npm run check
```

`npm run check` runs the type check and the unit tests. The tools are TypeScript executed directly
with `tsx`; there is no build step.

Open the repository in Claude Code. The skill is at `.claude/skills/qa-investigation/`; type `/` to
see `qa-investigation` in the list (run `/reload-skills` if the session was open before the folder
existed).

## Starting an investigation

In Claude Code, with an FSD and a URL:

```
/qa-investigation billing-portal https://staging.example.com/app docs/Billing-FSD.pdf budget=150 focus=invoicing,refunds
```

Plain language works too:

```
Test target billing-portal at https://staging.example.com/app against docs/Billing-FSD.pdf.
Roles: accountant and approver (accounts are in targets/billing-portal/.local/accounts.yaml).
Staging; data changes allowed, nothing destructive. Leave the admin area out. Budget 150 actions.
```

Without requirements (Claude works from observed purpose, domain knowledge and stated assumptions):

```
/qa-investigation partner-site https://test.partner.example/ budget=80
```

Discovery only (understanding and candidate tests, no data-changing execution):

```
/qa-investigation billing-portal https://staging.example.com/app docs/Billing-FSD.pdf mode=discovery
```

Inputs it accepts: target ID, start URL, FSD and related documents, test accounts or an already
signed-in browser, environment and permitted actions, included and excluded areas, a budget, focus
areas. If no budget is given the default is 120 browser actions with 15% reserved for reporting
(`tools/defaults.yaml`, overridable per target in `target.yaml`).

### Test accounts

Put test credentials in `targets/<id>/.local/accounts.yaml` (git-ignored; template:
`templates/accounts.example.yaml`). The browser tool fills them with `--secret role.field` and
never prints or logs the value. To use a browser you signed in to yourself, start it with
`--remote-debugging-port=9222` and tell Claude to attach to `http://127.0.0.1:9222`.

## One worktree per application

`main` holds only the workspace: tools, skill, references, templates, tests, fixtures and docs. It
never holds `targets/<id>/`. Each application under test lives on its own branch, `sut/<target-id>`,
checked out as a Git worktree in a sibling folder. A branch is `main` plus that application's
`targets/<id>/`, so records and evidence accumulate there and `main` stays small.

Start a new application (run from the main checkout):

```bash
git worktree add ../qa-fieldwork-billing-portal -b sut/billing-portal main
```

Then open that folder in Claude Code and install its dependencies once:

```bash
npm install
```

Work on an application that already has a branch:

```bash
git worktree add ../qa-fieldwork-hiredesk sut/hiredesk
```

Day to day:

- **Records are committed on the SUT branch**, in that worktree. Commit after a run so the handover,
  findings and evidence are saved together.
- **Tool and skill updates** reach an application by merging `main` into its branch:
  `git merge main` in the worktree.
- **Improvements made while testing** (a tool fix, a skill edit, a proposed lesson in
  `references/lessons-proposed.md`) belong on `main`. Bring them back with a change that touches
  only the shared files, never `targets/`. Lessons keep their provenance line, so `main` records
  which application a lesson came from without holding that application's data.
- **Local state is per worktree**: `targets/<id>/.local/` (accounts, browser endpoint) is ignored by
  Git, and the browser profile is keyed by the worktree's path.
- `target.ts init` refuses to create a target on `main` and prints the worktree command instead.
- Remove a finished worktree with `git worktree remove ../qa-fieldwork-<id>`; the branch keeps the
  records.

The acceptance runs of this workspace are kept the same way: `sut/hiredesk` (the blind acceptance
run, a resume run and a retest run against `fixtures/acceptance-app`) and `sut/teamtrack` (the
isolation check against `fixtures/teamtrack`).

## Switching targets and resuming

Open the application's worktree and name the target every time:

```
/qa-investigation hiredesk mode=resume
```

```
Resume target teamtrack at http://127.0.0.1:8767/ with a budget of 40.
```

```
/qa-investigation hiredesk mode=retest F-002 F-004
```

On resume, Claude loads the target's status, checks that the URL and environment belong to it,
looks for changed requirement documents and a changed application version, and continues from the
recorded next action. The same from a terminal, in the worktree:

```bash
npx tsx tools/target.ts list
```

```bash
npx tsx tools/target.ts status --target hiredesk
```

```bash
npx tsx tools/target.ts check --target hiredesk --url http://127.0.0.1:8791/
```

`check` exits with code 3 on a mismatch (wrong origin, different environment, changed requirement
file) and names the target that origin belongs to, if any.

## Where things are saved

Everything for one application is under `targets/<id>/`, on that application's branch. Start reading at
`targets/<id>/README.md`: it is the overview of the target, with the application and environment, the
latest run, finding and coverage counts, open questions and blockers, the next action, and links to
the system model, findings, coverage and the latest report.

### Authoritative records

These hold the state. People and tools change these, and nothing else.

| Path | Content | Changed by |
|---|---|---|
| `target.yaml` | URL, environment, roles, scope, permissions, per-target settings | hand |
| `knowledge/scope.md`, `requirements.md`, `system-model.md`, `questions.md`, `test-data.md` | reusable understanding: business purpose, extracted requirements with IDs, entities/states/workflows/dependencies with their status (documented, observed, hypothesized), assumptions and open questions, test data | hand (Claude or you) |
| `requirements/source/`, `requirements/manifest.json` | the requirement documents and their hashes (changes are flagged on resume) | `target.ts add-requirements` |
| `findings.json`, `coverage.json` | findings and coverage by area, each with its history | `records.ts` |
| `handover.json`, `handover-history.jsonl` | the latest checkpoint and every earlier one | `records.ts checkpoint` |
| `runs/<run-id>/run.json`, `tests.json`, `actions.jsonl`, `journal.jsonl` | one run's history: tests with expectation, basis, revisions and result; every browser action with role, environment, version and test ID; notes | `records.ts`, `browser.ts` |
| `runs/<run-id>/evidence/`, `observations/` | screenshots and full page observations: the evidence verdicts and findings point to | `browser.ts` |

### Generated views

These are rebuilt from the records above and are never read back by the tools. Do not edit them: a
hand edit is overwritten at the next refresh.

| Path | Built from | Refreshed |
|---|---|---|
| `README.md` | `target.yaml`, runs, `findings.json`, `coverage.json`, `handover.json`, `knowledge/questions.md`, the requirements manifest | after every `records.ts` command, and by `target.ts init`, `status`, `add-requirements` and `report.ts` |
| `FINDINGS.md`, `COVERAGE.md`, `HANDOVER.md` | `findings.json`, `coverage.json`, `handover.json` | same |
| `reports/<run-id>.md` | that run's records plus findings, coverage and handover | `report.ts --target <id> [--run <run-id>]` |
| `stakeholder-report/report.html` and a PDF | all open findings, test counts and coverage of the target, worded by the tester's `report-brief.yaml` | `report.ts --target <id> --stakeholder` |

After editing `target.yaml` or a knowledge file by hand, run `npx tsx tools/target.ts status --target <id>`
to bring the overview up to date. Open questions are read from the questions table in
`knowledge/questions.md`: a question is open while its Answer cell is empty.

### Local only

`targets/<id>/.local/` holds accounts, the browser endpoint, the active-run marker and the last
observation. It is git-ignored. The browser profile (cookies, sessions) is kept outside the
repository, under `%LOCALAPPDATA%\qa-fieldwork\<target>-<hash>` (or `~/.cache/qa-fieldwork/`).

## What goes where in Git

| Group | Paths | Branch | Commit? |
|---|---|---|---|
| Reusable source | `tools/`, `tests/`, `templates/`, `.claude/skills/qa-investigation/`, `CLAUDE.md`, `README.md`, `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`, `targets/.gitkeep` | `main` | Yes. This is the workspace itself. |
| Acceptance fixtures | `fixtures/acceptance-app/` (`app.ts`, `docs/`, `SEALED/answer-key.md`), `fixtures/teamtrack/` (`app.ts`, `rules.md`) | `main` | Yes. They let anyone re-run the acceptance check. The passwords in them belong to the local practice app only. |
| Target records: authoritative | `targets/<id>/`: `target.yaml`, `knowledge/`, `requirements/`, `findings.json`, `coverage.json`, `handover.json`, `handover-history.jsonl`, and per run `run.json`, `tests.json`, `actions.jsonl`, `journal.jsonl` | `sut/<id>` | Yes. The saved understanding and the execution history. |
| Target records: evidence | `targets/<id>/runs/*/evidence/` (screenshots) and `observations/` (page records) | `sut/<id>` | Yes by default. Findings and test results link to these files; without them a run cannot be assessed. |
| Target records: generated views | `targets/<id>/README.md`, `FINDINGS.md`, `COVERAGE.md`, `HANDOVER.md`, `reports/*.md` | `sut/<id>` | Yes. They can always be regenerated, but committing them lets a reader browse a target on GitHub without running anything. |
| Transient | `node_modules/`, `targets/*/.local/`, `*.tmp`, logs, Playwright output, OS clutter | none | No. Covered by `.gitignore`. |

Run artifacts grow with every run: roughly 30 to 45 KB per browser step for a screenshot plus an
observation (the three `hiredesk` runs came to about 4.5 MB). Because they live on the SUT branch,
that growth never reaches `main`. Two rules of thumb:

- For a practice or acceptance target, commit everything: the evidence is the point.
- For a real application, decide per target. If its screens show confidential data, add that
  target's `runs/*/evidence/` and `runs/*/observations/` to `.gitignore` on its branch (the file has
  a commented example) and keep the JSON records and reports, accepting that evidence links will
  only work where the local files exist. If a branch gets large, move `*.png` under `targets/` to
  Git LFS rather than deleting evidence.

## Tools

All take `--target <id>` and refuse paths outside that target. `<tool> <command> --help` lists every
option.

| Tool | What it does |
|---|---|
| `tools/target.ts` | `list`, `init`, `status`, `check`, `add-requirements` |
| `tools/browser.ts` | `launch` / `attach`, `open`, `observe`, `act` (click, fill, select, check, uncheck, press, hover, back, reload), `text`, `shot`, `eval` (read-only), `frame` (read and act inside embedded frames), `viewport` (phone and tablet widths), `diagnose`, `close`. One Chromium, one tab, re-attached on every call; bounded waits; an observation and screenshot after every action; stall diagnosis |
| `tools/records.ts` | runs, role and version checks, notes, tests (`test-plan` → `test-start` → `test-result`, `test-revise`), findings, coverage, `checkpoint`, `lesson` |
| `tools/report.ts` | renders the run report, refreshes the generated views, and checks the records; `--stakeholder` writes a findings report for people outside testing as HTML and PDF |

Rules the tools enforce: a verdict needs an expectation recorded before it; `pass`/`fail`/`suspected`
need logged browser activity and evidence files; `fail` needs a requirement, confirmed rule or
invariant as basis (otherwise `suspected`); a revised expectation keeps the original; evidence must
belong to the same target; destructive-looking controls are refused unless `target.yaml` allows them;
the action budget is counted and enforced.

## Code structure

```
CLAUDE.md                                   orientation and operating rules for the session
.claude/skills/qa-investigation/SKILL.md    the procedure
.claude/skills/qa-investigation/references/ heuristics, expectations and verdicts, domain guidance,
                                            browser operation, field lessons (loaded when needed)
tools/
  target.ts  browser.ts  records.ts  report.ts   command-line entry points: parse arguments, call lib, print
  defaults.yaml                                  defaults every target can override
  lib/
    core/      errors.ts   ToolError, exit codes, CLI wrapper
               paths.ts    target id validation, the "inside this target" check
               store.ts    JSON / JSONL files, timestamps, small helpers
               config.ts   defaults.yaml + target.yaml, validated
               git.ts      the branch rule: no target records on main
    schemas/   run.ts test.ts finding.ts coverage.ts handover.ts   zod schema + inferred type per record
    records/   runs.ts tests.ts findings.ts coverage.ts handover.ts   the record rules
    browser/   session.ts  launch / attach / one call's connection, secrets, scope
               aria.ts     accessibility-snapshot parser
               page-script.ts   what is read inside the page (fields, tables, loaders)
               observe.ts  capture and print an observation
               actions.ts  open, act, text, screenshot, eval; budget and action log
               stall.ts, request-tracker.ts   stall probes and decision table
    target/    admin.ts    init, status, check, requirements
    report/    check.ts    integrity check of the records
               render.ts   Markdown for reports, findings, coverage (pure functions)
               views.ts    writes the generated views, including the target overview
tests/                                      node:test unit tests (record rules, isolation, generated views, parser, stall table)
templates/target/                           what a new target starts with
templates/accounts.example.yaml             template for a target's .local/accounts.yaml
templates/report/                           stakeholder report: stylesheet and an example report-brief.yaml
targets/                                    empty on main; one directory per application on its sut/<id> branch
fixtures/                                   local practice applications (see below)
```

Conventions: entry points stay thin; library functions take a typed input object and return the
lines to print, so they can be unit-tested without a process; a refusal is a thrown `ToolError`;
every record on disk has a zod schema, and its TypeScript type is inferred from that schema; field
names inside record files are `snake_case` because they are data, while code is `camelCase`.

Dependencies: `playwright` (browser), `commander` (arguments), `zod` (record schemas), `yaml`
(configuration), `unpdf` (text from PDF requirements). Development: `typescript`, `tsx`,
`@types/node`.

## Fixtures

- `fixtures/acceptance-app/` (Tallyard HireDesk): written by a separate agent for the blind
  acceptance check. `docs/FSD.md` and `docs/test-accounts.md` are the inputs; `SEALED/answer-key.md`
  lists its seeded defects. Start with `npm run fixture:hiredesk` (port 8791); a restart re-seeds.
- `fixtures/teamtrack/`: the demo application from the earlier `qa-pipeline` repository, with its
  `rules.md`. Start with `npm run fixture:teamtrack` (port 8767).

Both use only the Node standard library. An investigating session must not read a fixture's
`app.ts` or `SEALED/` folder.

## What came from qa-pipeline

The earlier Python helper was the reference. Carried over, after checking what had actually run
there: the accessibility-snapshot parser, field and table extraction, bounded settling and
click-first navigation (from `qahelper/browser.py`); the stall decision table (from
`qahelper/resilience.py`); the CDP-attach, one-tab, click-only way of working from the competition
scripts (`targets/meja-marmar/tab.py`, `probe.py`); the expectation-before-execution and
confirmed-versus-suspected rules; the layered effect check and the knowledge packs, as reference
text; and the lessons in that event's summary. These were first ported to Python tools here, then
rewritten in TypeScript; nothing in this repository runs Python.

Not carried over: `qahelper/brain/` and the explorer, planner, executor and effects modules built
around it, because they need either the Anthropic API or the offline heuristic stand-in to do the
reasoning that the session now does. PDF report building was not ported.

## Limitations

- Concurrent scenarios (two users at the same moment) are not supported; they are recorded as
  deferred coverage.
- One browser tab and one signed-in user at a time; role changes are sequential.
- Console and network errors are captured during each command, not between commands.
- Server-side enforcement can only be tested through visible controls or an explicit, justified
  typed address; hidden-control cases are recorded as limitations.
- Chromium only. Reports are Markdown.
- The unit tests cover the record rules, isolation, the snapshot parser and the stall table. The
  parts that need a live browser (launch, observe, act) are verified by running them, not by tests.
- In Git Bash on Windows, pass relative paths to `browser.ts open --url` without a leading slash.
