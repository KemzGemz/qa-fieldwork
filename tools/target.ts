/**
 * Target management: one directory per application under targets/.
 *
 *   npx tsx tools/target.ts list
 *   npx tsx tools/target.ts init   --target ID --url URL [--name N] [--env local|test|staging|production]
 *   npx tsx tools/target.ts status --target ID                      what a session loads first (also to resume)
 *   npx tsx tools/target.ts check  --target ID --url URL [--env E]  does this URL/environment belong to the target?
 *   npx tsx tools/target.ts add-requirements --target ID FILE...    copy documents in, record hashes, extract PDF text
 *
 * Exit codes: 0 ok, 2 usage/validation error, 3 target mismatch (resolve before executing).
 */
import { Command, Option } from "commander";
import { runCli } from "./lib/core/errors.ts";
import { currentBranch, requireTargetBranch } from "./lib/core/git.ts";
import { refreshTargetViews } from "./lib/report/views.ts";
import { addRequirements, checkTarget, ENVIRONMENTS, initTarget, listTargetLines, statusLines } from "./lib/target/admin.ts";

const program = new Command("target").description("One directory per application under targets/");
const print = (lines: string[]): void => console.log(lines.join("\n"));

program.command("list").description("all targets").action(() => print(listTargetLines()));

program
  .command("init")
  .description("create a target from templates/target/ (on its sut/<id> branch, not on main)")
  .requiredOption("--target <id>")
  .requiredOption("--url <url>", "start URL")
  .option("--name <name>", "display name")
  .addOption(new Option("--env <environment>").choices(ENVIRONMENTS).default("test"))
  .option("--allow-base-branch", "create the target even on main (throw-away checks only)")
  .action((o) => {
    requireTargetBranch(o.target, currentBranch(), o.allowBaseBranch);
    print(initTarget({ target: o.target, url: o.url, name: o.name, env: o.env }));
    refreshTargetViews(o.target);
  });

program
  .command("status")
  .description("configuration, knowledge, runs, findings and the next action")
  .requiredOption("--target <id>")
  .action((o) => {
    refreshTargetViews(o.target); // also picks up hand edits to target.yaml and knowledge/questions.md
    print(statusLines(o.target));
  });

program
  .command("check")
  .description("verify that a URL and environment belong to the target (exit 3 on mismatch)")
  .requiredOption("--target <id>")
  .requiredOption("--url <url>")
  .option("--env <environment>")
  .action((o) => {
    const { lines, exitCode } = checkTarget(o.target, o.url, o.env);
    print(lines);
    process.exitCode = exitCode;
  });

program
  .command("add-requirements")
  .description("copy requirement documents into the target and record their hashes")
  .requiredOption("--target <id>")
  .argument("<files...>")
  .action(async (files: string[], o) => {
    print(await addRequirements(o.target, files));
    refreshTargetViews(o.target);
  });

await runCli(() => program.parseAsync());
