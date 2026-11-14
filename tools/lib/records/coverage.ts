/** Coverage by area: what was covered, and what was knowingly left, with the reason. */
import { join } from "node:path";
import { targetDir } from "../core/paths.ts";
import { now, readJson, slug, writeJson } from "../core/store.ts";
import { CoverageFile, type CoverageStatus } from "../schemas/coverage.ts";
import { loadRun } from "./runs.ts";

const coveragePath = (target: string): string => join(targetDir(target), "coverage.json");

export function readCoverage(target: string): CoverageFile {
  return CoverageFile.parse(readJson(coveragePath(target), {}));
}

export interface CoverageInput {
  target: string;
  area: string;
  status: CoverageStatus;
  note: string;
  tests?: string[];
  req?: string[];
}

export function setCoverage(input: CoverageInput): string[] {
  const { run } = loadRun(input.target);
  const coverage = readCoverage(input.target);
  const key = slug(input.area, 200);
  const previous = coverage[key];
  const history = previous?.history ?? [];
  if (previous) {
    const { status, note, tests, run: previousRun, updated } = previous;
    history.push({ status, note, tests, run: previousRun, updated });
  }
  coverage[key] = {
    area: input.area,
    status: input.status,
    note: input.note,
    tests: input.tests ?? [],
    requirements: input.req ?? [],
    run: run.id,
    updated: now(),
    history,
  };
  writeJson(coveragePath(input.target), coverage);
  return [`coverage: ${input.area} = ${input.status}`];
}
