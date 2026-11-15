import { z } from "zod";

export const RUN_MODES = ["default", "discovery", "resume", "retest"] as const;
export type RunMode = (typeof RUN_MODES)[number];

/** runs/<run-id>/run.json */
export const Run = z.looseObject({
  id: z.string(),
  target: z.string(),
  mode: z.enum(RUN_MODES),
  status: z.enum(["active", "closed"]),
  started: z.string(),
  ended: z.string().nullable(),
  environment: z.string(),
  base_url: z.string(),
  role: z.string().nullable(),
  role_verified_by: z.string().nullable(),
  app_version: z.string().nullable(),
  budget: z.number().int(),
  budget_source: z.string(),
  report_reserve: z.number(),
  focus: z.string(),
  scope_note: z.string(),
  /** Shared framework (tools, skill, references, templates) the run was made with. Absent in older runs. */
  framework: z.object({ commit: z.string(), dirty: z.boolean() }).nullish(),
});
export type Run = z.infer<typeof Run>;

/** One line of runs/<run-id>/actions.jsonl: a browser step, counted against the budget or not. */
export const ActionRow = z.looseObject({
  t: z.string(),
  run: z.string(),
  role: z.string().nullable(),
  environment: z.string(),
  app_version: z.string().nullable(),
  test: z.string().nullable(),
  counts: z.boolean(),
  kind: z.string(),
  desc: z.string(),
  ok: z.boolean(),
});
export type ActionRow = z.infer<typeof ActionRow>;

export const NOTE_KINDS = ["observation", "decision", "question", "assumption", "data-change", "limitation"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

/** One line of runs/<run-id>/journal.jsonl. Tools also write kinds of their own (role, version, stall). */
export interface JournalEntry {
  t: string;
  kind: string;
  text: string;
  [extra: string]: unknown;
}
