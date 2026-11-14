/**
 * Generated views of a target's records: files a person reads, rebuilt from the authoritative
 * records every time a tool changes them. A view is never edited by hand and never read back by
 * the tools, so it cannot drift into a second copy of the state.
 *
 *   README.md      overview: application, latest run, counts, open questions, next action, links
 *   FINDINGS.md    every finding with its history            (from findings.json)
 *   COVERAGE.md    coverage by area                          (from coverage.json)
 *   HANDOVER.md    state and next action                     (from handover.json)
 *   reports/<run-id>.md   one run's report                   (from that run's records; `report.ts`)
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, type TargetConfig } from "../core/config.ts";
import { targetDir } from "../core/paths.ts";
import { countBy, formatCounts, readJson, readText, writeText } from "../core/store.ts";
import { readCoverage } from "../records/coverage.ts";
import { readFindings } from "../records/findings.ts";
import { readHandover } from "../records/handover.ts";
import { actionsUsed, listRunDirs, readTests, type RunContext, testCounts } from "../records/runs.ts";
import { COVERAGE_ORDER, type CoverageFile } from "../schemas/coverage.ts";
import { type FindingFile, INACTIVE_STATUSES } from "../schemas/finding.ts";
import type { Handover } from "../schemas/handover.ts";
import { RequirementManifest } from "../schemas/handover.ts";
import { Run } from "../schemas/run.ts";
import { coverageMarkdown, findingMarkdown, type ReportData, runReportMarkdown } from "./render.ts";

const GENERATED = "Generated from this target's records by the tools. Do not edit: change the records and the view follows.";

/** What is authoritative and what is generated. Printed in every target README and in the repository README. */
export const FILE_ROLES: readonly [path: string, role: "authoritative" | "generated" | "local", note: string][] = [
  ["target.yaml", "authoritative", "URL, environment, roles, scope, permissions. Edited by hand."],
  ["knowledge/*.md", "authoritative", "Reusable understanding: scope, requirements, system model, questions, test data. Edited by hand."],
  ["requirements/source/, requirements/manifest.json", "authoritative", "The requirement documents and their hashes. Written by `target.ts add-requirements`."],
  ["findings.json, coverage.json", "authoritative", "Findings and coverage, with history. Written by `records.ts`."],
  ["handover.json, handover-history.jsonl", "authoritative", "Latest checkpoint and every earlier one. Written by `records.ts checkpoint`."],
  ["runs/<run-id>/run.json, tests.json, actions.jsonl, journal.jsonl", "authoritative", "One run's history. Written by `records.ts` and `browser.ts`; never rewritten by later runs."],
  ["runs/<run-id>/evidence/, observations/", "authoritative", "Screenshots and page observations: the evidence behind verdicts. Written by `browser.ts`."],
  ["README.md, FINDINGS.md, COVERAGE.md, HANDOVER.md", "generated", "Views of the records above, rebuilt after every `records.ts`, `target.ts` and `report.ts` command."],
  ["reports/<run-id>.md", "generated", "One run's report, rebuilt by `report.ts --target <id> [--run <run-id>]`."],
  [".local/", "local", "Accounts, browser endpoint, last observation. Git-ignored; never committed."],
];

// ---------------------------------------------------------------- open questions

export interface OpenQuestion {
  id: string;
  question: string;
}

const cells = (row: string): string[] =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());

/**
 * Unanswered rows of the "Questions ..." table in knowledge/questions.md (the authoritative place
 * for questions). A row is open while its Answer cell is empty.
 */
export function openQuestions(markdown: string): OpenQuestion[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s+Questions/i.test(line));
  if (start < 0) return [];
  const table = lines.slice(start + 1).filter((line) => line.trim().startsWith("|"));
  const header = cells(table[0] ?? "").map((cell) => cell.toLowerCase());
  const answerColumn = header.indexOf("answer");
  const questionColumn = header.indexOf("question");
  if (answerColumn < 0 || questionColumn < 0) return [];
  return table
    .slice(2)
    .map(cells)
    .filter((row) => (row[questionColumn] ?? "") !== "" && (row[answerColumn] ?? "") === "")
    .map((row) => ({ id: row[0] ?? "", question: row[questionColumn] ?? "" }));
}

// ---------------------------------------------------------------- the overview

interface RunSummary {
  ctx: RunContext;
  tests: Record<string, number>;
  blockedTests: string[];
  hasReport: boolean;
}

function summariseRuns(target: string): RunSummary[] {
  const root = targetDir(target);
  return listRunDirs(target).map((dir) => {
    const run = Run.parse(readJson(join(dir, "run.json")));
    const tests = readTests(dir);
    return {
      ctx: { dir, run },
      tests: testCounts(tests),
      blockedTests: Object.values(tests)
        .filter((t) => t.result?.status === "blocked")
        .map((t) => `${t.id} ${t.title}`),
      hasReport: existsSync(join(root, "reports", `${run.id}.md`)),
    };
  });
}

