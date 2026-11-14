/**
 * Render a target's records into readable reports, and check them.
 *
 *   npx tsx tools/report.ts --target T [--run RUN_ID] [--check-only]
 *
 * Writes reports/<run-id>.md and refreshes the generated views of the target (README.md, FINDINGS.md,
 * COVERAGE.md, HANDOVER.md). Views are rebuilt from the records every time; they are never read back.
 * The integrity check lists records that would mislead a reader (missing evidence files, verdicts
 * without activity, open tests). Exit code 1 if it finds problems.
 */
import { Command } from "commander";
import { loadConfig } from "./lib/core/config.ts";
import { Exit, runCli } from "./lib/core/errors.ts";
import { readCoverage } from "./lib/records/coverage.ts";
import { readFindings } from "./lib/records/findings.ts";
import { readHandover } from "./lib/records/handover.ts";
import { loadRun, readJournal, readTests } from "./lib/records/runs.ts";
import { checkRecords } from "./lib/report/check.ts";
import { refreshTargetViews, writeRunReport } from "./lib/report/views.ts";

const program = new Command("report")
  .description("Render a target's records into reports and check them")
  .requiredOption("--target <id>")
  .option("--run <run-id>", "default: the run last started")
  .option("--check-only", "check the records without writing the run report")
  .action((o: { target: string; run?: string; checkOnly?: boolean }) => {
    const ctx = loadRun(o.target, o.run);
    const tests = readTests(ctx.dir);
    const findings = readFindings(o.target);
    const problems = checkRecords(o.target, tests, findings);
    if (o.checkOnly) refreshTargetViews(o.target);
    else {
      const lines = writeRunReport({
        target: o.target,
        config: loadConfig(o.target),
        ctx,
        tests,
        findings,
        coverage: readCoverage(o.target),
        handover: readHandover(o.target),
        journal: readJournal(ctx.dir),
        problems,
      });
      console.log(lines.join("\n"));
    }
    if (problems.length > 0) {
      console.log([`RECORD CHECK: ${problems.length} problem(s)`, ...problems.map((p) => `- ${p}`)].join("\n"));
      process.exitCode = Exit.recordCheckFailed;
      return;
    }
    console.log("record check: ok");
  });

await runCli(() => program.parseAsync());
