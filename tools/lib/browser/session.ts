/**
 * One browser, one tab. A browser is launched once (or an already signed-in one is attached) and
 * every tool call re-attaches to the same tab over CDP, so page state survives between calls.
 */
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { type Browser, type BrowserContext, chromium, type Dialog, type Page, type Response } from "playwright";
import { parse } from "yaml";
import { allowedOrigins, loadConfig, originOf, type TargetConfig } from "../core/config.ts";
import { fail } from "../core/errors.ts";
import { localDir, machineDir, targetDir } from "../core/paths.ts";
import { now, readJson, readText, writeJson } from "../core/store.ts";
import { loadRun, type RunContext } from "../records/runs.ts";
import { RequestTracker } from "./request-tracker.ts";

/** targets/<id>/.local/browser.json */
export interface BrowserState {
  cdp: string;
  pid: number | null;
  launched: string;
  headless?: boolean;
  /** True for a browser the tester started themselves: never closed by the tools. */
  attached: boolean;
  /** Consecutive stalls since the last successful action. */
  stalls: number;
  /** The last action and how many times in a row it changed nothing. */
  repeat?: { sig: string; unchanged: number };
}

const statePath = (target: string): string => join(localDir(target), "browser.json");

export function readBrowserState(target: string): BrowserState | undefined {
  return readJson<BrowserState>(statePath(target));
}

export function loadBrowserState(target: string): BrowserState {
  const state = readBrowserState(target);
  if (!state) {
    fail(`no browser for target '${target}'. Run: tools/browser.ts launch --target ${target}  (or attach --cdp ...)`);
  }
  return state;
}

export function saveBrowserState(target: string, state: BrowserState): void {
  writeJson(statePath(target), state);
}

export function forgetBrowser(target: string): void {
  rmSync(statePath(target), { force: true });
}

// ---------------------------------------------------------------- secrets and scope

type Accounts = { roles?: Record<string, Record<string, unknown> | null> };
const SECRET_KEYS = ["password", "secret", "token", "otp", "pin"];

function readAccounts(target: string): Accounts {
  const path = join(localDir(target), "accounts.yaml");
  return existsSync(path) ? ((parse(readText(path)) ?? {}) as Accounts) : {};
}

/** Value of `role.field` from .local/accounts.yaml. */
export function secretValue(target: string, reference: string): string {
  const [role = "", field = ""] = reference.split(".", 2);
  const value = readAccounts(target).roles?.[role]?.[field];
  if (value === undefined || value === null) {
    fail(`no '${reference}' in targets/${target}/.local/accounts.yaml (roles: <role>: <field>: value)`);
  }
  return String(value);
}

/** Remove secret values from anything printed or saved. */
export function scrub(target: string, text: string): string {
  let out = text;
  for (const role of Object.values(readAccounts(target).roles ?? {})) {
    for (const [key, value] of Object.entries(role ?? {})) {
      const secret = String(value ?? "");
      if (SECRET_KEYS.some((k) => key.toLowerCase().includes(k)) && secret.length >= 4) {
        out = out.split(secret).join("<hidden>");
        out = out.split(JSON.stringify(secret).slice(1, -1)).join("<hidden>");
      }
    }
  }
  return out;
}

/** Is this address part of the target (its origins, minus excluded areas)? */
export function scopeProblem(config: TargetConfig, url: string): string | undefined {
  if (!url.startsWith("http")) return undefined;
  if (!allowedOrigins(config).has(originOf(url))) {
    return `${url} is outside this target's origins ${JSON.stringify([...allowedOrigins(config)].sort())}`;
  }
  const excluded = config.scope.exclude.find((pattern) => new RegExp(pattern).test(url));
  return excluded ? `${url} matches excluded area '${excluded}'` : undefined;
}

// ---------------------------------------------------------------- launch, attach, close

