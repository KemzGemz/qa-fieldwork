/**
 * Markdown for the run report and for findings and coverage. Pure functions: nothing is invented
 * here, every line comes from what was recorded. Files are written by views.ts.
 */
import type { TargetConfig } from "../core/config.ts";
import { formatCounts } from "../core/store.ts";
import { actionsUsed, type RunContext, testCounts } from "../records/runs.ts";
import { COVERAGE_ORDER, type CoverageFile } from "../schemas/coverage.ts";
import { type Finding, type FindingFile, INACTIVE_STATUSES } from "../schemas/finding.ts";
import type { Handover } from "../schemas/handover.ts";
import type { JournalEntry } from "../schemas/run.ts";
import type { TestFile } from "../schemas/test.ts";

export interface ReportData {
  target: string;
  config: TargetConfig;
  ctx: RunContext;
  tests: TestFile;
  findings: FindingFile;
  coverage: CoverageFile;
  handover: Handover | undefined;
  journal: JournalEntry[];
  problems: string[];
}

/** Markdown link to a target-relative path. Reports live one level down, in reports/. */
function link(path: string, fromReports: boolean): string {
  return `[${path.split("/").pop()}](${fromReports ? "../" : ""}${path})`;
}

const oneLine = (text: string): string => text.replaceAll("\n", " ").replaceAll("|", "/");

export function findingMarkdown(f: Finding, fromReports: boolean): string {
  const lines = [
    `### ${f.id}: ${f.title}`,
    "",
    `- **Classification:** ${f.classification} · **Severity:** ${f.severity} · **Status:** ${f.status}`,
    `- **Found:** ${f.found.run}, role ${f.found.role ?? "?"}, ${f.found.environment}, version ${f.found.app_version ?? "?"}`,
    `- **Tests:** ${f.tests.join(", ")}${f.requirements.length > 0 ? ` · **Requirements:** ${f.requirements.join(", ")}` : ""}`,
    `- **Expected:** ${f.expected}`,
    `- **Actual:** ${f.actual}`,
  ];
  if (f.steps.length > 0) lines.push("- **Steps:**", ...f.steps.map((step, i) => `  ${i + 1}. ${step}`));
  const optional: [string, string][] = [
    ["Reproduction", f.reproduction],
    ["Impact (observed)", f.impact_observed],
    ["Impact (reasoned)", f.impact_reasoned],
    ["Uncertainty", f.uncertainty],
    ["Duplicate check", f.duplicate_check],
  ];
  lines.push(...optional.filter(([, value]) => value).map(([label, value]) => `- **${label}:** ${value}`));
  if (f.evidence.length > 0) lines.push(`- **Evidence:** ${f.evidence.map((e) => link(e, fromReports)).join(", ")}`);
  for (const h of f.history) {
    const evidence = h.evidence.length > 0 ? ` Evidence: ${h.evidence.map((e) => link(e, fromReports)).join(", ")}` : "";
    lines.push(`- *${h.t.slice(0, 16)} (${h.run}, version ${h.app_version ?? "?"}): ${h.from} → ${h.to}. ${h.note}*${evidence}`);
  }
  return `${lines.join("\n")}\n`;
}

export function coverageMarkdown(coverage: CoverageFile): string {
  const rows = Object.values(coverage).sort(
    (a, b) => COVERAGE_ORDER.indexOf(a.status) - COVERAGE_ORDER.indexOf(b.status) || a.area.localeCompare(b.area),
  );
  return `${[
    "| Area | Status | Tests | Note | Updated |",
    "|---|---|---|---|---|",
    ...rows.map((c) => `| ${c.area} | ${c.status} | ${c.tests.join(", ")} | ${oneLine(c.note)} | ${c.run} |`),
  ].join("\n")}\n`;
}

const JOURNAL_SECTIONS: [kind: string, title: string][] = [
  ["question", "Unresolved business questions"],
  ["assumption", "Assumptions"],
  ["data-change", "Data changed by this run"],
  ["limitation", "Exploration limitations"],
  ["stall", "Stalls and recovery"],
];

