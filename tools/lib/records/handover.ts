/** Checkpoints (what a fresh session needs to continue) and proposed general lessons. */
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { LESSONS_FILE, targetDir } from "../core/paths.ts";
import { appendJsonl, now, readJson, writeJson } from "../core/store.ts";
import { Handover } from "../schemas/handover.ts";
import { actionsUsed, loadRun, readTests, testCounts } from "./runs.ts";

export function readHandover(target: string): Handover | undefined {
  const raw = readJson<unknown>(join(targetDir(target), "handover.json"));
  return raw === undefined ? undefined : Handover.parse(raw);
}

export interface CheckpointInput {
  target: string;
  state: string;
  next: string;
  blockers?: string;
  questions?: string;
}

export function checkpoint(input: CheckpointInput): string[] {
  const ctx = loadRun(input.target);
  const root = targetDir(input.target);
  const handover: Handover = {
    saved: now(),
    run: ctx.run.id,
    mode: ctx.run.mode,
    environment: ctx.run.environment,
    app_version: ctx.run.app_version,
    role_at_save: ctx.run.role,
    actions_used: actionsUsed(ctx.dir),
    budget: ctx.run.budget,
    tests: testCounts(readTests(ctx.dir)),
    state: input.state,
    next_action: input.next,
    blockers: input.blockers ?? "",
    open_questions: input.questions ?? "see knowledge/questions.md",
  };
  writeJson(join(root, "handover.json"), handover);
  appendJsonl(join(root, "handover-history.jsonl"), handover);
  return [
    `checkpoint saved for ${input.target} (${ctx.run.id}): next action recorded`,
    "  also keep knowledge/*.md current (model, questions); render with tools/report.ts",
  ];
}

/** Append a general lesson to the shared proposals file, with its provenance. */
export function proposeLesson(target: string, text: string, basis: string): string[] {
  const { run } = loadRun(target);
  appendFileSync(
    LESSONS_FILE,
    `\n- **${text}**\n  - Basis: ${basis}\n  - Provenance: target \`${target}\`, ${run.id}, ${now().slice(0, 10)}. ` +
      "Status: proposed (one application's experience; not a universal expectation).\n",
    "utf8",
  );
  return ["lesson proposed in references/lessons-proposed.md (check it contains no target-specific names or data)"];
}
