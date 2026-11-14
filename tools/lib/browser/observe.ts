/** Observations: what the page shows right now, saved as evidence and printed for the tester. */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { localDir, rel } from "../core/paths.ts";
import { now, readJson, slug, writeJson } from "../core/store.ts";
import { getActiveTest } from "../records/runs.ts";
import { type PageElement, parseAriaSnapshot } from "./aria.ts";
import { EMPTY_PAGE_FACTS, type PageFacts, type PageField, pageFactsExpression, type PageTable } from "./page-script.ts";
import { firstLine, scopeProblem, scrub, type Session } from "./session.ts";

/** runs/<run-id>/observations/NNN.json */
export interface Observation {
  n: number;
  t: string;
  run: string;
  role: string | null;
  environment: string;
  app_version: string | null;
  test: string | null;
  label: string;
  url: string;
  title: string;
  headings: string[];
  alerts: string[];
  dialog: string | null;
  modal: boolean;
  page_chrome: string[];
  fields: PageField[];
  tables: PageTable[];
  elements: PageElement[];
  main_text: string;
  busy_indicators: number;
  ready_state: string;
  native_dialogs: string[];
  console_errors: string[];
  http_errors: string[];
  popups: string[];
  /** Target-relative path of the screenshot, if one was taken. */
  screenshot: string | null;
  aria_snapshot: string;
  /** Target-relative path of this file. */
  path: string;
}

const lastObservationPath = (target: string): string => join(localDir(target), "last_observation.json");

export function readLastObservation(target: string): Observation | undefined {
  return readJson<Observation>(lastObservationPath(target));
}

export interface ObserveOptions {
  label?: string;
  screenshot?: boolean;
  /** Maximum table rows to read per table. */
  rows?: number;
}

export async function observe(session: Session, options: ObserveOptions = {}): Promise<Observation> {
  const { page, target, ctx } = session;
  const label = options.label ?? "";

  const snapshot = await page
    .locator("body")
    .ariaSnapshot({ timeout: 8000 })
    .catch((error: unknown) => `(aria snapshot unavailable: ${firstLine(error).slice(0, 120)})`);
  const aria = parseAriaSnapshot(snapshot);
  const facts = await page.evaluate<PageFacts>(pageFactsExpression(options.rows ?? 25)).catch(() => EMPTY_PAGE_FACTS);

  const n = readdirSync(join(ctx.dir, "observations")).filter((f) => f.endsWith(".json")).length + 1;
  const number = String(n).padStart(3, "0");
  let screenshot: string | null = null;
  if (options.screenshot !== false) {
    const name = slug(label);
    const shotPath = join(ctx.dir, "evidence", `${number}${name ? `-${name}` : ""}.png`);
    await page
      .screenshot({ path: shotPath, timeout: 8000 })
      .then(() => {
        screenshot = rel(target, shotPath);
      })
      .catch(() => undefined);
  }

  const path = join(ctx.dir, "observations", `${number}.json`);
  const raw: Observation = {
    n,
    t: now(),
    run: ctx.run.id,
    role: ctx.run.role,
    environment: ctx.run.environment,
    app_version: ctx.run.app_version,
    test: getActiveTest(target),
    label,
    url: page.url(),
    title: await page.title().catch(() => ""),
    headings: aria.headings,
    alerts: aria.alerts,
    dialog: aria.dialog,
    modal: facts.modal,
    page_chrome: facts.chrome,
    fields: facts.fields,
    tables: facts.tables,
    elements: aria.elements,
    main_text: facts.main_text.slice(0, 20000),
    busy_indicators: facts.busy,
    ready_state: facts.ready,
    native_dialogs: [...session.dialogs],
    console_errors: [...session.consoleErrors],
    http_errors: [...session.httpErrors],
    popups: [...session.popups],
    screenshot,
    aria_snapshot: snapshot.slice(0, 30000),
    path: rel(target, path),
  };
  const observation = JSON.parse(scrub(target, JSON.stringify(raw))) as Observation;
  writeJson(path, observation);
  writeJson(lastObservationPath(target), observation);
  return observation;
}

/** What "the page changed" means: address, headings, messages, dialog, text and field values. */
export function fingerprint(observation: Observation): string {
  return JSON.stringify([
    observation.url,
    observation.headings,
    observation.alerts,
    observation.dialog,
    observation.main_text.slice(0, 4000),
    observation.fields.map((f) => [f.label, f.value]),
  ]);
}

