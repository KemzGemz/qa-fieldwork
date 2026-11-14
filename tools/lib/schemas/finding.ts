import { z } from "zod";

export const CLASSIFICATIONS = [
  "product-failure",
  "suspected-defect",
  "automation-failure",
  "environment",
  "inconclusive",
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

/** Classifications that say the product is (or may be) wrong, and so must rest on an executed test. */
export const DEFECT_CLASSES: ReadonlySet<Classification> = new Set(["product-failure", "suspected-defect"]);

export const FINDING_STATUSES = [
  "open",
  "suspected",
  "confirmed",
  "fixed",
  "retest-passed",
  "retest-failed",
  "withdrawn",
  "duplicate",
] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];
export const INACTIVE_STATUSES: ReadonlySet<FindingStatus> = new Set(["withdrawn", "duplicate"]);

export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const FindingHistoryEntry = z.looseObject({
  t: z.string(),
  run: z.string(),
  from: z.string(),
  to: z.string(),
  note: z.string(),
  evidence: z.array(z.string()).default([]),
  app_version: z.string().nullable(),
  role: z.string().nullable(),
});
export type FindingHistoryEntry = z.infer<typeof FindingHistoryEntry>;

export const Finding = z.looseObject({
  id: z.string(),
  title: z.string(),
  classification: z.enum(CLASSIFICATIONS),
  severity: z.enum(SEVERITIES),
  status: z.enum(FINDING_STATUSES),
  tests: z.array(z.string()),
  requirements: z.array(z.string()),
  expected: z.string(),
  actual: z.string(),
  steps: z.array(z.string()),
  reproduction: z.string(),
  impact_observed: z.string(),
  impact_reasoned: z.string(),
  uncertainty: z.string(),
  duplicate_check: z.string(),
  evidence: z.array(z.string()),
  found: z.object({
    run: z.string(),
    role: z.string().nullable(),
    environment: z.string(),
    app_version: z.string().nullable(),
    t: z.string(),
  }),
  history: z.array(FindingHistoryEntry),
});
export type Finding = z.infer<typeof Finding>;

/** targets/<id>/findings.json */
export const FindingFile = z.record(z.string(), Finding);
export type FindingFile = z.infer<typeof FindingFile>;
