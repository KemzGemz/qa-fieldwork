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
  /** Revised when new evidence changes how serious the finding is; the earlier value stays in the history. */
  severity?: Severity;
  /** Revised when the first wording claimed more (or something else) than the evidence shows. */
  title?: string;
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
  const changes: Record<string, { from: string; to: string }> = {};
  if (input.severity && input.severity !== finding.severity) changes.severity = { from: finding.severity, to: input.severity };
  if (input.title && input.title !== finding.title) changes.title = { from: finding.title, to: input.title };
  if (input.classification && input.classification !== finding.classification) {
    changes.classification = { from: finding.classification, to: input.classification };
  }
  finding.history.push({
    t: now(),
    run: run.id,
    from: finding.status,
    to: input.status ?? finding.status,
    note: input.note,
    evidence: resolveEvidence(target, input.evidence),
    app_version: run.app_version,
    role: run.role,
    ...(Object.keys(changes).length > 0 ? { changes } : {}),
  });
  if (input.status) finding.status = input.status;
  if (input.classification) finding.classification = input.classification;
  if (input.severity) finding.severity = input.severity;
  if (input.title) finding.title = input.title;
  if (input.addTests?.length) {
    anyFailing(target, input.addTests);
    for (const testId of input.addTests) {
      if (!finding.tests.includes(testId)) finding.tests.push(testId);
    }
  }
  writeJson(findingsPath(target), findings);
  const revised = Object.entries(changes).map(([field, change]) => `${field} ${change.from} -> ${change.to}`);
  return [
    `${id}: status ${finding.status} (${finding.classification}, ${finding.severity}); history entries: ${finding.history.length}` +
      (revised.length > 0 ? `; revised: ${revised.join("; ")} (the earlier values stay in the history)` : ""),
  ];
}