const quote = (text: string): string => `'${text}'`;

function fieldLine(field: PageField): string {
  const flags = (["required", "disabled", "readonly", "invalid"] as const).filter((k) => field[k]);
  const limits = (["min", "max", "step", "minlength", "maxlength", "pattern"] as const)
    .filter((k) => field[k])
    .map((k) => `${k}=${field[k]}`);
  const extra = [
    ...flags,
    ...limits,
    ...(field.options.length > 0 ? [`options=${field.options.join("/")}`] : []),
    ...(field.validation ? [`validation=${quote(field.validation)}`] : []),
  ];
  return `field: ${quote(field.label)} (${field.type}) = ${quote(field.value)} ${extra.join(" ")}`.trimEnd();
}

function elementLine(element: PageElement): string {
  const bits = [element.ref, element.role, JSON.stringify(element.name)];
  if (element.nth > 0) bits.push(`(#${element.nth + 1} with this name)`);
  if (element.href) bits.push(`-> ${element.href}`);
  if (element.value !== undefined) bits.push(`= ${quote(element.value)}`);
  if (element.attrs.length > 0) bits.push(`[${element.attrs.join(", ")}]`);
  if (element.in_dialog) bits.push("[in dialog]");
  return `  ${bits.join(" ")}`;
}

export interface RenderOptions {
  maxText?: number;
  maxElements?: number;
}

/** The observation as the lines a tester reads before choosing the next step. */
export function renderObservation(session: Session, observation: Observation, options: RenderOptions = {}): string[] {
  const { target, config } = session;
  const maxText = options.maxText ?? 1800;
  const maxElements = options.maxElements ?? 70;
  const prefix = `targets/${target}/`;
  const o = observation;
  const lines = [
    `[obs ${String(o.n).padStart(3, "0")}] ${o.url}`,
    `title: ${o.title}   role(run): ${o.role ?? "(not verified)"}   test: ${o.test ?? "-"}`,
  ];
  if (o.page_chrome.length > 0) lines.push(`header/footer: ${o.page_chrome.join(" || ").slice(0, 400)}`);
  if (o.headings.length > 0) lines.push(`headings: ${o.headings.slice(0, 12).join(" | ")}`);
  if (o.dialog) lines.push(`DIALOG open: ${o.dialog}${o.modal ? " (modal)" : ""}`);
  lines.push(...o.alerts.map((a) => `ALERT/STATUS: ${a}`));
  lines.push(...o.native_dialogs.map((d) => `NATIVE DIALOG ${d}`));
  lines.push(...o.fields.map(fieldLine));
  for (const table of o.tables) {
    lines.push(`table ${quote(table.name)}: ${table.row_count} rows; columns: ${table.columns.join(" | ")}`);
    lines.push(...table.rows.map((row) => `   ${row.join(" | ")}`));
    if (table.row_count > table.rows.length) {
      lines.push(`   ... ${table.row_count - table.rows.length} more rows (observe --rows N)`);
    }
  }
  lines.push("elements:", ...o.elements.slice(0, maxElements).map(elementLine));
  if (o.elements.length > maxElements) {
    lines.push(`  ... ${o.elements.length - maxElements} more (see ${prefix}${o.path})`);
  }
  const text = o.main_text;
  const more = text.length > maxText ? ` ... [${text.length - maxText} more chars: browser.ts text]` : "";
  lines.push(`text: ${text.slice(0, maxText).replaceAll("\n", " / ")}${more}`);
  if (o.busy_indicators > 0 || o.ready_state !== "complete") {
    lines.push(`loading: readyState=${o.ready_state} busy indicators=${o.busy_indicators}`);
  }
  lines.push(...o.console_errors.map((e) => `CONSOLE ERROR: ${e}`));
  lines.push(...o.http_errors.map((e) => `HTTP ERROR: ${e}`));
  lines.push(...o.popups.map((p) => `POPUP opened and closed (one-tab mode): ${p}`));
  const outOfScope = scopeProblem(config, o.url);
  if (outOfScope) lines.push(`!! OUT OF SCOPE: ${outOfScope}. Go back before continuing.`);
  if (o.screenshot) lines.push(`screenshot: ${prefix}${o.screenshot}`);
  lines.push(`observation: ${prefix}${o.path}`);
  return lines;
}
