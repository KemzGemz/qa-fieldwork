/**
 * Browser steps. `open` and `act` each cost one action of the run budget and are logged with the
 * run's role, environment, version and active test. After each one the page is observed, so the
 * outcome is seen before the next step is chosen.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Locator } from "playwright";
import { Exit, fail } from "../core/errors.ts";
import { rel } from "../core/paths.ts";
import { appendJsonl, now, slug } from "../core/store.ts";
import { actionsUsed, budgetLine, getActiveTest } from "../records/runs.ts";
import { fingerprint, observe, readLastObservation, renderObservation } from "./observe.ts";
import { findLinkExpression } from "./page-script.ts";
import { firstLine, loadBrowserState, saveBrowserState, scopeProblem, scrub, secretValue, type Session } from "./session.ts";
import { diagnoseStall, markHealthy } from "./stall.ts";

export const ACTION_KINDS = ["click", "fill", "select", "check", "uncheck", "press", "hover", "back", "reload"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

/** Control names that suggest an irreversible action. Refused unless the target permits destructive actions. */
const DESTRUCTIVE = /\b(delete|remove|erase|purge|wipe|reset (all|data|database)|drop|destroy|factory)\b/i;
/** Control names that suggest a data change. Refused on read-only targets unless --allow is given. */
const MUTATING =
  /\b(save|create|add|submit|update|send|pay|approve|reject|confirm|cancel|void|post|issue|assign|import|upload|publish|archive|restore|refund|book|order|place)\b/i;

export interface StepOutcome {
  lines: string[];
  exitCode: number;
}

/** Append a row to the run's action log, stamped with role, environment, version and active test. */
function logAction(session: Session, row: Record<string, unknown>, counts: boolean): void {
  const { ctx, target } = session;
  const full = {
    t: now(),
    run: ctx.run.id,
    role: ctx.run.role,
    environment: ctx.run.environment,
    app_version: ctx.run.app_version,
    test: getActiveTest(target),
    counts,
    ...row,
  };
  appendJsonl(join(ctx.dir, "actions.jsonl"), JSON.parse(scrub(target, JSON.stringify(full))));
}

function requireBudget(session: Session, overBudget: boolean): void {
  const { run, dir } = session.ctx;
  if (run.status !== "active") fail(`run ${run.id} is closed; start a new run (records.ts run-start)`);
  if (actionsUsed(dir) >= run.budget && !overBudget) {
    fail(
      `action budget spent (${run.budget}). Checkpoint and report. Use --over-budget only to finish ` +
        "evidence for a test already in progress, and note it.",
    );
  }
}

const sameAddress = (a: string, b: string): boolean => a.replace(/\/$/, "") === b.replace(/\/$/, "");

// ---------------------------------------------------------------- open

export interface OpenInput {
  /** Address relative to the start URL, or absolute. Default: the start URL. */
  url?: string;
  /** Why a typed address is needed (required for anything but the start URL in start-only mode). */
  reason?: string;
  label?: string;
  overBudget?: boolean;
}

export async function open(session: Session, input: OpenInput): Promise<StepOutcome> {
  const { page, config, ctx, target } = session;
  requireBudget(session, Boolean(input.overBudget));
  const base = config.base_url;
  const url = input.url ? new URL(input.url, base).href : base;
  if (!/^https?:\/\//.test(url)) {
    fail(
      `--url resolved to '${url}', which is not an http(s) address. In Git Bash a leading '/' is rewritten ` +
        "to a Windows path: pass the full URL or a relative path without the leading slash (e.g. settings).",
    );
  }
  const problem = scopeProblem(config, url);
  if (problem) fail(problem);
  const direct = !sameAddress(url, base);
  if (direct && config.browser.direct_navigation === "start-only" && !input.reason) {
    fail(
      "direct loads are limited to the start URL: navigate through visible controls, or pass " +
        '--reason "..." when a typed address is itself the test (e.g. another user\'s record URL)',
    );
  }

  const before = page.url();
  let how = "direct load";
  try {
    let clicked = false;
    if (direct && !input.reason) {
      const index = await page.evaluate<number>(findLinkExpression(url.split("#")[0]!.replace(/\/$/, "")));
      if (index >= 0) {
        await page.locator("a[href]").nth(index).click({ timeout: config.browser.action_timeout_ms });
        clicked = true;
        how = "clicked a visible link";
      }
    }
    if (!clicked) await page.goto(url, { waitUntil: "domcontentloaded", timeout: config.browser.load_timeout_ms });
    await session.settle();
  } catch (error) {
    const message = firstLine(error);
    logAction(session, { kind: "open", desc: `open ${url}`, ok: false, error: message.slice(0, 300), url_before: before }, true);
    return { lines: await diagnoseStall(session, `open ${url}`, message), exitCode: Exit.actionFailed };
  }
  markHealthy(target);
  const observation = await observe(session, { label: input.label ?? "open" });
  logAction(
    session,
    {
      kind: "open",
      desc: `open ${url} (${how})`,
      reason: input.reason ?? null,
      ok: true,
      url_before: before,
      url_after: page.url(),
      observation: observation.path,
      screenshot: observation.screenshot,
    },
    true,
  );
  return { lines: [`opened (${how})`, ...renderObservation(session, observation), budgetLine(ctx)], exitCode: Exit.ok };
}