export function runReportMarkdown(data: ReportData): string {
  const { target, config, ctx, tests, findings, coverage, handover, journal, problems } = data;
  const { run } = ctx;
  const touched = Object.values(findings).filter(
    (f) => f.found.run === run.id || f.history.some((h) => h.run === run.id),
  );
  const active = touched.filter((f) => !INACTIVE_STATUSES.has(f.status));
  const confirmed = active.filter((f) => f.classification === "product-failure");
  const suspected = active.filter((f) => f.classification === "suspected-defect");
  const other = touched.filter((f) => !confirmed.includes(f) && !suspected.includes(f));
  const section = (items: Finding[]): string[] =>
    items.length > 0 ? items.map((f) => findingMarkdown(f, true)) : ["None recorded.", ""];

  const lines = [
    `# QA run report: ${config.name || target}`,
    "",
    `- **Target:** \`${target}\` · ${run.base_url} · environment ${run.environment} · version ${run.app_version ?? "not observed"}`,
    `- **Run:** ${run.id} · mode ${run.mode} · ${run.status} · started ${run.started.slice(0, 16)}` +
      (run.ended ? ` · ended ${run.ended.slice(0, 16)}` : ""),
    `- **Budget:** ${actionsUsed(ctx.dir)} of ${run.budget} browser actions (${run.budget_source})`,
    `- **Focus:** ${run.focus || "(none given)"}${run.scope_note ? ` · **Scope note:** ${run.scope_note}` : ""}`,
    `- **Tests:** ${Object.keys(tests).length} · ${formatCounts(testCounts(tests))}`,
    `- **Findings touched this run:** ${confirmed.length} confirmed product failures, ${suspected.length} suspected, ${other.length} other`,
    "",
  ];
  if (problems.length > 0) lines.push(`> **Record check:** ${problems.join("; ")}`, "");

  const identity = journal.filter((j) => j.kind === "role" || j.kind === "version");
  if (identity.length > 0) {
    lines.push("## Identity and version checks", "", ...identity.map((j) => `- ${j.t.slice(11, 16)} ${j.text}`), "");
  }
  lines.push("## Confirmed product failures", "", ...section(confirmed));
  lines.push("## Suspected issues (expectation needs confirmation)", "", ...section(suspected));
  if (other.length > 0) lines.push("## Automation, environment and other findings", "", ...section(other));

  lines.push(
    "## Tests executed",
    "",
    "| Test | Verdict | P | Title | Expected (basis) | Actual | Evidence |",
    "|---|---|---|---|---|---|---|",
  );
  for (const [id, test] of Object.entries(tests)) {
    const e = test.expectation;
    const revised = test.expectation_history.length > 0 ? ` *(revised ${test.expectation_history.length}×; original kept)*` : "";
    lines.push(
      `| ${id} | **${test.result?.status ?? "planned"}** | ${test.priority} | ${oneLine(test.title)} | ` +
        `${oneLine(e.text)} (${e.basis_type}: ${oneLine(e.basis)})${revised} | ${oneLine(test.result?.actual ?? "")} | ` +
        `${(test.result?.evidence ?? []).map((x) => link(x, true)).join(" ")} |`,
    );
  }
  lines.push("");

  const revisedTests = Object.values(tests).filter((t) => t.expectation_history.length > 0);
  if (revisedTests.length > 0) {
    lines.push("### Revised expectations", "");
    for (const test of revisedTests) {
      for (const old of test.expectation_history) {
        lines.push(
          `- **${test.id}** originally expected: ${old.text} (${old.basis_type}: ${old.basis}). ` +
            `Revised ${old.revised.slice(0, 16)}${old.after_result ? " after a result existed" : ""}: ${old.reason}`,
        );
      }
    }
    lines.push("");
  }

  lines.push("## Coverage", "", Object.keys(coverage).length > 0 ? coverageMarkdown(coverage) : "No coverage recorded.\n");
  for (const [kind, title] of JOURNAL_SECTIONS) {
    const rows = journal.filter((j) => j.kind === kind);
    if (rows.length > 0) lines.push(`## ${title}`, "", ...rows.map((j) => `- ${j.text}`), "");
  }
  lines.push(
    "## Handover",
    "",
    `- **State:** ${handover?.state ?? "(not checkpointed)"}`,
    `- **Next useful action:** ${handover?.next_action ?? "(not checkpointed)"}`,
  );
  if (handover?.blockers) lines.push(`- **Blockers:** ${handover.blockers}`);
  lines.push(
    "",
    `Knowledge: \`targets/${target}/knowledge/\` · run records and evidence: \`targets/${target}/runs/${run.id}/\``,
    "",
  );
  return lines.join("\n");
}
