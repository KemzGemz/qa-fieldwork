/** Findings: target-level, never deleted; status changes are appended to their history. */
import { join } from "node:path";
import { fail } from "../core/errors.ts";
import { targetDir } from "../core/paths.ts";
import { now, readJson, writeJson } from "../core/store.ts";
import {
  type Classification,
  DEFECT_CLASSES,
  FindingFile,
  type FindingStatus,
  INACTIVE_STATUSES,
  type Severity,
} from "../schemas/finding.ts";
import { FAILING_STATUSES, statusOf } from "../schemas/test.ts";
import { allTests, loadRun } from "./runs.ts";
import { nextId, resolveEvidence } from "./tests.ts";

const findingsPath = (target: string): string => join(targetDir(target), "findings.json");

export function readFindings(target: string): FindingFile {
  return FindingFile.parse(readJson(findingsPath(target), {}));
}

/** Check the tests exist; report whether any of them has a failing verdict. */
function anyFailing(target: string, testIds: readonly string[]): boolean {
  const known = allTests(target);
  let failing = false;
  for (const id of testIds) {
    const hits = known.filter(({ test }) => test.id === id);
    if (hits.length === 0) fail(`test ${id} does not exist for this target`);
    failing ||= hits.some(({ test }) => {
      const status = statusOf(test);
      return status !== "planned" && FAILING_STATUSES.has(status);
    });
  }
  return failing;
}

export interface FindingInput {
  target: string;
  title: string;
  classification: Classification;
  severity?: Severity;
  tests: string[];
  req?: string[];
  expected: string;
  actual: string;
  steps?: string[];
  repro?: string;
  impactObserved?: string;
  impactReasoned?: string;
  uncertainty?: string;
  duplicateCheck: string;
  evidence?: string[];
}

export function addFinding(input: FindingInput): string[] {
  const { target, classification } = input;
  const { run } = loadRun(target);
  const findings = readFindings(target);
  const failing = anyFailing(target, input.tests);
  if (DEFECT_CLASSES.has(classification) && !failing) {
    fail("none of the listed tests has a fail/suspected result: a defect finding must rest on an executed test");
  }
  if (classification === "product-failure" && !input.repro) {
    fail("a product failure needs --repro (e.g. '2/2 attempts', or why it cannot safely be repeated)");
  }
  const id = nextId("F", Object.keys(findings));
  findings[id] = {
    id,
    title: input.title,
    classification,
    severity: input.severity ?? "medium",
    status: classification === "suspected-defect" ? "suspected" : "open",
    tests: input.tests,
    requirements: input.req ?? [],
    expected: input.expected,
    actual: input.actual,
    steps: input.steps ?? [],
    reproduction: input.repro ?? "",
    impact_observed: input.impactObserved ?? "",
    impact_reasoned: input.impactReasoned ?? "",
    uncertainty: input.uncertainty ?? "",
    duplicate_check: input.duplicateCheck,
    evidence: resolveEvidence(target, input.evidence),
    found: { run: run.id, role: run.role, environment: run.environment, app_version: run.app_version, t: now() },
    history: [],
  };
  writeJson(findingsPath(target), findings);

  const lines = [`${id} [${classification}] ${input.title}`];
  const others = Object.values(findings).filter((f) => f.id !== id && !INACTIVE_STATUSES.has(f.status));
  if (others.length > 0) {
    lines.push("  other findings (confirm this is not a duplicate; if it is, finding-update --status duplicate):");
    lines.push(...others.map((f) => `   - ${f.id}: ${f.title}`));
  }
  return lines;
}

export interface FindingUpdateInput {
  target: string;
  id: string;
  status?: FindingStatus;
  classification?: Classification;
  note: string;
  evidence?: string[];
  addTests?: string[];
}

export function updateFinding(input: FindingUpdateInput): string[] {
  const { target, id } = input;
  const { run } = loadRun(target);
  const findings = readFindings(target);
  const finding = findings[id];
  if (!finding) fail(`no finding ${id} in target ${target}`);
  finding.history.push({
    t: now(),
    run: run.id,
    from: finding.status,
    to: input.status ?? finding.status,
    note: input.note,
    evidence: resolveEvidence(target, input.evidence),
    app_version: run.app_version,
    role: run.role,
  });
  if (input.status) finding.status = input.status;
  if (input.classification) finding.classification = input.classification;
  if (input.addTests?.length) {
    anyFailing(target, input.addTests);
    for (const testId of input.addTests) {
      if (!finding.tests.includes(testId)) finding.tests.push(testId);
    }
  }
  writeJson(findingsPath(target), findings);
  return [`${id}: status ${finding.status} (${finding.classification}); history entries: ${finding.history.length}`];
}
