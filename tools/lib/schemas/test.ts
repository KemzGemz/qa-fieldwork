import { z } from "zod";

/** What an expectation rests on. The first three are firm; the rest need confirmation. */
export const BASIS_TYPES = ["requirement", "rule", "invariant", "domain", "standard", "hypothesis"] as const;
export type BasisType = (typeof BASIS_TYPES)[number];
export const FIRM_BASES: ReadonlySet<BasisType> = new Set(["requirement", "rule", "invariant"]);

export const TEST_STATUSES = [
  "pass",
  "fail",
  "suspected",
  "blocked",
  "inconclusive",
  "automation-error",
  "env-issue",
  "not-run",
] as const;
export type TestStatus = (typeof TEST_STATUSES)[number];

/** Verdicts that claim the test was actually carried out in the browser. */
export const EXECUTED_STATUSES: ReadonlySet<TestStatus> = new Set(["pass", "fail", "suspected"]);
/** Verdicts that say the product did not behave as expected. */
export const FAILING_STATUSES: ReadonlySet<TestStatus> = new Set(["fail", "suspected"]);

export const Expectation = z.looseObject({
  text: z.string(),
  basis_type: z.enum(BASIS_TYPES),
  basis: z.string(),
  uncertainty: z.string(),
  recorded: z.string(),
});
export type Expectation = z.infer<typeof Expectation>;

/** A superseded expectation, kept so the report can show what was originally expected. */
export const ExpectationRevision = Expectation.extend({
  revised: z.string(),
  reason: z.string(),
  after_result: z.boolean(),
});
export type ExpectationRevision = z.infer<typeof ExpectationRevision>;

export const TestResult = z.looseObject({
  status: z.enum(TEST_STATUSES),
  actual: z.string(),
  steps: z.array(z.string()),
  evidence: z.array(z.string()),
  downstream: z.string(),
  uncertainty: z.string(),
  role: z.string().nullable(),
  environment: z.string(),
  app_version: z.string().nullable(),
  logged_actions: z.number().int(),
  recorded: z.string(),
});
export type TestResult = z.infer<typeof TestResult>;

export const TestRecord = z.looseObject({
  id: z.string(),
  title: z.string(),
  area: z.string(),
  priority: z.number().int(),
  why: z.string(),
  requirements: z.array(z.string()),
  role: z.string().nullable(),
  preconditions: z.string(),
  data: z.string(),
  retest_of: z.string().nullable(),
  planned: z.string(),
  expectation: Expectation,
  expectation_history: z.array(ExpectationRevision),
  started: z.object({ t: z.string(), action_index: z.number().int(), role: z.string().nullable() }).nullable(),
  result: TestResult.nullable(),
});
export type TestRecord = z.infer<typeof TestRecord>;

/** runs/<run-id>/tests.json */
export const TestFile = z.record(z.string(), TestRecord);
export type TestFile = z.infer<typeof TestFile>;

export function statusOf(test: TestRecord): TestStatus | "planned" {
  return test.result?.status ?? "planned";
}
