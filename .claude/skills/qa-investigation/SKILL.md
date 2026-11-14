---
name: qa-investigation
description: Investigate and test a running web application as an experienced QA tester would - read the FSD, explore the app in a browser, build a system model, design and prioritise tests, record expectations before executing, run the tests, investigate unexpected results, and report findings and coverage per target. Use when asked to test, QA, explore, resume or retest an application given a target ID and URL (requirements optional).
when_to_use: Requests such as "test this app against the FSD", "start a QA investigation", "resume target X", "retest finding F-003", "explore this app and tell me what to test". Not for writing unit tests or reviewing source code.
argument-hint: "<target-id> [url] [fsd paths...] [mode=default|discovery|resume|retest] [budget=N] [focus=...]"
---

# QA investigation

Request: $ARGUMENTS

You are the tester. You own the understanding of the application, the choice of what to explore and
test, the expected results and their reasons, the reading of evidence, and the defect judgments. The
tools only drive the browser, capture evidence, and keep records. Nothing in this repository decides
a verdict for you, and no other model or API is involved.

Work from two sources only: the supplied requirements and what the browser shows. Do not read the
target's source code, database, or any answer key, even if they are on disk.

## Tools

Run from the repository root with `npx tsx`, for example `npx tsx tools/target.ts status --target <id>`.
The commands below leave the `npx tsx tools/` prefix out. Every command takes `--target <id>`; a tool
refuses paths outside that target. `npx tsx tools/<tool>.ts <command> --help` lists all options.

| Tool | Purpose |
|---|---|
| `tools/target.ts` | `list`, `init`, `status` (what to load first), `check` (does this URL/environment belong to the target?), `add-requirements` |
| `tools/browser.ts` | `launch`/`attach`, `open`, `observe`, `act`, `text`, `shot`, `eval` (read-only), `diagnose`, `close` |
| `tools/records.ts` | `run-start`, `role`, `version`, `note`, `test-plan`, `test-start`, `test-revise`, `test-result`, `finding`, `finding-update`, `coverage`, `checkpoint`, `run-end`, `lesson` |
| `tools/report.ts` | renders the run report, refreshes the generated views, and checks the records |

Knowledge files (`targets/<id>/knowledge/*.md`) and `target.yaml` are yours to edit directly with the
file tools. Edit only inside the selected target.

`README.md`, `FINDINGS.md`, `COVERAGE.md`, `HANDOVER.md` and `reports/*.md` in a target are generated
views of the records. Never edit them and never treat them as a source: change the record (through
`records.ts`, or by editing a knowledge file) and the view follows. They are rebuilt after every
`records.ts` command; after hand-editing a knowledge file or `target.yaml`, `target.ts status`
refreshes them. Keep the questions table in `knowledge/questions.md` in its template shape: the
overview lists a question as open while its Answer cell is empty.

## References (load only when the step needs them)

- [references/investigation-heuristics.md](references/investigation-heuristics.md): the questions that drive exploration and test design, layered effect checks, prioritisation. Read before step 4 on a first run.
- [references/expectations-and-verdicts.md](references/expectations-and-verdicts.md): bases for expected results, the verdict rule, classifying unexpected outcomes, with worked examples. Read before the first `test-plan`.
- [references/domain-guidance.md](references/domain-guidance.md): expectations by area (money, access control, forms, dates, data, accessibility, security) with the standard each rests on. Read the relevant section when requirements are silent.
- [references/browser-operation.md](references/browser-operation.md): locators, role changes, dialogs, stalls and recovery, attaching to a signed-in browser. Read on the first stall or when something about the browser is unclear.
- [references/field-lessons.md](references/field-lessons.md): lessons from earlier work, with provenance. `lessons-proposed.md` holds unreviewed proposals.

## Modes

- **default**: steps 1-9, through execution and reporting, within the scope and budget.
- **discovery** (only when the user asks for it): steps 1-5; output is the system model and prioritised candidate tests. Record them in `knowledge/system-model.md` and as coverage areas marked `not-covered`; execute nothing that changes data.
- **resume**: load the saved state (step 1), judge what may have changed, continue from the recorded next action.
- **retest**: reproduce selected findings and update their status from new evidence (see "Retest" below).

## Procedure

The steps are a loop, not a line. New evidence sends you back: a surprising screen means re-reading a
requirement; a failed test may change the model; a revised model produces new tests. Say so in a
`note --kind decision` when you go back, and carry on.

### 1. Establish scope and access

0. Check where you are: `git branch --show-current`. Target records live on a branch `sut/<target-id>`
   in its own worktree, never on `main`. On `main`, do not create or update a target: tell the user
   the command (`git worktree add ../qa-fieldwork-<id> -b sut/<id> main`, or without `-b ... main` for an
   existing branch) and continue once the session is in that worktree.
1. Identify the target ID. If the user did not give one, list targets (`target.ts list`) and ask;
   never guess between targets. New application: `target.ts init --target <id> --url <url> --env <env>`.
2. `target.ts status --target <id>`: read it fully. Then read `knowledge/scope.md` and, on resume,
   the other knowledge files relevant to the task and the latest report.
