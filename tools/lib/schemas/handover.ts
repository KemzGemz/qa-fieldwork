import { z } from "zod";

/** targets/<id>/handover.json: what a fresh session needs first. Each save is also appended to handover-history.jsonl. */
export const Handover = z.looseObject({
  saved: z.string(),
  run: z.string(),
  mode: z.string(),
  environment: z.string(),
  app_version: z.string().nullable(),
  role_at_save: z.string().nullable(),
  actions_used: z.number().int(),
  budget: z.number().int(),
  tests: z.record(z.string(), z.number()),
  state: z.string(),
  next_action: z.string(),
  blockers: z.string(),
  open_questions: z.string(),
});
export type Handover = z.infer<typeof Handover>;

/** targets/<id>/requirements/manifest.json */
export const RequirementManifest = z.object({
  files: z.array(
    z.looseObject({
      name: z.string(),
      sha256: z.string(),
      added: z.string(),
      origin: z.string().optional(),
      history: z.array(z.object({ sha256: z.string(), added: z.string() })).optional(),
    }),
  ),
});
export type RequirementManifest = z.infer<typeof RequirementManifest>;
