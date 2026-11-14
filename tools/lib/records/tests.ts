/**
 * Tests: plan (expectation and basis) -> start -> result. The rules here are what make a recorded
 * verdict trustworthy later:
 *   - a verdict needs an expectation recorded earlier, and a revision keeps the original;
 *   - pass / fail / suspected need test-start, browser activity logged after it, and evidence files;
 *   - `fail` needs a firm basis (requirement, rule, invariant) unless the outcome is objective.
 */
import { fail } from "../core/errors.ts";
import { inside, isFile, rel } from "../core/paths.ts";
import { now } from "../core/store.ts";
import {
  type BasisType,
  EXECUTED_STATUSES,
  type Expectation,
  FAILING_STATUSES,
  FIRM_BASES,
  statusOf,
  type TestRecord,
  type TestStatus,
} from "../schemas/test.ts";
import {
  allTests,
  budgetLine,
  journal,
  loadRun,
  readActions,
  readTests,
  type RunContext,
  setActiveTest,
  writeTests,
} from "./runs.ts";

/** Next free id with this prefix: T-001, T-002, ... */
export function nextId(prefix: string, existing: Iterable<string>): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  let highest = 0;
  for (const id of existing) {
    const match = pattern.exec(id);
    if (match?.[1]) highest = Math.max(highest, Number(match[1]));
  }
  return `${prefix}-${String(highest + 1).padStart(3, "0")}`;
}

/** Resolve evidence paths, require them to exist inside the target, store them target-relative. */
export function resolveEvidence(target: string, paths: readonly string[] | undefined): string[] {
  return (paths ?? []).map((path) => {
    const resolved = inside(target, path);
    if (!isFile(resolved)) fail(`evidence file not found: ${path}`);
    return rel(target, resolved);
  });
}

export interface ExpectationInput {
  expected: string;
  basisType: BasisType;
  basis: string;
  uncertainty?: string;
}

function toExpectation(input: ExpectationInput): Expectation {
  return {
    text: input.expected,
    basis_type: input.basisType,
    basis: input.basis,
    uncertainty: input.uncertainty ?? "",
    recorded: now(),
  };
}

function loadTest(target: string, id: string): { ctx: RunContext; tests: Record<string, TestRecord>; test: TestRecord } {
  const ctx = loadRun(target);
  const tests = readTests(ctx.dir);
  const test = tests[id];
  if (!test) {
    fail(`${id} is not planned in run ${ctx.run.id}. Plan it first (test-plan) so the expectation precedes the verdict.`);
  }
  return { ctx, tests, test };
}

export interface TestPlanInput extends ExpectationInput {
  target: string;
  id?: string;
  title: string;
  why: string;
  area?: string;
  priority?: number;
  req?: string[];
  role?: string;
  preconditions?: string;
  data?: string;
  retestOf?: string;
}

export function testPlan(input: TestPlanInput): string[] {
  const ctx = loadRun(input.target);
  const tests = readTests(ctx.dir);
  const id = input.id ?? nextId("T", allTests(input.target).map(({ test }) => test.id));
  if (tests[id]) fail(`${id} already exists in this run; use test-revise to change its expectation`);
  tests[id] = {
    id,
    title: input.title,
    area: input.area ?? "",
    priority: input.priority ?? 2,
    why: input.why,
    requirements: input.req ?? [],
    role: input.role ?? ctx.run.role,
    preconditions: input.preconditions ?? "",
    data: input.data ?? "",
    retest_of: input.retestOf ?? null,
    planned: now(),
    expectation: toExpectation(input),
    expectation_history: [],
    started: null,
    result: null,
  };
  writeTests(ctx.dir, tests);
  const strength = FIRM_BASES.has(input.basisType)
    ? "firm (a violation can be a confirmed failure)"
    : "soft (a violation is at most a suspected defect until confirmed)";
  return [`planned ${id}: ${input.title}`, `  expectation recorded [${input.basisType}: ${strength}]`];
}