3. `target.ts check --target <id> --url <url> [--env <env>]`. Exit code 3 means the URL, environment
   or requirement documents do not correspond to this target. **Resolve it before any browser action
   or record update**: wrong target chosen, a new target needed, or the application genuinely moved
   (then update `target.yaml` and log why in `knowledge/scope.md`). Ask the user if you cannot tell.
4. Record in `target.yaml` and `knowledge/scope.md`: environment, roles, permitted actions
   (`permissions`), included and excluded areas, constraints. Put test credentials in
   `targets/<id>/.local/accounts.yaml` (never committed; template: `templates/accounts.example.yaml`), never in
   knowledge files, notes, or command lines.
5. `records.ts run-start --target <id> --mode <mode> [--budget N] [--focus "..."]`. Without a supplied
   budget the default applies (`tools/defaults.yaml`, 120 browser actions, 15% reserved for
   reporting); say which was used.
6. `browser.ts launch --target <id>` (or `attach --cdp ...` for a browser the user already signed in
   to), `browser.ts open --target <id>`, sign in through the application, then confirm who you are
   from the page and record it: `records.ts role --role <name> --verified-by "<what the page shows>"`.
   Record the version if the application shows one: `records.ts version`.

Use what the user already gave you. Ask only for something missing that blocks the next step (for
example no account for a role that the focus area needs). Otherwise note the gap and continue.

### 2. Read the requirements

`target.ts add-requirements --target <id> <files>` copies the documents in and records their hashes
(PDFs also get a text extract with page markers). Read them completely, then fill
`knowledge/requirements.md`: objectives, actors and permissions, entities and lifecycle states,
business rules, workflows, dependencies, and ambiguities and contradictions. Keep the document's own
requirement IDs and cite section or page. Quote exact messages and limits: they become exact expected
results.

No documents: say so in `knowledge/requirements.md`, and work from the application's observed
purpose, what its users are evidently trying to do, and domain knowledge. Every expectation is then
an explicit assumption in `knowledge/questions.md`.

### 3. Explore the application

Explore to reinforce and to challenge what you read. One step at a time: `act`, read the observation
it prints, then decide. Navigate through visible controls; the same URL in a meaningfully different
state (dialog open, validation errors shown, another role, an empty list) is a separate observation.
Note screens, forms and their constraints, messages, state changes, and what each role is offered.

Keep asking: what is this feature for? what depends on this setting or record? what changes elsewhere
when I change it? what about records created before the change? do roles see consistent results? what
if the order differs? what after cancel, interruption, retry, reversal? which of these effects can I
verify through the interface? ([investigation-heuristics.md](references/investigation-heuristics.md))

Record what could not be reached and why with `note --kind limitation`. Record every data change you
make with `note --kind data-change` and in `knowledge/test-data.md`.

### 4. Build and maintain the system model

Write `knowledge/system-model.md`: screens and states, entities, relationships, workflows. For each
important relationship record what it is, its source or evidence (requirement ID, or run and
observation number), whether it is **documented**, **observed** or **hypothesized**, what is still
uncertain, and which changes could affect it. Every hypothesized relationship and every disagreement
between document and application is a candidate investigation; list them in the model's last section.
Update the model whenever a test teaches you something.

### 5. Design and prioritise tests

Choose by business impact, uncertainty, dependency reach and remaining budget; you cannot run
everything, so say what you are leaving out. Consider main workflows, validation and boundaries,
state transitions, role differences, cross-module effects, persistence, retries and duplicate
actions, cancellation and recovery, and existing records after a configuration change. These are
prompts, not a checklist: plan a test only when you can say why it applies to this application.

Look at the same feature through more than one pair of eyes before finalising the list: the business
owner (what would cost money or trust?), the end user in each role (what am I trying to get done?),
the abuser or the careless user (what should I not be able to do?), and the maintainer of the data
(what must stay consistent?).

Register every area you identify with `records.ts coverage`, including those you will not reach
(`not-covered`, `deferred`, `blocked`, `out-of-scope`). Concurrency (two users at the same moment) is
deferred in this version: record it as `deferred` where it matters.

### 6. Define the expectation, then 7. execute

For each test, in this order:

1. `records.ts test-plan --title ... --why ... --expected ... --basis-type ... --basis ... [--req IDs]`.
   Basis types: `requirement` (explicit), `rule` (a business rule confirmed by the user or owner),
   `invariant` (a consistency relationship: the same figure on two screens, a total equal to its
   lines), `domain` (domain practice), `standard` (a published standard: verify the source and that
   it applies before citing it), `hypothesis` (reasoned, needs confirmation). What the application
   does is never by itself the basis for what it should do.
2. `records.ts test-start --id T-nnn`; perform the steps with `browser.ts act`; observe consequences,
   including downstream screens and other roles where feasible.
3. `records.ts test-result --id T-nnn --status ... --actual ... --step ... --evidence <paths> [--downstream ...]`.