// ---------------------------------------------------------------- act

export interface Target {
  /** Element ref from the latest observation (e12). */
  ref?: string;
  role?: string;
  name?: string;
  /** Form field by its label. */
  field?: string;
  /** Visible text. */
  text?: string;
  nth?: number;
  /** Substring match instead of exact. */
  loose?: boolean;
}

export interface ActInput extends Target {
  kind: ActionKind;
  value?: string;
  /** `role.field` in .local/accounts.yaml; the value is never printed or logged. */
  secret?: string;
  key?: string;
  dialog?: "accept" | "dismiss";
  /** Screenshot label. */
  label?: string;
  /** Why this step (kept in the action log). */
  why?: string;
  screenshot?: boolean;
  /** This control does not change data (read-only targets). */
  allow?: boolean;
  overBudget?: boolean;
  maxText?: number;
}

type Role = Parameters<Session["page"]["getByRole"]>[0];

function locate(session: Session, input: Target): { locator: Locator; description: string } {
  const { page, target } = session;
  const nth = input.nth ?? 0;
  const exact = !input.loose;
  const ordinal = nth > 0 ? ` #${nth + 1}` : "";
  if (input.ref) {
    const last = readLastObservation(target);
    if (!last) fail("no observation yet: run observe first");
    if (last.url !== page.url()) {
      fail(`the page changed since the last observation (${last.url} -> ${page.url()}): observe again`);
    }
    const element = last.elements.find((e) => e.ref === input.ref);
    if (!element) {
      fail(`${input.ref} is not in the last observation (obs ${String(last.n).padStart(3, "0")}); observe again and pick a current ref`);
    }
    const description = `${element.role} "${element.name}"${element.nth > 0 ? ` #${element.nth + 1}` : ""}`;
    const locator = element.name
      ? page.getByRole(element.role as Role, { name: element.name, exact: true }).nth(element.nth)
      : page.getByRole(element.role as Role).nth(element.nth_role);
    return { locator, description };
  }
  if (input.role) {
    const options = input.name ? { name: input.name, exact } : {};
    return {
      locator: page.getByRole(input.role as Role, options).nth(nth),
      description: `${input.role} "${input.name ?? ""}"${ordinal}`,
    };
  }
  if (input.field) return { locator: page.getByLabel(input.field, { exact }).nth(nth), description: `field "${input.field}"` };
  if (input.text) return { locator: page.getByText(input.text, { exact }).nth(nth), description: `text "${input.text}"` };
  fail("give a locator: --ref eN | --role R --name N | --field LABEL | --text TEXT");
}

function hasLocator(input: Target): boolean {
  return Boolean(input.ref || input.role || input.field || input.text);
}

async function perform(session: Session, input: ActInput, locator: Locator | undefined, value: string | undefined): Promise<void> {
  const { page, config } = session;
  const timeout = config.browser.action_timeout_ms;
  const load = { waitUntil: "domcontentloaded" as const, timeout: config.browser.load_timeout_ms };
  const key = input.key ?? "Enter";
  switch (input.kind) {
    case "back":
      await page.goBack(load);
      return;
    case "reload":
      await page.reload(load);
      return;
    case "press":
      await (locator ? locator.press(key, { timeout }) : page.keyboard.press(key));
      return;
  }
  if (!locator) fail(`${input.kind} needs a locator`);
  switch (input.kind) {
    case "click":
      await locator.click({ timeout });
      return;
    case "fill":
      await locator.fill(value ?? "", { timeout });
      return;
    case "select":
      await locator.selectOption({ label: value ?? "" }, { timeout }).catch(() => locator.selectOption(value ?? "", { timeout }));
      return;
    case "check":
      await locator.check({ timeout });
      return;
    case "uncheck":
      await locator.uncheck({ timeout });
      return;
    case "hover":
      await locator.hover({ timeout });
      return;
  }
}