export async function cdpAlive(cdp: string): Promise<boolean> {
  try {
    const response = await fetch(`${cdp.replace(/\/$/, "")}/json/version`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function launchBrowser(target: string, options: { headless?: boolean; port?: number }): Promise<string[]> {
  const config = loadConfig(target);
  const existing = readBrowserState(target);
  if (existing && (await cdpAlive(existing.cdp))) return [`browser already running for ${target} at ${existing.cdp}`];

  const port = options.port ?? (await freePort());
  const headless = options.headless || config.browser.headless;
  const [width, height] = config.browser.viewport;
  const profile = machineDir(target);
  const args = [
    ...(headless ? ["--headless=new"] : []),
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=Translate",
    `--window-size=${width},${height}`,
    "about:blank",
  ];
  const child = spawn(chromium.executablePath(), args, { detached: true, stdio: "ignore", windowsHide: headless });
  child.unref();

  const cdp = `http://127.0.0.1:${port}`;
  let alive = false;
  for (let attempt = 0; attempt < 60 && !alive; attempt++) {
    alive = await cdpAlive(cdp);
    if (!alive) await sleep(250);
  }
  if (!alive) fail("Chromium did not start (run: npx playwright install chromium)");
  saveBrowserState(target, { cdp, pid: child.pid ?? null, launched: now(), headless, attached: false, stalls: 0 });
  return [
    `launched Chromium for target ${target} at ${cdp} (${headless ? "headless" : "visible"}); ` +
      `profile kept outside the repo in ${profile}`,
  ];
}

export async function attachBrowser(target: string, cdp: string): Promise<string[]> {
  targetDir(target);
  if (!(await cdpAlive(cdp))) {
    fail(`nothing answers at ${cdp}. Start the browser with --remote-debugging-port=<port> first.`);
  }
  saveBrowserState(target, { cdp, pid: null, launched: now(), attached: true, stalls: 0 });
  return [`attached target ${target} to the existing browser at ${cdp} (its tabs and sign-in are left alone on close)`];
}

export async function closeBrowser(target: string): Promise<string[]> {
  const state = loadBrowserState(target);
  const lines: string[] = [];
  if (state.attached) {
    lines.push("attached browser left open (it belongs to the tester)");
  } else if (await cdpAlive(state.cdp)) {
    try {
      const browser = await chromium.connectOverCDP(state.cdp, { timeout: 5000 });
      const session = await browser.newBrowserCDPSession();
      await session.send("Browser.close").catch(() => undefined);
    } catch {
      // already going away
    }
    await sleep(500);
    if ((await cdpAlive(state.cdp)) && state.pid) {
      try {
        process.kill(state.pid);
      } catch {
        // already gone
      }
    }
    lines.push("browser closed");
  }
  forgetBrowser(target);
  return lines;
}

// ---------------------------------------------------------------- a session for one tool call

const INTERNAL_PAGE = /^(devtools|chrome|chrome-extension):\/\//;

/** Attached to the target's browser for the length of one tool call. */
export class Session {
  readonly consoleErrors: string[] = [];
  readonly httpErrors: string[] = [];
  readonly dialogs: string[] = [];
  readonly popups: string[] = [];
  readonly tracker = new RequestTracker();
  dialogPolicy: "accept" | "dismiss";

  private constructor(
    readonly target: string,
    readonly config: TargetConfig,
    readonly ctx: RunContext,
    readonly browser: Browser,
    readonly context: BrowserContext,
    readonly page: Page,
    private readonly pagesAtStart: Set<Page>,
  ) {
    this.dialogPolicy = config.browser.dialogs;
  }

  static async open(target: string): Promise<Session> {
    const config = loadConfig(target);
    const state = loadBrowserState(target);
    const ctx = loadRun(target);
    let browser: Browser;
    try {
      browser = await chromium.connectOverCDP(state.cdp, { timeout: 8000 });
    } catch (error) {
      fail(
        `cannot reach the browser at ${state.cdp} (${firstLine(error).slice(0, 120)}). ` +
          `It was probably closed: tools/browser.ts launch --target ${target}`,
      );
    }
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const pages = context.pages().filter((p) => !INTERNAL_PAGE.test(p.url()));
    const inTarget = pages.filter((p) => p.url().startsWith("http") && !scopeProblem(config, p.url()));
    const page = inTarget[0] ?? pages[0] ?? (await context.newPage());
    const session = new Session(target, config, ctx, browser, context, page, new Set(context.pages()));
    session.wire();
    return session;
  }

  private wire(): void {
    const { page } = this;
    page.setDefaultTimeout(this.config.browser.action_timeout_ms);
    page.on("console", (message) => {
      if (message.type() === "error") {
        this.consoleErrors.push(`${message.text().slice(0, 300)} [${message.location().url.slice(0, 160)}]`);
      }
    });
    page.on("pageerror", (error) => this.consoleErrors.push(`pageerror: ${String(error).slice(0, 300)}`));
    page.on("response", (response) => this.onResponse(response));
    page.on("dialog", (dialog) => void this.onDialog(dialog));
    this.tracker.attach(page);
  }

  private onResponse(response: Response): void {
    const type = response.request().resourceType();
    if (response.status() >= 400 && ["document", "xhr", "fetch"].includes(type)) {
      this.httpErrors.push(`${response.status()} ${response.request().method()} ${response.url().slice(0, 200)}`);
    }
  }

  private async onDialog(dialog: Dialog): Promise<void> {
    this.dialogs.push(`${dialog.type()} [${this.dialogPolicy}ed]: ${dialog.message().slice(0, 300)}`);
    await (this.dialogPolicy === "accept" ? dialog.accept() : dialog.dismiss()).catch(() => undefined);
  }

  /** Bounded waits: the document itself, then at most `quiet_ms` of network quiet. Never "everything finished". */
  async settle(loadMs = this.config.browser.load_timeout_ms): Promise<void> {
    await this.page.waitForLoadState("domcontentloaded", { timeout: loadMs }).catch(() => undefined);
    await this.page.waitForLoadState("networkidle", { timeout: this.config.browser.quiet_ms }).catch(() => undefined);
    await sleep(100);
    if (!this.config.browser.one_tab) return;
    // one-tab mode: record popups this call opened, then close them
    for (const popup of this.context.pages()) {
      if (this.pagesAtStart.has(popup)) continue;
      await popup.waitForLoadState("domcontentloaded", { timeout: 4000 }).catch(() => undefined);
      this.popups.push(popup.url());
      await popup.close().catch(() => undefined);
    }
  }

  /** Disconnect only: the browser and its tab stay open for the next call. */
  async close(): Promise<void> {
    await this.browser.close().catch(() => undefined);
  }
}

/** Run `work` attached to the target's browser, and always disconnect afterwards. */
export async function withSession<T>(target: string, work: (session: Session) => Promise<T>): Promise<T> {
  const session = await Session.open(target);
  try {
    return await work(session);
  } finally {
    await session.close();
  }
}

export function firstLine(error: unknown): string {
  return String(error instanceof Error ? error.message : error).split("\n")[0] ?? "";
}
