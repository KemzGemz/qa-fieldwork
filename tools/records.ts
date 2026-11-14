/**
 * Run, test, finding, coverage and handover records for one target.
 * Every command takes --target. Records live in targets/<id>/; run-specific ones in runs/<run-id>/.
 *
 *   npx tsx tools/records.ts <command> --help
 *
 * Rules enforced (so that records can be trusted later):
 *   - a verdict needs an expectation recorded earlier (test-plan); a revision keeps the original;
 *   - pass / fail / suspected need test-start, browser activity logged after it, and evidence files;
 *   - `fail` needs a requirement, confirmed rule or invariant as basis (or --objective);
 *   - evidence paths must be inside the same target.
 */
import { Command, Option } from "commander";
import { runCli } from "./lib/core/errors.ts";
import { csv } from "./lib/core/store.ts";
import { setCoverage } from "./lib/records/coverage.ts";
import { addFinding, updateFinding } from "./lib/records/findings.ts";
import { checkpoint, proposeLesson } from "./lib/records/handover.ts";
import { addNote, runEnd, runStart, runStatus, setRole, setVersion } from "./lib/records/runs.ts";
import { refreshTargetViews } from "./lib/report/views.ts";
import { listTests, testPlan, testResult, testRevise, testStart } from "./lib/records/tests.ts";
import { COVERAGE_STATUSES } from "./lib/schemas/coverage.ts";
import { CLASSIFICATIONS, FINDING_STATUSES, SEVERITIES } from "./lib/schemas/finding.ts";
import { NOTE_KINDS, RUN_MODES } from "./lib/schemas/run.ts";
import { BASIS_TYPES, TEST_STATUSES } from "./lib/schemas/test.ts";

const program = new Command("records").description("Run, test, finding, coverage and handover records for one target");

const print = (lines: string[]): void => console.log(lines.join("\n"));
const collect = (value: string, previous: string[] = []): string[] => [...previous, value];

// Generated views (README.md, FINDINGS.md, COVERAGE.md, HANDOVER.md) follow every successful record change.
program.hook("postAction", (_program, action) => refreshTargetViews(action.opts<{ target: string }>().target));
const integer = (value: string): number => Number.parseInt(value, 10);

/** A sub-command that requires --target. */
function command(name: string, summary: string): Command {
  return program.command(name).description(summary).requiredOption("--target <id>", "target id");
}

/** Options shared by test-plan and test-revise. */
function expectationOptions(cmd: Command): Command {
  return cmd
    .requiredOption("--expected <text>", "what should happen")
    .addOption(new Option("--basis-type <type>", "what the expectation rests on").choices(BASIS_TYPES).makeOptionMandatory())
    .requiredOption("--basis <text>", "the source: requirement id and section, who confirmed the rule, the invariant, ...")
    .option("--uncertainty <text>", "what is unsure and what would settle it");
}

command("run-start", "start a run (one investigation session)")
  .addOption(new Option("--mode <mode>").choices(RUN_MODES).default("default"))
  .option("--budget <actions>", "browser actions for this run (default: tools/defaults.yaml or target.yaml)", integer)
  .option("--env <environment>")
  .option("--focus <text>")
  .option("--scope <text>", "scope note for this run")
  .action((o) => print(runStart({ target: o.target, mode: o.mode, budget: o.budget, env: o.env, focus: o.focus, scope: o.scope })));

command("run-status", "budget and test counts of the active run").action((o) => print(runStatus(o.target)));
command("run-end", "close the active run (needs a checkpoint first)").action((o) => print(runEnd(o.target)));

command("role", "record the signed-in role after confirming it on the page")
  .requiredOption("--role <name>")
  .requiredOption("--verified-by <text>", "what on the page shows this identity")
  .action((o) => print(setRole(o.target, o.role, o.verifiedBy)));

command("version", "record the application version shown")
  .requiredOption("--value <version>")
  .requiredOption("--seen <where>")
  .action((o) => print(setVersion(o.target, o.value, o.seen)));

command("note", "add a note to the run journal")
  .addOption(new Option("--kind <kind>").choices(NOTE_KINDS).makeOptionMandatory())
  .requiredOption("--text <text>")
  .option("--test <id>")
  .action((o) => print(addNote(o.target, o.kind, o.text, o.test)));

expectationOptions(
  command("test-plan", "plan a test: expected result and its basis, before executing")
    .option("--id <id>", "default: next free T-nnn")
    .requiredOption("--title <text>")
    .requiredOption("--why <text>", "why this test applies and deserves the budget")
    .option("--area <text>")
    .addOption(new Option("--priority <n>").choices(["1", "2", "3"]).default("2"))
    .option("--req <ids>", "requirement ids, comma-separated")
    .option("--role <name>")
    .option("--preconditions <text>")
    .option("--data <text>", "test data references")
    .option("--retest-of <finding>", "finding id this test retests"),
).action((o) =>
  print(
    testPlan({
      target: o.target,
      id: o.id,
      title: o.title,
      why: o.why,
      area: o.area,
      priority: integer(o.priority),
      req: csv(o.req),
      role: o.role,
      preconditions: o.preconditions,
      data: o.data,
      retestOf: o.retestOf,
      expected: o.expected,
      basisType: o.basisType,
      basis: o.basis,
      uncertainty: o.uncertainty,
    }),
  ),
);

