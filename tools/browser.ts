/**
 * Browser tool: one Chromium, one tab, driven one observed step at a time.
 *
 * A browser is launched once (or an already signed-in one is attached) and every later call
 * re-attaches to the same tab, so state survives between calls. Every call takes --target;
 * evidence goes to that target's active run.
 *
 *   npx tsx tools/browser.ts <command> --help
 *
 * `open` and `act` each cost one action of the run budget and are logged to
 * runs/<run>/actions.jsonl. observe, text, shot, eval, frame, viewport and diagnose are free.
 */
import { Argument, Command, Option } from "commander";
import { act, ACTION_KINDS, evaluate, observeNow, open, readFrame, screenshot, type StepOutcome, visibleText } from "./lib/browser/actions.ts";
import { attachBrowser, cdpAlive, closeBrowser, launchBrowser, readBrowserState, setViewport, withSession } from "./lib/browser/session.ts";
import { diagnoseStall } from "./lib/browser/stall.ts";
import { fail, runCli } from "./lib/core/errors.ts";
import { budgetLine, findRunDir } from "./lib/records/runs.ts";

const program = new Command("browser").description("One Chromium, one tab, driven one observed step at a time");

const print = (lines: string[]): void => console.log(lines.join("\n"));
const integer = (value: string): number => Number.parseInt(value, 10);

function command(name: string, summary: string): Command {
  return program.command(name).description(summary).requiredOption("--target <id>", "target id");
}

function finish(outcome: StepOutcome): void {
  print(outcome.lines);
  process.exitCode = outcome.exitCode;
}

command("launch", "start Chromium with a per-target profile")
  .option("--headless", "no visible window")
  .option("--port <port>", "remote-debugging port (default: a free one)", integer)
  .action(async (o) => print(await launchBrowser(o.target, { headless: o.headless, port: o.port })));

command("attach", "use a browser the tester already opened and signed in to")
  .requiredOption("--cdp <url>", "e.g. http://127.0.0.1:9222")
  .action(async (o) => print(await attachBrowser(o.target, o.cdp)));

command("close", "close the launched browser (an attached one is left open)").action(async (o) => print(await closeBrowser(o.target)));

command("status", "browser endpoint, current tab and budget").action(async (o) => {
  const state = readBrowserState(o.target);
  if (!state) return print(["no browser recorded for this target"]);
  const alive = await cdpAlive(state.cdp);
  print([`cdp=${state.cdp} alive=${alive} attached=${state.attached} stalls=${state.stalls ?? 0}`]);
  if (alive && findRunDir(o.target)) {
    await withSession(o.target, async (session) => print([`tab: ${session.page.url()}`, budgetLine(session.ctx)]));
  }
});

command("viewport", "emulate a page size, e.g. a phone width, until reset (free; reload the page after changing it)")
  .option("--width <px>", "page width", integer)
  .option("--height <px>", "page height", integer, 812)
  .option("--reset", "back to the window size")
  .action((o) => {
    if (!o.reset && !o.width) fail("give --width <px> [--height <px>] or --reset (phone: 375x812, tablet: 768x1024)");
    print(setViewport(o.target, o.reset ? undefined : [o.width, o.height]));
  });

command("frame", "list embedded frames, or read one (free): its controls and text")
  .option("--match <text>", "part of the frame's title, name or address")
  .action(async (o) => print(await withSession(o.target, (s) => readFrame(s, o.match))));

command("open", "open the start URL (default) or a justified typed address")
  .option("--url <url>", "absolute, or relative to the start URL without a leading slash")
  .option("--reason <text>", "why a typed address is needed (it is itself the test)")
  .option("--label <text>", "screenshot label")
  .option("--over-budget")
  .action(async (o) =>
    finish(await withSession(o.target, (s) => open(s, { url: o.url, reason: o.reason, label: o.label, overBudget: o.overBudget }))),
  );

command("observe", "read the current page without acting (free)")
  .option("--label <text>")
  .option("--no-shot", "skip the screenshot")
  .option("--rows <n>", "table rows to read", integer, 25)
  .option("--text-chars <n>", "main text characters to print", integer, 1800)
  .action(async (o) =>
    print(await withSession(o.target, (s) => observeNow(s, { label: o.label, screenshot: o.shot, rows: o.rows, maxText: o.textChars }))),
  );

command("act", "perform one step, then observe")
  .addArgument(new Argument("<kind>", "what to do").choices(ACTION_KINDS))
  .option("--ref <ref>", "element ref from the latest observation, e.g. e12")
  .option("--role <role>", "accessibility role, with --name")
  .option("--name <name>", "accessible name")
  .option("--field <label>", "form field by its label")
  .option("--text <text>", "visible text")
  .option("--nth <n>", "which match, 0-based", integer, 0)
  .option("--loose", "substring match instead of exact")
  .option("--frame <text>", "look inside the embedded frame whose title, name or address contains this (with --role/--field/--text)")
  .option("--value <value>", "value for fill / select")
  .option("--secret <role.field>", "value from .local/accounts.yaml; never printed or logged")
  .option("--key <key>", "key for press", "Enter")
  .addOption(new Option("--dialog <policy>", "native confirm/alert during this step").choices(["accept", "dismiss"]))
  .option("--label <text>", "screenshot label")
  .option("--why <text>", "why this step (kept in the action log)")
  .option("--no-shot", "skip the screenshot")
  .option("--allow", "this control does not change data (read-only targets)")
  .option("--over-budget")
  .option("--text-chars <n>", "main text characters to print", integer, 1800)
  .action(async (kind, o) =>
    finish(
      await withSession(o.target, (s) =>
        act(s, {
          kind,
          ref: o.ref,
          role: o.role,
          name: o.name,
          field: o.field,
          text: o.text,
          nth: o.nth,
          loose: o.loose,
          frame: o.frame,
          value: o.value,
          secret: o.secret,
          key: o.key,
          dialog: o.dialog,
          label: o.label,
          why: o.why,
          screenshot: o.shot,
          allow: o.allow,
          overBudget: o.overBudget,
          maxText: o.textChars,
        }),
      ),
    ),
  );

command("text", "full visible text (free)")
  .option("--selector <css>", "element to read", "main")
  .action(async (o) => print(await withSession(o.target, (s) => visibleText(s, o.selector))));

command("shot", "extra screenshot (free)")
  .requiredOption("--label <text>")
  .option("--full-page")
  .action(async (o) => print(await withSession(o.target, (s) => screenshot(s, o.label, Boolean(o.fullPage)))));

command("eval", "read-only inspection of the page (free)")
  .requiredOption("--js <expression>")
  .action(async (o) => print(await withSession(o.target, (s) => evaluate(s, o.js))));

command("diagnose", "stall probes: site, page, application loading").action(async (o) =>
  print(await withSession(o.target, (s) => diagnoseStall(s, "manual diagnose", "(requested)"))),
);

await runCli(() => program.parseAsync());