export function testStart(target: string, id: string): string[] {
  const { ctx, tests, test } = loadTest(target, id);
  test.started = { t: now(), action_index: readActions(ctx.dir).length, role: ctx.run.role };
  writeTests(ctx.dir, tests);
  setActiveTest(target, id);
  return [
    `started ${id} as ${ctx.run.role ?? "(role not verified!)"}: browser actions are now tagged ${id}`,
    `  expected: ${test.expectation.text}`,
  ];
}

export interface TestReviseInput extends ExpectationInput {
  target: string;
  id: string;
  reason: string;
}

export function testRevise(input: TestReviseInput): string[] {
  const { ctx, tests, test } = loadTest(input.target, input.id);
  test.expectation_history.push({
    ...test.expectation,
    revised: now(),
    reason: input.reason,
    after_result: test.result !== null,
  });
  test.expectation = toExpectation(input);
  writeTests(ctx.dir, tests);
  const lines = [
    `revised expectation of ${input.id}; the original is kept in expectation_history (${test.expectation_history.length})`,
  ];
  if (test.result) {
    lines.push("  !! a result already exists: re-judge it with test-result (the earlier verdict stays in the journal)");
  }
  return lines;
}

export interface TestResultInput {
  target: string;
  id: string;
  status: TestStatus;
  actual: string;
  steps?: string[];
  evidence?: string[];
  downstream?: string;
  uncertainty?: string;
  /** The outcome is wrong under any reading (crash, server error, data loss). */
  objective?: boolean;
}

export function testResult(input: TestResultInput): string[] {
  const { target, id, status } = input;
  const { ctx, tests, test } = loadTest(target, id);
  const evidence = resolveEvidence(target, input.evidence);
  const actions = readActions(ctx.dir);
  const loggedSinceStart = test.started ? actions.length - test.started.action_index : 0;

  if (EXECUTED_STATUSES.has(status)) {
    if (!test.started) fail(`${id} was never started (test-start). An executed verdict needs actual browser actions.`);
    if (loggedSinceStart <= 0) {
      fail(
        `no browser activity is logged since ${id} started; perform and observe the steps, ` +
          "or record blocked / inconclusive / not-run",
      );
    }
    if (evidence.length === 0) {
      fail("pass / fail / suspected need at least one evidence file (screenshot or observation) from this target");
    }
    if (status === "fail" && !FIRM_BASES.has(test.expectation.basis_type) && !input.objective) {
      fail(
        `the expectation rests on '${test.expectation.basis_type}', which is not confirmed. ` +
          "Record 'suspected' (and raise the question), or pass --objective for a crash / server error / data loss " +
          "that is wrong under any reading.",
      );
    }
  }

  if (test.result) {
    journal(ctx.dir, "superseded-result", `${id}: ${test.result.status} replaced by ${status}`, { previous: test.result });
  }
  test.result = {
    status,
    actual: input.actual,
    steps: input.steps ?? [],
    evidence,
    downstream: input.downstream ?? "",
    uncertainty: input.uncertainty ?? "",
    role: ctx.run.role,
    environment: ctx.run.environment,
    app_version: ctx.run.app_version,
    logged_actions: loggedSinceStart,
    recorded: now(),
  };
  writeTests(ctx.dir, tests);
  setActiveTest(target, null);

  const lines = [
    `${id}: ${status.toUpperCase()} recorded (${loggedSinceStart} logged browser steps, ${evidence.length} evidence files)`,
  ];
  if (FAILING_STATUSES.has(status)) {
    lines.push("  next: investigate (reproduce, narrow, check downstream), check for duplicates, then records.ts finding");
  }
  lines.push(`  ${budgetLine(ctx)}`);
  return lines;
}

export function listTests(target: string, allRuns: boolean): string[] {
  const current = loadRun(target).run.id;
  const rows = allTests(target).filter(({ runId }) => allRuns || runId === current);
  if (rows.length === 0) return ["(no tests)"];
  return rows.map(
    ({ runId, test }) =>
      `${`${runId}/${test.id}`.padEnd(32)} ${statusOf(test).padEnd(16)} P${test.priority} ` +
      `[${test.expectation.basis_type}] ${test.title}`,
  );
}