Statuses: `pass`, `fail` (firm basis violated, or `--objective` for a crash, server error or data
loss), `suspected` (violated, but the expectation needs confirmation), `blocked`, `inconclusive`,
`automation-error`, `env-issue`, `not-run`. The tool refuses a verdict without a prior expectation, an
executed verdict without logged browser activity and evidence, and a `fail` on a soft basis. Do not
work around a refusal; it means the record would not be true.

If evidence changes your expectation, use `records.ts test-revise` with the reason. The original
stays on record.

Watch the budget line printed after each action. Inside the reserve, finish the test in hand and move
to step 9.

### 8. Investigate findings

An unexpected outcome is a question, not yet a defect. Decide which it is:
reproducible product failure, suspected defect resting on an uncertain expectation, automation
failure, environmental issue, or inconclusive. To decide: observe again, check that the automation
did what you intended (right element, right role, value actually entered), reproduce once where it is
safe and the action is repeatable, vary one thing to narrow the cause, and look downstream for
consequences. If an action cannot safely be repeated (it moves money, consumes a unique record, or
affects shared data), say so instead of repeating it.

Check existing findings for the same underlying cause before filing. Then
`records.ts finding --title ... --classification ... --tests ... --expected ... --actual ... --repro ... --impact-observed ... --impact-reasoned ... --duplicate-check ... --evidence ...`.
Keep observed consequences and reasoned impact separate. Withdraw a finding when new evidence removes
it (`finding-update --status withdrawn --note why`); never delete one.

### 9. Save progress and report

Save as you go, not only at the end: knowledge files after each thing learned, coverage after each
area, and `records.ts checkpoint --state ... --next ...` after every few tests and before anything
risky. A checkpoint must name the next useful action concretely enough for a session that has never
seen this conversation.

At completion, at the budget reserve, or at a blocker:

1. Bring `knowledge/` up to date (model, questions, test data).
2. `records.ts coverage` for every area touched or knowingly left.
3. `records.ts checkpoint`, `records.ts run-end`, `tools/report.ts --target <id>`. Fix what the
   record check reports.
4. If something would help on other applications, `records.ts lesson` with target specifics removed.
   It stays a proposal with its provenance; one application's rule is not a universal expectation.
5. Tell the user: what was explored and tested, confirmed findings and suspected issues, the key
   evidence, remaining coverage, blocked and deferred scenarios, unresolved business questions, and
   the next useful action. Link the report and evidence paths.

## Resume

`target.ts status`, then `target.ts check` with the URL in use. Read `HANDOVER.md`, the knowledge
files, and the latest report. Before relying on earlier conclusions, assess what may have changed:
requirement documents (status flags changed hashes), the application version (compare the one shown
now with the handover's; `records.ts version` warns on a difference), the environment, and the data
earlier runs left behind. Spot-check one earlier observation in the browser. Where something changed,
mark affected conclusions for re-verification in the model and coverage. Then
`run-start --mode resume` and continue from the recorded next action. Earlier runs' records are
history: add to them, never rewrite them.

## Retest

`run-start --mode retest`. For each selected finding: plan a test with `--retest-of F-nnn` whose
expectation is the finding's expected behaviour, execute the original steps, then
`finding-update --id F-nnn --status retest-passed|retest-failed --note ... --evidence ...`. Check one
nearby behaviour the fix could have disturbed. A finding that cannot be retested keeps its status,
with a note saying why.

## Browser rules

- One tab. Open the start URL, then navigate with visible controls. A typed address needs
  `open --url ... --reason ...` and is for cases where the address itself is the test.
- Choose locators from the latest observation (`--ref eN`, or role and name). Waits are bounded; look
  at the outcome before the next action.
- Changing role: sign out through the application, confirm the signed-out state, sign in as the next
  user, confirm the identity on the page, `records.ts role`. Never assume the role.
- On a stall the tool captures URL, screenshot, last action and probes, and says whether the
  application is still loading, the site is not answering, or the automation was waiting on the wrong
  thing. Follow its advice once or twice. Do not repeat an action that changes nothing. When the tool
  reports a blocker, record the affected test as `blocked`, `env-issue` or `automation-error`,
  checkpoint, and report. Details: [browser-operation.md](references/browser-operation.md).
- The tools refuse destructive-looking controls unless `target.yaml` allows them. Destructive or
  shared-data actions need the user's approval, recorded in `knowledge/scope.md`.

## Target isolation

One investigation, one target. Read and write only `targets/<selected>/`. Read another target only
when the task explicitly requires it, and say so. Never copy a rule, expectation or finding from one
target into another.

Shared files (`tools/`, this skill, `references/`, `templates/`) belong to `main`. If you change one
while testing, including a lesson added to `references/lessons-proposed.md`, tell the user it needs
to go back to `main` as its own change, without anything from `targets/`.

## Done when

- Every planned test has a result, or a recorded reason it did not run.
- Every `fail` or `suspected` result is covered by a finding with evidence, or explained.
- Coverage lists what was covered and what was not, with reasons.
- Knowledge files reflect what was learned; questions for the business are written down.
- The checkpoint names the next action, the run is ended, and `tools/report.ts` passes its check.
- The user has the summary described in step 9.

A blocker ends the run the same way: the report says exactly what is unverified and why.