command("test-start", "start executing a planned test; browser actions are tagged with it")
  .requiredOption("--id <id>")
  .action((o) => print(testStart(o.target, o.id)));

expectationOptions(
  command("test-revise", "change an expectation after new evidence; the original is kept")
    .requiredOption("--id <id>")
    .requiredOption("--reason <text>"),
).action((o) =>
  print(
    testRevise({
      target: o.target,
      id: o.id,
      reason: o.reason,
      expected: o.expected,
      basisType: o.basisType,
      basis: o.basis,
      uncertainty: o.uncertainty,
    }),
  ),
);

command("test-result", "record the actual result and verdict of a test")
  .requiredOption("--id <id>")
  .addOption(new Option("--status <status>").choices(TEST_STATUSES).makeOptionMandatory())
  .requiredOption("--actual <text>")
  .option("--step <text>", "a step performed (repeatable)", collect)
  .option("--evidence <paths...>", "screenshot or observation files of this target")
  .option("--downstream <text>", "downstream effects checked")
  .option("--uncertainty <text>")
  .option("--objective", "the outcome is wrong under any reading (crash, server error, data loss)")
  .action((o) =>
    print(
      testResult({
        target: o.target,
        id: o.id,
        status: o.status,
        actual: o.actual,
        steps: o.step,
        evidence: o.evidence,
        downstream: o.downstream,
        uncertainty: o.uncertainty,
        objective: o.objective,
      }),
    ),
  );

command("tests", "list tests of the active run")
  .option("--all-runs", "every run of the target")
  .action((o) => print(listTests(o.target, Boolean(o.allRuns))));

command("finding", "file a finding after investigating an unexpected result")
  .requiredOption("--title <text>")
  .addOption(new Option("--classification <class>").choices(CLASSIFICATIONS).makeOptionMandatory())
  .addOption(new Option("--severity <severity>").choices(SEVERITIES).default("medium"))
  .requiredOption("--tests <ids>", "test ids, comma-separated")
  .option("--req <ids>", "requirement ids, comma-separated")
  .requiredOption("--expected <text>")
  .requiredOption("--actual <text>")
  .option("--step <text>", "a reproduction step (repeatable)", collect)
  .option("--repro <text>", "e.g. '2/2 attempts', or why it cannot safely be repeated")
  .option("--impact-observed <text>", "consequences actually seen")
  .option("--impact-reasoned <text>", "consequences that follow by reasoning")
  .option("--uncertainty <text>")
  .requiredOption("--duplicate-check <text>", "why this is not an existing finding")
  .option("--evidence <paths...>")
  .action((o) =>
    print(
      addFinding({
        target: o.target,
        title: o.title,
        classification: o.classification,
        severity: o.severity,
        tests: csv(o.tests),
        req: csv(o.req),
        expected: o.expected,
        actual: o.actual,
        steps: o.step,
        repro: o.repro,
        impactObserved: o.impactObserved,
        impactReasoned: o.impactReasoned,
        uncertainty: o.uncertainty,
        duplicateCheck: o.duplicateCheck,
        evidence: o.evidence,
      }),
    ),
  );

command("finding-update", "change a finding's status or add evidence; appended to its history")
  .requiredOption("--id <id>")
  .addOption(new Option("--status <status>").choices(FINDING_STATUSES))
  .addOption(new Option("--classification <class>").choices(CLASSIFICATIONS))
  .requiredOption("--note <text>")
  .option("--evidence <paths...>")
  .option("--add-tests <ids>", "further test ids to link, comma-separated")
  .action((o) =>
    print(
      updateFinding({
        target: o.target,
        id: o.id,
        status: o.status,
        classification: o.classification,
        note: o.note,
        evidence: o.evidence,
        addTests: csv(o.addTests),
      }),
    ),
  );

command("coverage", "record the coverage status of an area")
  .requiredOption("--area <text>")
  .addOption(new Option("--status <status>").choices(COVERAGE_STATUSES).makeOptionMandatory())
  .requiredOption("--note <text>")
  .option("--tests <ids>")
  .option("--req <ids>")
  .action((o) =>
    print(setCoverage({ target: o.target, area: o.area, status: o.status, note: o.note, tests: csv(o.tests), req: csv(o.req) })),
  );

command("checkpoint", "save state and the next useful action for a fresh session")
  .requiredOption("--state <text>")
  .requiredOption("--next <text>")
  .option("--blockers <text>")
  .option("--questions <text>")
  .action((o) => print(checkpoint({ target: o.target, state: o.state, next: o.next, blockers: o.blockers, questions: o.questions })));

command("lesson", "propose a general lesson, with target specifics removed")
  .requiredOption("--text <text>")
  .requiredOption("--basis <text>", "what happened")
  .action((o) => print(proposeLesson(o.target, o.text, o.basis)));

await runCli(() => program.parseAsync());
