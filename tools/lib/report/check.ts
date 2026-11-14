/** Integrity check: records that would mislead a reader of the report. */
import { join } from "node:path";
import { isFile, targetDir } from "../core/paths.ts";
import { DEFECT_CLASSES, type FindingFile } from "../schemas/finding.ts";
import { EXECUTED_STATUSES, FAILING_STATUSES, type TestFile } from "../schemas/test.ts";

export function checkRecords(target: string, tests: TestFile, findings: FindingFile): string[] {
  const root = targetDir(target);
  const exists = (path: string): boolean => isFile(join(root, path));
  const problems: string[] = [];

  for (const [id, test] of Object.entries(tests)) {
    const result = test.result;
    if (!result) {
      problems.push(`${id}: planned but has no result (record not-run / blocked with the reason)`);
      continue;
    }
    const firstExpectation = test.expectation_history[0]?.recorded ?? test.expectation.recorded;
    if (result.recorded < firstExpectation) problems.push(`${id}: result recorded before its expectation`);
    if (EXECUTED_STATUSES.has(result.status)) {
      if (result.evidence.length === 0) problems.push(`${id}: ${result.status} without evidence`);
      if (!result.logged_actions) problems.push(`${id}: ${result.status} without logged browser activity`);
    }
    for (const path of result.evidence) {
      if (!exists(path)) problems.push(`${id}: evidence file missing: ${path}`);
    }
    const hasFinding = Object.values(findings).some((f) => f.tests.includes(id));
    if (FAILING_STATUSES.has(result.status) && !hasFinding) {
      problems.push(`${id}: ${result.status} but no finding refers to it (file one, or explain in the result)`);
    }
  }

  for (const [id, finding] of Object.entries(findings)) {
    const evidence = [...finding.evidence, ...finding.history.flatMap((h) => h.evidence)];
    for (const path of evidence) {
      if (!exists(path)) problems.push(`${id}: evidence file missing: ${path}`);
    }
    if (DEFECT_CLASSES.has(finding.classification) && finding.evidence.length === 0) {
      problems.push(`${id}: defect finding without evidence`);
    }
  }
  return problems;
}