export async function act(session: Session, input: ActInput): Promise<StepOutcome> {
  const { page, config, ctx, target } = session;
  requireBudget(session, Boolean(input.overBudget));
  if (input.dialog) session.dialogPolicy = input.dialog;

  const value = input.secret ? secretValue(target, input.secret) : input.value;
  const shown = input.secret ? `<secret ${input.secret}>` : input.value;
  const needsLocator = !(input.kind === "back" || input.kind === "reload" || (input.kind === "press" && !hasLocator(input)));
  const located = needsLocator ? locate(session, input) : undefined;
  const description =
    `${input.kind} ${located?.description ?? ""}`.trim() +
    (shown !== undefined ? ` = '${shown}'` : "") +
    (input.kind === "press" ? ` key=${input.key ?? "Enter"}` : "");

  if (located && (input.kind === "click" || input.kind === "press")) {
    if (DESTRUCTIVE.test(located.description) && !config.permissions.destructive) {
      fail(
        `'${located.description}' looks destructive and this target forbids destructive actions (target.yaml permissions). ` +
          "Record the scenario as blocked/deferred, or get the tester's approval and update target.yaml.",
      );
    }
    if (MUTATING.test(located.description) && !config.permissions.change_data && !input.allow) {
      fail(
        `'${located.description}' looks data-changing and this target is read-only (permissions.change_data: false). ` +
          "Pass --allow only if this control does not change data.",
      );
    }
  }

  const repeat = loadBrowserState(target).repeat;
  if (repeat?.sig === description && repeat.unchanged >= config.recovery.repeat_limit) {
    fail(
      `'${description}' was repeated ${repeat.unchanged} times with no visible change. Stop repeating it: observe, ` +
        "run diagnose, try a different approach, or record the test as blocked.",
    );
  }

  const before = page.url();
  const previous = readLastObservation(target);
  try {
    await perform(session, input, located?.locator, value);
    await session.settle();
  } catch (error) {
    const message = firstLine(error);
    logAction(
      session,
      { kind: input.kind, desc: description, why: input.why ?? null, ok: false, error: message.slice(0, 300), url_before: before },
      true,
    );
    const lines = [`ACTION FAILED: ${description}`, ...(await diagnoseStall(session, description, message)), budgetLine(ctx)];
    return { lines, exitCode: Exit.actionFailed };
  }
  markHealthy(target);

  const observation = await observe(session, {
    label: input.label ?? `${input.kind}-${located?.description ?? ""}`,
    screenshot: input.screenshot,
  });
  const changed = !previous || fingerprint(observation) !== fingerprint(previous);
  const state = loadBrowserState(target);
  state.repeat = { sig: description, unchanged: changed ? 0 : repeat?.sig === description ? repeat.unchanged + 1 : 1 };
  saveBrowserState(target, state);
  logAction(
    session,
    {
      kind: input.kind,
      desc: description,
      why: input.why ?? null,
      ok: true,
      changed,
      url_before: before,
      url_after: page.url(),
      alerts: observation.alerts,
      native_dialogs: observation.native_dialogs,
      console_errors: observation.console_errors,
      http_errors: observation.http_errors,
      observation: observation.path,
      screenshot: observation.screenshot,
    },
    true,
  );

  const lines = [`did: ${description}`];
  if (!changed) lines.push("!! no visible change after this action (same URL, text, alerts and field values)");
  else if (page.url() !== before) lines.push(`navigated: ${before} -> ${page.url()}`);
  lines.push(...renderObservation(session, observation, { maxText: input.maxText }), budgetLine(ctx));
  return { lines, exitCode: Exit.ok };
}

// ---------------------------------------------------------------- free steps: observe, text, screenshot, eval

export async function observeNow(
  session: Session,
  input: { label?: string; screenshot?: boolean; rows?: number; maxText?: number },
): Promise<string[]> {
  await session.settle(4000);
  const observation = await observe(session, input);
  logAction(
    session,
    {
      kind: "observe",
      desc: `observe ${input.label ?? ""}`.trim(),
      ok: true,
      url_after: observation.url,
      observation: observation.path,
      screenshot: observation.screenshot,
    },
    false,
  );
  return renderObservation(session, observation, { maxText: input.maxText });
}

export async function visibleText(session: Session, selector: string): Promise<string[]> {
  const { page, target } = session;
  const locator = page.locator(selector);
  const text = (await locator.count()) > 0 ? await locator.first().innerText({ timeout: 5000 }) : await page.innerText("body");
  return [`[${page.url()}] ${selector}:`, scrub(target, text)];
}

export async function screenshot(session: Session, label: string, fullPage: boolean): Promise<string[]> {
  const { page, target, ctx } = session;
  const n = readdirSync(join(ctx.dir, "evidence")).filter((f) => f.endsWith(".png")).length + 1;
  const path = join(ctx.dir, "evidence", `shot-${String(n).padStart(3, "0")}-${slug(label)}.png`);
  await page.screenshot({ path, fullPage, timeout: 10000 });
  logAction(session, { kind: "shot", desc: `screenshot ${label}`, ok: true, url_after: page.url(), screenshot: rel(target, path) }, false);
  return [`screenshot: targets/${target}/${rel(target, path)}  (${page.url()})`];
}

/** Anything that would act on the page or leave it. `eval` is for reading only. */
const NOT_READ_ONLY =
  /\b(fetch|XMLHttpRequest|submit\(|\.click\(|localStorage\.(set|remove|clear)|document\.cookie\s*=|location\s*=|location\.(assign|replace|href\s*=))/;

export async function evaluate(session: Session, js: string): Promise<string[]> {
  if (NOT_READ_ONLY.test(js)) {
    fail("eval is for read-only inspection; perform actions with `act` so they are observed and logged");
  }
  const { page, target } = session;
  const result: unknown = await page.evaluate(js);
  logAction(session, { kind: "eval", desc: `eval ${js.slice(0, 200)}`, ok: true, url_after: page.url() }, false);
  return [scrub(target, JSON.stringify(result, null, 1) ?? "undefined").slice(0, 6000)];
}