function runLine(summary: RunSummary): string {
  const { run } = summary.ctx;
  const report = summary.hasReport ? `[report](reports/${run.id}.md)` : "no report rendered";
  return (
    `- ${run.id} · ${run.mode} · ${run.status} · ${run.started.slice(0, 16).replace("T", " ")} · ` +
    `${actionsUsed(summary.ctx.dir)}/${run.budget} actions · tests: ${formatCounts(summary.tests)} · ${report}`
  );
}

function countsTable(counts: Record<string, number>, order: readonly string[] = Object.keys(counts)): string[] {
  const keys = [...order.filter((k) => counts[k]), ...Object.keys(counts).filter((k) => !order.includes(k))];
  return ["| " + keys.join(" | ") + " |", "|" + keys.map(() => "---").join("|") + "|", "| " + keys.map((k) => counts[k]).join(" | ") + " |"];
}

interface OverviewData {
  target: string;
  config: TargetConfig;
  runs: RunSummary[];
  findings: FindingFile;
  coverage: CoverageFile;
  handover: Handover | undefined;
  questions: OpenQuestion[];
  requirementFiles: string[];
}

export function overviewMarkdown(data: OverviewData): string {
  const { target, config, runs, findings, coverage, handover, questions } = data;
  const latest = runs.at(-1);
  const version = [...runs].reverse().find((r) => r.ctx.run.app_version)?.ctx.run;
  const latestReport = [...runs].reverse().find((r) => r.hasReport)?.ctx.run.id;
  const roles = Object.keys(config.roles);
  const lines = [
    `# ${config.name || target}`,
    "",
    `Target \`${target}\`. ${GENERATED}`,
    "",
    "## Application and environment",
    "",
    `- **Start URL:** ${config.base_url}`,
    `- **Environment:** ${config.environment}`,
    `- **Version last observed:** ${version ? `${version.app_version} (${version.id})` : "not observed"}`,
    `- **Roles:** ${roles.length > 0 ? roles.join(", ") : "none recorded"}`,
    `- **Permissions:** data changes ${config.permissions.change_data ? "allowed" : "not allowed"}; ` +
      `destructive actions ${config.permissions.destructive ? "allowed" : "not allowed"}`,
    `- **Requirements:** ${
      data.requirementFiles.length > 0
        ? data.requirementFiles.map((name) => `[${name}](requirements/source/${encodeURI(name)})`).join(", ")
        : "none supplied"
    }`,
    "",
    "## Latest run",
    "",
  ];

  if (!latest) lines.push("No run yet.", "");
  else {
    const { run } = latest.ctx;
    lines.push(
      `- **Run:** ${run.id} · mode ${run.mode} · ${run.status}` +
        (run.status === "active" ? " (figures are as of the last record update)" : ""),
      `- **When:** started ${run.started.slice(0, 16).replace("T", " ")}` +
        (run.ended ? `, ended ${run.ended.slice(0, 16).replace("T", " ")}` : ""),
      `- **Role at the end:** ${run.role ?? "not verified"} · **Environment:** ${run.environment}`,
      `- **Budget:** ${actionsUsed(latest.ctx.dir)} of ${run.budget} browser actions`,
      `- **Focus:** ${run.focus || "none given"}`,
      `- **Tests:** ${formatCounts(latest.tests)}`,
      `- **Report:** ${latest.hasReport ? `[reports/${run.id}.md](reports/${run.id}.md)` : "not rendered yet (`report.ts`)"}`,
      "",
    );
    if (runs.length > 1) lines.push(`All runs (${runs.length}), oldest first:`, "", ...runs.map(runLine), "");
  }

  const all = Object.values(findings);
  const active = all.filter((f) => !INACTIVE_STATUSES.has(f.status));
  lines.push(`## Findings (${all.length})`, "");
  if (all.length === 0) lines.push("None recorded.", "");
  else {
    lines.push(
      `By classification: ${formatCounts(countBy(all, (f) => f.classification))}. By status: ${formatCounts(countBy(all, (f) => f.status))}.`,
      "",
      "| Finding | Severity | Classification | Status | Title |",
      "|---|---|---|---|---|",
      ...active.map((f) => `| ${f.id} | ${f.severity} | ${f.classification} | ${f.status} | ${f.title.replaceAll("|", "/")} |`),
      "",
      "Details, evidence and history: [FINDINGS.md](FINDINGS.md).",
      "",
    );
  }

  const areas = Object.values(coverage);
  lines.push(`## Coverage (${areas.length} ${areas.length === 1 ? "area" : "areas"})`, "");
  if (areas.length === 0) lines.push("None recorded.", "");
  else {
    lines.push(...countsTable(countBy(areas, (c) => c.status), COVERAGE_ORDER), "");
    const remaining = areas.filter((c) => c.status !== "covered" && c.status !== "out-of-scope");
    if (remaining.length > 0) {
      lines.push("Not fully covered:", "", ...remaining.map((c) => `- ${c.area} (${c.status})`), "");
    }
    lines.push("Notes and tests per area: [COVERAGE.md](COVERAGE.md).", "");
  }

  lines.push("## Open questions and blockers", "");
  if (questions.length > 0) {
    lines.push(...questions.map((q) => `- **${q.id}** ${q.question}`), "", "Source: [knowledge/questions.md](knowledge/questions.md).", "");
  } else lines.push("No unanswered question in [knowledge/questions.md](knowledge/questions.md).", "");
  const blockers = [
    ...(handover?.blockers ? [`Handover: ${handover.blockers}`] : []),
    ...areas.filter((c) => c.status === "blocked").map((c) => `Coverage blocked: ${c.area}. ${c.note}`),
    ...(latest?.blockedTests ?? []).map((t) => `Test blocked in the latest run: ${t}`),
  ];
  lines.push(blockers.length > 0 ? "Blockers:" : "No blockers recorded.", "");
  if (blockers.length > 0) lines.push(...blockers.map((b) => `- ${b}`), "");

  lines.push("## Next action", "");
  if (handover) {
    lines.push(
      handover.next_action,
      "",
      `Recorded ${handover.saved.slice(0, 16).replace("T", " ")} in ${handover.run}. State then: ${handover.state}`,
      "",
    );
  } else lines.push("No checkpoint yet.", "");

  lines.push(
    "## Navigate",
    "",
    "- [System model](knowledge/system-model.md): screens, entities, relationships, workflows",
    "- [Findings](FINDINGS.md) · [Coverage](COVERAGE.md) · [Handover](HANDOVER.md)",
    `- Latest report: ${latestReport ? `[reports/${latestReport}.md](reports/${latestReport}.md)` : "none rendered yet"}`,
    "- Knowledge: [scope](knowledge/scope.md) · [requirements](knowledge/requirements.md) · " +
      "[questions](knowledge/questions.md) · [test data](knowledge/test-data.md)",
    "- Run records and evidence: `runs/<run-id>/` (`tests.json`, `actions.jsonl`, `journal.jsonl`, `evidence/`, `observations/`)",
    "",
    "## Files",
    "",
    "| Path | Role | What it is |",
    "|---|---|---|",
    ...FILE_ROLES.map(([path, role, note]) => `| \`${path}\` | ${role} | ${note} |`),
    "",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------- writing

/** Rebuild README.md, FINDINGS.md, COVERAGE.md and HANDOVER.md from the target's records. */
export function refreshTargetViews(target: string): void {
  const root = targetDir(target);
  const config = loadConfig(target);
  const findings = readFindings(target);
  const coverage = readCoverage(target);
  const handover = readHandover(target);
  const runs = summariseRuns(target);
  const questionsFile = join(root, "knowledge", "questions.md");
  const manifest = RequirementManifest.parse(readJson(join(root, "requirements", "manifest.json"), { files: [] }));
  const latestReport = [...runs].reverse().find((r) => r.hasReport)?.ctx.run.id;

  writeText(
    join(root, "README.md"),
    overviewMarkdown({
      target,
      config,
      runs,
      findings,
      coverage,
      handover,
      questions: existsSync(questionsFile) ? openQuestions(readText(questionsFile)) : [],
      requirementFiles: manifest.files.map((f) => f.name),
    }),
  );
  writeText(
    join(root, "FINDINGS.md"),
    `# Findings: ${target}\n\nFrom \`findings.json\`. ${GENERATED} Overview: [README.md](README.md).\n\n` +
      (Object.values(findings).map((f) => findingMarkdown(f, false)).join("\n") || "None recorded.\n"),
  );
  writeText(
    join(root, "COVERAGE.md"),
    `# Coverage: ${target}\n\nFrom \`coverage.json\`. ${GENERATED} Overview: [README.md](README.md).\n\n` +
      (Object.keys(coverage).length > 0 ? coverageMarkdown(coverage) : "None recorded.\n"),
  );
  writeText(
    join(root, "HANDOVER.md"),
    [
      `# Handover: ${target}`,
      "",
      `From \`handover.json\`. ${GENERATED} Overview: [README.md](README.md).`,
      "",
      `A fresh session starts with \`npx tsx tools/target.ts status --target ${target}\`, then reads \`knowledge/\`.`,
      "",
      `- **Saved:** ${handover?.saved ?? "-"} · run ${handover?.run ?? "-"} · version ${handover?.app_version ?? "?"} · ` +
        `${handover?.actions_used ?? 0}/${handover?.budget ?? 0} actions`,
      `- **State:** ${handover?.state ?? "-"}`,
      `- **Next action:** ${handover?.next_action ?? "-"}`,
      `- **Blockers:** ${handover?.blockers || "none"}`,
      `- **Open questions:** ${handover?.open_questions ?? "-"}`,
      `- **Latest report:** ${latestReport ? `[reports/${latestReport}.md](reports/${latestReport}.md)` : "none rendered yet"}`,
      "",
    ].join("\n"),
  );
}

/** Write reports/<run-id>.md for one run, then refresh the target views (the overview links to it). */
export function writeRunReport(data: ReportData): string[] {
  const { target, ctx } = data;
  writeText(join(targetDir(target), "reports", `${ctx.run.id}.md`), runReportMarkdown(data));
  refreshTargetViews(target);
  return [
    `report: targets/${target}/reports/${ctx.run.id}.md`,
    `views refreshed: targets/${target}/README.md, FINDINGS.md, COVERAGE.md, HANDOVER.md`,
  ];
}
