/**
 * Stalls: when an action or page load times out, work out in a few seconds what kind of stall it
 * is (application still loading, site not answering, or the automation waiting on the wrong thing)
 * and what to do. Decision table ported from qa-pipeline (qahelper/resilience.py).
 */
import { join } from "node:path";
import { request } from "playwright";
import { rel } from "../core/paths.ts";
import { journal, readActions } from "../records/runs.ts";
import { pageFactsExpression, type PageFacts } from "./page-script.ts";
import type { StuckRequest } from "./request-tracker.ts";
import { loadBrowserState, saveBrowserState, type Session } from "./session.ts";

export type StallKind =
  | "browser-frozen"
  | "site-unreachable"
  | "site-holding-session"
  | "application-loading"
  | "navigation-stuck"
  | "one-request-slow"
  | "automation-wait";

export interface StallProbes {
  /** The page still runs JavaScript. */
  pageJs: boolean;
  /** The site answers a request made with this session's cookies. */
  withSession: boolean;
  /** The site answers a request made without cookies. */
  withoutSession: boolean;
  /** The page shows its own loading indicator. */
  appBusy: boolean;
  stuck: StuckRequest[];
}

/** Pure decision table (unit-tested): what kind of stall is this, and what to do about it. */
export function classifyStall(probes: StallProbes): { kind: StallKind; advice: string } {
  if (!probes.pageJs) {
    return {
      kind: "browser-frozen",
      advice:
        "The tab is not responding. Close and relaunch the browser (browser.ts close, launch); " +
        "if it is the user's attached browser, ask them.",
    };
  }
  if (!probes.withSession && !probes.withoutSession) {
    return {
      kind: "site-unreachable",
      advice:
        "The site answers nobody right now: an environment issue, not a product verdict. " +
        "Wait once, retry once, then checkpoint and report a blocker.",
    };
  }
  if (!probes.withSession) {
    return {
      kind: "site-holding-session",
      advice:
        "The site answers others but not this session. Stop repeating the request that triggered it; " +
        "navigate only by clicking visible controls; slow down.",
    };
  }
  if (probes.appBusy) {
    return {
      kind: "application-loading",
      advice:
        "The page shows its own loading indicator: the application is still working. Observe again once; " +
        "a loader that never ends is itself an observation worth recording.",
    };
  }
  if (probes.stuck.some((r) => r.type === "document")) {
    return {
      kind: "navigation-stuck",
      advice:
        "The site answers but this page load is stuck. It has been abandoned (window.stop); " +
        "continue by clicking links in the existing tab, avoid typed addresses.",
    };
  }
  if (probes.stuck.length > 0) {
    return { kind: "one-request-slow", advice: "One background request is slow; the page is usable. Observe and continue." };
  }
  return {
    kind: "automation-wait",
    advice:
      "Site and page respond: the wait was on the automation side (wrong or hidden locator, element covered " +
      "or disabled). Observe again and choose the locator from what is visible.",
  };
}

async function timed(probe: () => Promise<boolean>): Promise<{ ok: boolean; seconds: number }> {
  const started = Date.now();
  let ok = false;
  try {
    ok = await probe();
  } catch {
    ok = false;
  }
  return { ok, seconds: Math.round((Date.now() - started) / 100) / 10 };
}

/** Capture what is known about a stall, classify it, log it. Never throws. Returns lines to print. */
export async function diagnoseStall(session: Session, where: string, error: string): Promise<string[]> {
  const { page, context, config, target, ctx } = session;
  const base = config.base_url;

  const pageJs = await timed(async () => (await page.evaluate("1")) === 1);
  const withSession = await timed(async () => (await context.request.get(base, { timeout: 8000 })).status() < 500);
  const withoutSession = await timed(async () => {
    const anonymous = await request.newContext();
    try {
      return (await anonymous.get(base, { timeout: 8000 })).status() > 0;
    } finally {
      await anonymous.dispose();
    }
  });
  let busy = 0;
  if (pageJs.ok) {
    busy = await page
      .evaluate<PageFacts>(pageFactsExpression(0))
      .then((facts) => facts.busy)
      .catch(() => 0);
  }
  const stuck = session.tracker.stuck(3);
  const { kind, advice } = classifyStall({
    pageJs: pageJs.ok,
    withSession: withSession.ok,
    withoutSession: withoutSession.ok,
    appBusy: busy > 0,
    stuck,
  });
  if (kind === "navigation-stuck") await page.evaluate("window.stop()").catch(() => undefined);

  let screenshot: string | null = null;
  const stampNow = new Date().toTimeString().slice(0, 8).replaceAll(":", "");
  const shotPath = join(ctx.dir, "evidence", `stall-${stampNow}.png`);
  await page
    .screenshot({ path: shotPath, timeout: 4000 })
    .then(() => {
      screenshot = rel(target, shotPath);
    })
    .catch(() => undefined);

  const state = loadBrowserState(target);
  state.stalls = (state.stalls ?? 0) + 1;
  saveBrowserState(target, state);

  const lastAction = readActions(ctx.dir).filter((row) => row.counts).at(-1)?.desc ?? null;
  journal(ctx.dir, "stall", `${kind}: ${where}`, {
    kind_of_stall: kind,
    advice,
    where,
    error: error.slice(0, 200),
    url: page.url(),
    last_action: lastAction,
    screenshot,
    stuck_requests: stuck.slice(0, 5),
    probes: { page_js: pageJs, site_with_session: withSession, site_without_session: withoutSession, app_busy_indicators: busy },
    consecutive_stalls: state.stalls,
  });

  const limit = config.recovery.max_attempts;
  return [
    `STALL [${kind}] during: ${where}`,
    `  error: ${error.slice(0, 200)}`,
    `  url: ${page.url()}   last action: ${lastAction}   screenshot: ${screenshot ? `targets/${target}/${screenshot}` : "none"}`,
    `  probes: page_js=${pageJs.ok}(${pageJs.seconds}s) site_with_session=${withSession.ok}(${withSession.seconds}s) ` +
      `site_without_session=${withoutSession.ok}(${withoutSession.seconds}s) app_busy=${busy} stuck_requests=${stuck.length}`,
    `  advice: ${advice}`,
    state.stalls > limit
      ? `  ** BLOCKER: ${state.stalls} consecutive stalls (limit ${limit}). Stop retrying: record the affected test as ` +
        "blocked / env-issue / automation-error, checkpoint, and report. **"
      : `  recovery attempt ${state.stalls} of ${limit} allowed before this becomes a blocker`,
  ];
}

/** A successful action ends a run of stalls. */
export function markHealthy(target: string): void {
  const state = loadBrowserState(target);
  if (state.stalls) {
    state.stalls = 0;
    saveBrowserState(target, state);
  }
}
