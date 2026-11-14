import { z } from "zod";

export const COVERAGE_STATUSES = ["covered", "partial", "not-covered", "blocked", "deferred", "out-of-scope"] as const;
export type CoverageStatus = (typeof COVERAGE_STATUSES)[number];

/** Report order: what still needs attention comes first. */
export const COVERAGE_ORDER: readonly CoverageStatus[] = [
  "not-covered",
  "blocked",
  "deferred",
  "partial",
  "covered",
  "out-of-scope",
];

const CoverageSnapshot = z.looseObject({
  status: z.enum(COVERAGE_STATUSES),
  note: z.string(),
  tests: z.array(z.string()),
  run: z.string(),
  updated: z.string(),
});

export const CoverageEntry = CoverageSnapshot.extend({
  area: z.string(),
  requirements: z.array(z.string()),
  /** Earlier states of this area, oldest first. */
  history: z.array(CoverageSnapshot),
});
export type CoverageEntry = z.infer<typeof CoverageEntry>;

/** targets/<id>/coverage.json, keyed by a slug of the area name. */
export const CoverageFile = z.record(z.string(), CoverageEntry);
export type CoverageFile = z.infer<typeof CoverageFile>;
