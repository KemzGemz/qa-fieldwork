/** Runs: one investigation session against a target, with its budget, role and journal. */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../core/config.ts";
import { fail } from "../core/errors.ts";
import { frameworkVersion } from "../core/git.ts";
import { localDir, targetDir } from "../core/paths.ts";
import { appendJsonl, countBy, formatCounts, now, readJson, readJsonl, readText, stamp, writeJson, writeText } from "../core/store.ts";
import type { Handover } from "../schemas/handover.ts";
import { type ActionRow, type JournalEntry, type NoteKind, Run, type RunMode } from "../schemas/run.ts";
import { statusOf, TestFile, type TestRecord } from "../schemas/test.ts";

export interface RunContext {
  /** Absolute path of runs/<run-id>/. */
  dir: string;
  run: Run;
}

const activeRunMarker = (target: string): string => join(localDir(target), "active_run");
const activeTestMarker = (target: string): string => join(localDir(target), "active_test");

/** Directory of the given run, or of the run last started for this target (the latest recorded one if unknown). */
export function findRunDir(target: string, runId?: string): string | undefined {
  const root = targetDir(target);
  let id = runId;
  if (!id) {
    const marker = activeRunMarker(target);
    id = existsSync(marker) ? readText(marker).trim() : "";
  }
  // No local marker (a fresh clone or worktree: .local/ is not committed): use the latest recorded run.
  if (!id) return listRunDirs(target).at(-1);
  const dir = join(root, "runs", id);
  return existsSync(join(dir, "run.json")) ? dir : undefined;
}

export function loadRun(target: string, runId?: string): RunContext {
  const dir = findRunDir(target, runId);
  if (!dir) {
    fail(
      runId
        ? `run '${runId}' not found in targets/${target}/runs/`
        : `no active run for target '${target}'. Start one: tools/records.ts run-start --target ${target} ...`,
    );
  }
  return { dir, run: Run.parse(readJson(join(dir, "run.json"))) };
}

export function saveRun(ctx: RunContext): void {
  writeJson(join(ctx.dir, "run.json"), ctx.run);
}

export function listRunDirs(target: string): string[] {
  const runs = join(targetDir(target), "runs");
  if (!existsSync(runs)) return [];
  return readdirSync(runs)
    .sort()
    .map((name) => join(runs, name))
    .filter((dir) => existsSync(join(dir, "run.json")));
}

// ---------------------------------------------------------------- actions and budget

export function readActions(runDir: string): ActionRow[] {
  return readJsonl<ActionRow>(join(runDir, "actions.jsonl"));
}

export function actionsUsed(runDir: string): number {
  return readActions(runDir).filter((row) => row.counts !== false).length;
}

export function budgetLine(ctx: RunContext): string {
  const used = actionsUsed(ctx.dir);
  const { budget, report_reserve } = ctx.run;
  const reserve = Math.round(budget * report_reserve);
  const left = budget - used;
  let note = "";
  if (left <= 0) note = "  ** BUDGET SPENT: checkpoint and report now **";
  else if (left <= reserve) {
    note = `  ** inside the reporting reserve (${reserve}): finish the current test, then checkpoint and report **`;
  }
  return `budget: ${used}/${budget} actions used, ${left} left${note}`;
}

// ---------------------------------------------------------------- journal and tests file

export function journal(runDir: string, kind: string, text: string, extra: Record<string, unknown> = {}): void {
  const entry: JournalEntry = { t: now(), kind, text, ...extra };
  appendJsonl(join(runDir, "journal.jsonl"), entry);
}

export function readJournal(runDir: string): JournalEntry[] {
  return readJsonl<JournalEntry>(join(runDir, "journal.jsonl"));
}

export function readTests(runDir: string): TestFile {
  return TestFile.parse(readJson(join(runDir, "tests.json"), {}));
}

export function writeTests(runDir: string, tests: TestFile): void {
  writeJson(join(runDir, "tests.json"), tests);
}

export function testCounts(tests: TestFile): Record<string, number> {
  return countBy(Object.values(tests), statusOf);
}

/** Every test of the target, across runs, in run order. */
export function allTests(target: string): { runId: string; test: TestRecord }[] {
  return listRunDirs(target).flatMap((dir) =>
    Object.values(readTests(dir)).map((test) => ({ runId: dir.split(/[\\/]/).pop() ?? "", test })),
  );
}

export function getActiveTest(target: string): string | null {
  const marker = activeTestMarker(target);
  return existsSync(marker) ? readText(marker).trim() || null : null;
}

export function setActiveTest(target: string, testId: string | null): void {
  writeText(activeTestMarker(target), testId ?? "");
}

// ---------------------------------------------------------------- commands

export interface RunStartInput {
  target: string;
  mode: RunMode;
  budget?: number;
  env?: string;
  focus?: string;
  scope?: string;
}

export function runStart(input: RunStartInput): string[] {
  const { target } = input;
  const config = loadConfig(target);
  const previous = findRunDir(target);
  if (previous) {
    const run = Run.parse(readJson(join(previous, "run.json")));
    if (run.status === "active") fail(`run ${run.id} is still active. Continue it, or close it with run-end first.`);
  }
  const id = `run-${stamp()}`;
  const dir = join(targetDir(target), "runs", id);
  mkdirSync(join(dir, "evidence"), { recursive: true });
  mkdirSync(join(dir, "observations"), { recursive: true });
  const budget = input.budget ?? config.budget.actions;
  const run: Run = {
    id,
    target,
    mode: input.mode,
    status: "active",
    started: now(),
    ended: null,
    environment: input.env ?? config.environment,
    base_url: config.base_url,
    role: null,
    role_verified_by: null,
    app_version: null,
    budget,
    budget_source: input.budget ? "supplied" : "default (tools/defaults.yaml or target.yaml)",
    report_reserve: config.budget.report_reserve,
    focus: input.focus ?? "",
    scope_note: input.scope ?? "",
    framework: frameworkVersion() ?? null,
  };
  saveRun({ dir, run });
  writeTests(dir, {});
  writeText(activeRunMarker(target), id);
  setActiveTest(target, null);
  return [
    `started ${id} for target ${target}: mode=${run.mode} budget=${budget} actions (${run.budget_source}), ` +
      `reserve ${Math.round(budget * run.report_reserve)} for reporting`,
    `evidence: targets/${target}/runs/${id}/evidence/`,
  ];
}

export function runStatus(target: string): string[] {
  const ctx = loadRun(target);
  const { run } = ctx;
  return [
    `${run.id} mode=${run.mode} status=${run.status} env=${run.environment} ` +
      `role=${run.role ?? "(not verified)"} version=${run.app_version ?? "?"}`,
    budgetLine(ctx),
    `tests: ${formatCounts(testCounts(readTests(ctx.dir)))}`,
  ];
}

export function runEnd(target: string): string[] {
  const ctx = loadRun(target);
  const handover = readJson<Handover>(join(targetDir(target), "handover.json"));
  if (!handover || handover.run !== ctx.run.id) {
    fail("checkpoint this run first (records.ts checkpoint --state .. --next ..), then run-end");
  }
  ctx.run.status = "closed";
  ctx.run.ended = now();
  saveRun(ctx);
  return [`closed ${ctx.run.id}. Render the report: tools/report.ts --target ${target}`];
}

export function setRole(target: string, role: string, verifiedBy: string): string[] {
  const ctx = loadRun(target);
  ctx.run.role = role;
  ctx.run.role_verified_by = verifiedBy;
  saveRun(ctx);
  journal(ctx.dir, "role", `acting as ${role}; identity verified by: ${verifiedBy}`);
  return [`current role: ${role}`];
}

export function setVersion(target: string, value: string, seen: string): string[] {
  const ctx = loadRun(target);
  const handover = readJson<Handover>(join(targetDir(target), "handover.json"));
  ctx.run.app_version = value;
  saveRun(ctx);
  journal(ctx.dir, "version", `application version ${value} seen at: ${seen}`);
  const lines: string[] = [];
  if (handover?.app_version && handover.app_version !== value) {
    lines.push(
      `!! version changed since the last handover (${handover.app_version} -> ${value}): ` +
        "earlier conclusions and open findings need re-verification before being relied on",
    );
  }
  lines.push(`app version: ${value}`);
  return lines;
}

export function addNote(target: string, kind: NoteKind, text: string, test?: string): string[] {
  const ctx = loadRun(target);
  journal(ctx.dir, kind, text, { role: ctx.run.role, test: test ?? null });
  return [`noted (${kind})`];
}
