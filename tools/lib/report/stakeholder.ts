/**
 * Stakeholder findings report: one HTML page built from the target's records, printed to PDF.
 *
 * Facts (counts, severities, expected and actual, steps, evidence, coverage) come from the records.
 * Judgment (the summary, the plain-language wording, priorities, suggested directions, which
 * screenshot shows the point) comes from the tester, in targets/<id>/report-brief.yaml. Without a
 * brief the report is complete but worded as the records are. `stakeholderHtml` is pure.
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { loadConfig, type TargetConfig } from "../core/config.ts";
import { fail } from "../core/errors.ts";
import { inside, isFile, REPO, targetDir } from "../core/paths.ts";
import { readText, slug, writeText } from "../core/store.ts";
import { readCoverage } from "../records/coverage.ts";
import { readFindings } from "../records/findings.ts";
import { allTests, listRunDirs } from "../records/runs.ts";
import { COVERAGE_ORDER, type CoverageFile } from "../schemas/coverage.ts";
import { type Finding, type FindingFile, INACTIVE_STATUSES, SEVERITIES } from "../schemas/finding.ts";
import { Run } from "../schemas/run.ts";
import { statusOf, type TestRecord } from "../schemas/test.ts";
import { readJson } from "../core/store.ts";

const strings = z
  .array(z.string())
  .nullish()
  .transform((value) => value ?? []);

const Image = z.object({
  /** Target-relative path of a screenshot. */
  path: z.string(),
  caption: z.string().default(""),
  /** Enlarge: 2 shows half the image width. With `focus`, which part: [x%, y%] of the image. */
  zoom: z.number().min(1).max(8).default(1),
  focus: z.tuple([z.number(), z.number()]).default([50, 0]),
  height_mm: z.number().min(10).max(120).optional(),
  /** cover: fill the frame, cropping (default). contain: the whole screenshot, smaller. */
  fit: z.enum(["cover", "contain"]).default("cover"),
});

const FindingBrief = z.looseObject({
  title: z.string().optional(),
  area: z.string().optional(),
  what: z.string().optional(),
  why: z.string().optional(),
  how: z.string().optional(),
  suggestion: z.string().optional(),
  images: z.array(Image).optional(),
});

/** targets/<id>/report-brief.yaml: the tester's wording. Every key is optional. */
export const Brief = z.looseObject({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  date: z.string().optional(),
  environment: z.string().optional(),
  tested_as: z.string().optional(),
  basis: z.string().optional(),
  /** One colour for labels and rules, e.g. "#8b2f5c": the only branding the template takes. */
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  headline: z.string().optional(),
  lead: z.string().optional(),
  priorities_title: z.string().optional(),
  priorities: z
    .array(z.object({ finding: z.string(), text: z.string() }))
    .nullish()
    .transform((value) => value ?? []),
  passed: z
    .array(z.object({ title: z.string(), items: strings }))
    .nullish()
    .transform((value) => value ?? []),
  observations: strings,
  not_tested: z.array(z.object({ area: z.string(), why: z.string() })).optional(),
  decisions: strings,
  test_data: strings,
  method: z.string().optional(),
  findings: z
    .record(z.string(), FindingBrief)
    .nullish()
    .transform((value) => value ?? {}),
});
export type Brief = z.infer<typeof Brief>;

export interface StakeholderData {
  target: string;
  config: TargetConfig;
  tests: TestRecord[];
  findings: FindingFile;
  coverage: CoverageFile;
  brief: Brief;
  css: string;
  /** Roles the runs were made as, and the day of the latest run (used when the brief is silent). */
  roles: string[];
  lastRunDay: string;
  /** Does this target-relative file exist? Missing images are left out and reported. */
  hasFile: (path: string) => boolean;
}

const esc = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** Escaped text with `code` and **bold**. */
const inline = (text: string): string =>
  esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");

const NOT_COMPLETED = new Set(["blocked", "inconclusive", "automation-error", "env-issue", "not-run", "planned"]);

/** How a finding's state is said to a reader who does not know the record vocabulary. */
export function statusLabel(f: Finding): { text: string; style: "solid" | "outline" | "ok" } {
  if (f.status === "fixed" || f.status === "retest-passed") return { text: "Fixed", style: "ok" };
  if (f.status === "retest-failed") return { text: "Still failing", style: "solid" };
  if (f.classification === "product-failure" || f.status === "confirmed") return { text: "Confirmed", style: "solid" };
  if (f.classification === "improvement") return { text: "Suggestion", style: "outline" };
  if (f.classification === "suspected-defect") return { text: "Needs decision", style: "outline" };
  return { text: f.classification.replaceAll("-", " "), style: "outline" };
}

const LEGEND: Record<string, string> = {
  Confirmed: "**Confirmed** means the behaviour is wrong under any reading.",
  "Needs decision":
    "**Needs decision** means the behaviour is clear and repeatable, but the intended rule is not written down, so the owner confirms it before it is treated as a defect.",
  Suggestion: "**Suggestion** means nothing is wrong against an expectation; it is a proposed improvement.",
  Fixed: "**Fixed** means a retest passed.",
  "Still failing": "**Still failing** means a retest found the same behaviour.",
};

function longDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function figures(images: z.infer<typeof Image>[], hasFile: (path: string) => boolean, missing: string[], minColumns = 1): string {
  const usable = images.filter((image) => {
    if (hasFile(image.path)) return true;
    missing.push(image.path);
    return false;
  });
  if (usable.length === 0) return "";
  const height = (image: z.infer<typeof Image>): number => image.height_mm ?? (usable.length === 1 ? 46 : usable.length === 2 ? 42 : 36);
  const cells = usable.map((image) => {
    const size = image.zoom > 1 ? `${Math.round(image.zoom * 100)}% auto` : image.fit;
    const url = `../${image.path.split("/").map(encodeURIComponent).join("/")}`;
    const style = `height:${height(image)}mm;background-image:url('${url}');background-size:${size};background-position:${image.focus[0]}% ${image.focus[1]}%`;
    return `<figure><div class="shot" style="${style}"></div>${image.caption ? `<figcaption>${inline(image.caption)}</figcaption>` : ""}</figure>`;
  });
  return `<div class="span2 shots" style="grid-template-columns:repeat(${Math.max(usable.length, minColumns)},1fr)">${cells.join("")}</div>`;
}

function findingCard(f: Finding, brief: Brief, hasFile: (path: string) => boolean, missing: string[]): string {
  const own = brief.findings[f.id] ?? {};
  const label = statusLabel(f);
  const what = own.what ?? f.actual;
  const why = own.why ?? (f.impact_reasoned || f.impact_observed);
  const how = own.how ?? f.steps.join("; ");
  // Nobody chose what to show: up to two screenshots, each at half the card width, which is close to a
  // screen's proportions, so nearly the whole screenshot is visible.
  const fromEvidence = f.evidence
    .filter((path) => /\.(png|jpe?g)$/i.test(path))
    .slice(0, 2)
    .map((path) => Image.parse({ path, focus: [0, 0], height_mm: 46 }));
  const images = own.images ?? fromEvidence;
  const block = (title: string, text: string, cls = ""): string =>
    text ? `<div${cls ? ` class="${cls}"` : ""}><div class="k">${title}</div><p>${inline(text)}</p></div>` : "";
  return [
    `<article class="finding ${f.severity}">`,
    `<header><span class="fid">${esc(f.id)}</span><h3>${inline(own.title ?? f.title)}</h3>` +
      `<div class="tags"><span class="pill ${f.severity}">${f.severity}</span><span class="pill ${label.style}">${label.text}</span></div></header>`,
    '<div class="body">',
    block("What happens", what),
    block("Why it matters", why),
    block("What was expected", f.classification === "improvement" ? "" : f.expected),
    block("How to see it", how + (f.reproduction ? ` (${f.reproduction})` : "")),
    figures(images, hasFile, missing, own.images ? 1 : 2),
    block("Suggested direction", own.suggestion ?? "", "suggest span2"),
    "</div></article>",
  ].join("\n");
}

const list = (items: string[]): string => `<ul>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`;

/** The whole report as one HTML document. `missing` receives image paths that do not exist. */
export function stakeholderHtml(data: StakeholderData, missing: string[] = []): string {
  const { config, brief, coverage, tests } = data;
  const title = brief.title ?? (config.name || data.target);
  const active = Object.values(data.findings)
    .filter((f) => !INACTIVE_STATUSES.has(f.status))
    .sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || a.id.localeCompare(b.id));
  const bySeverity = SEVERITIES.map((severity) => [severity, active.filter((f) => f.severity === severity)] as const).filter(
    ([, items]) => items.length > 0,
  );
  const passed = tests.filter((test) => statusOf(test) === "pass").length;
  const open = tests.filter((test) => NOT_COMPLETED.has(statusOf(test))).length;
  const areaOf = (f: Finding): string =>
    brief.findings[f.id]?.area ?? tests.find((test) => f.tests.includes(test.id) && test.area)?.area ?? "";
  const labels = [...new Set(active.map((f) => statusLabel(f).text))];
  const notTested =
    brief.not_tested ??
    Object.values(coverage)
      .filter((entry) => entry.status !== "covered")
      .sort((a, b) => COVERAGE_ORDER.indexOf(a.status) - COVERAGE_ORDER.indexOf(b.status))
      .map((entry) => ({ area: entry.area, why: `${entry.status.replaceAll("-", " ")}: ${entry.note}` }));

  const meta: [string, string][] = [
    ["Test date", brief.date ?? longDate(data.lastRunDay)],
    ["Environment", brief.environment ?? `${config.environment} (${new URL(config.base_url).host})`],
    ["Tested as", brief.tested_as ?? (data.roles.join(", ") || "not recorded")],
    ["Basis", brief.basis ?? "Requirements where supplied, agreement between screens, and common practice"],
  ];
  const out: string[] = [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    `<title>${esc(title)}: QA findings report</title>`,
    `<style>${data.css}${brief.accent ? `\n:root { --accent: ${brief.accent}; }` : ""}</style></head><body>`,
    '<section class="cover"><div class="eyebrow">Quality assurance · Findings report</div>',
    `<h1>${esc(title)}</h1>`,
    brief.subtitle ? `<p class="sub">${inline(brief.subtitle)}</p>` : "",
    `<div class="meta">${meta.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join("")}</div></section>`,
    `<h2><small>Summary</small>${inline(brief.headline ?? `${active.length} ${active.length === 1 ? "finding" : "findings"} from ${tests.length} tests`)}</h2>`,
    brief.lead ? `<p class="lead">${inline(brief.lead)}</p>` : "",
    '<div class="tiles">',
    `<div class="tile"><b class="num">${tests.length}</b><span>tests planned and recorded</span></div>`,
    `<div class="tile"><b class="num">${passed}</b><span>passed</span></div>`,
    `<div class="tile${active.length > 0 ? " alert" : ""}"><b class="num">${active.length}</b><span>findings: ${
      bySeverity.map(([severity, items]) => `${items.length} ${severity}`).join(", ") || "none"
    }</span></div>`,
    `<div class="tile"><b class="num">${open}</b><span>tests not completed (blocked, inconclusive or not run)</span></div>`,
    "</div>",
  ];

  if (brief.priorities.length > 0) {
    out.push(`<h2><small>Priorities</small>${inline(brief.priorities_title ?? "What to settle first")}</h2>`);
    out.push(`<div class="top" style="grid-template-columns:repeat(${Math.min(brief.priorities.length, 3)},1fr)">`);
    for (const item of brief.priorities) {
      const f = data.findings[item.finding];
      if (!f) fail(`report-brief.yaml priorities: no finding ${item.finding}`);
      out.push(`<div><b>${esc(f.id)} · ${statusLabel(f).text}</b><p>${inline(item.text)}</p></div>`);
    }
    out.push("</div>");
  }

  // A long table starts its own page and the details start another; a short one stays whole and the
  // details follow it, so that no page is left nearly empty.
  const long = active.length > 5;
  out.push(`<h2${long ? ' class="pagebreak"' : ""}><small>At a glance</small>All findings, most serious first</h2>`);
  if (active.length === 0) out.push('<p class="lead">No open findings.</p>');
  else {
    out.push(
      `<table${long ? "" : ' class="keep"'}><thead><tr><th>ID</th><th>Finding</th><th>Severity</th><th>Status</th><th>Area</th></tr></thead><tbody>`,
    );
    for (const f of active) {
      const label = statusLabel(f);
      out.push(
        `<tr><td class="id">${esc(f.id)}</td><td>${inline(brief.findings[f.id]?.title ?? f.title)}</td>` +
          `<td><span class="pill ${f.severity}">${f.severity}</span></td><td><span class="pill ${label.style}">${label.text}</span></td>` +
          `<td>${esc(areaOf(f))}</td></tr>`,
      );
    }
    out.push("</tbody></table>");
    out.push(`<p class="note">${labels.map((text) => inline(LEGEND[text] ?? "")).join(" ")}</p>`);
  }

  let first = true;
  for (const [severity, items] of bySeverity) {
    const heading = first ? "Findings in detail" : "";
    out.push(`<h2${first && long ? ' class="pagebreak"' : ""}><small>${severity} severity</small>${heading}</h2>`);
    first = false;
    out.push(...items.map((f) => findingCard(f, brief, data.hasFile, missing)));
  }

  if (brief.passed.length > 0) {
    out.push("<h2><small>Working as expected</small>What passed</h2>", '<div class="cols">');
    out.push(...brief.passed.map((group) => `<div class="box"><h3>${inline(group.title)}</h3>${list(group.items)}</div>`));
    out.push("</div>");
  }
  if (brief.observations.length > 0) {
    out.push("<h2><small>Smaller observations</small>Not filed as findings, worth a look</h2>", list(brief.observations));
  }
  if (notTested.length > 0) {
    out.push("<h2><small>Limits of this round</small>What was not tested, or only in part</h2>");
    out.push(`<table${notTested.length <= 10 ? ' class="keep"' : ""}><thead><tr><th>Area</th><th>Why</th></tr></thead><tbody>`);
    out.push(...notTested.map((row) => `<tr><td>${inline(row.area)}</td><td>${inline(row.why)}</td></tr>`));
    out.push("</tbody></table>");
  }
  const boxes = [
    brief.decisions.length > 0 ? `<div class="box"><h3>Decisions needed from the owner</h3>${list(brief.decisions)}</div>` : "",
    brief.test_data.length > 0 ? `<div class="box"><h3>Test data left in the environment</h3>${list(brief.test_data)}</div>` : "",
  ].filter(Boolean);
  if (boxes.length > 0) out.push(`<div class="cols" style="margin-top:7mm">${boxes.join("")}</div>`);
  out.push(
    `<p class="note" style="margin-top:6mm">${inline(
      brief.method ??
        "Method: each test had its expected result and the reason for it written down before it was run. Screenshots and step logs for every result are kept with the test records.",
    )}</p>`,
    "</body></html>",
  );
  return out.filter(Boolean).join("\n");
}

const BRIEF_FILE = "report-brief.yaml";
const OUT_DIR = "stakeholder-report";

export function loadStakeholderData(target: string): StakeholderData {
  const root = targetDir(target);
  const briefPath = join(root, BRIEF_FILE);
  const parsed = Brief.safeParse(existsSync(briefPath) ? (parse(readText(briefPath)) ?? {}) : {});
  if (!parsed.success) {
    fail(`targets/${target}/${BRIEF_FILE} is not valid: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  const runs = listRunDirs(target).map((dir) => Run.parse(readJson(join(dir, "run.json"))));
  return {
    target,
    config: loadConfig(target),
    tests: allTests(target).map(({ test }) => test),
    findings: readFindings(target),
    coverage: readCoverage(target),
    brief: parsed.data,
    css: readText(join(REPO, "templates", "report", "stakeholder.css")),
    roles: [...new Set(runs.map((run) => run.role).filter((role): role is string => Boolean(role)))],
    lastRunDay: runs.at(-1)?.started ?? "",
    hasFile: (path) => {
      try {
        return isFile(inside(target, path));
      } catch {
        return false;
      }
    },
  };
}

/** Write stakeholder-report/report.html and, unless `pdf` is false, print it to PDF next to it. */
export async function writeStakeholderReport(target: string, options: { pdf: boolean }): Promise<string[]> {
  const data = loadStakeholderData(target);
  const missing: string[] = [];
  const html = stakeholderHtml(data, missing);
  const dir = join(targetDir(target), OUT_DIR);
  mkdirSync(dir, { recursive: true });
  const htmlPath = join(dir, "report.html");
  writeText(htmlPath, html);
  const title = data.brief.title ?? (data.config.name || target);
  const lines = [`stakeholder report: targets/${target}/${OUT_DIR}/report.html`];
  if (!existsSync(join(targetDir(target), BRIEF_FILE))) {
    lines.push(
      `  no targets/${target}/${BRIEF_FILE}: the report uses the record wording as it is. Copy templates/report/brief.example.yaml ` +
        "and write the summary, plain wording, priorities and suggestions (references/reporting.md).",
    );
  }
  lines.push(...missing.map((path) => `  !! image not found, left out: ${path}`));
  if (options.pdf) {
    const { chromium } = await import("playwright");
    const pdfPath = join(dir, `${slug(title) || target}-qa-findings-report.pdf`);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(`file:///${htmlPath.replaceAll("\\", "/")}`, { waitUntil: "load" });
      const footer =
        '<div style="width:100%;font-family:Segoe UI,Arial,sans-serif;font-size:7.5pt;color:#6a6572;padding:0 15mm;display:flex;justify-content:space-between">' +
        `<span>${esc(title)} · QA findings report · ${esc(data.brief.date ?? longDate(data.lastRunDay))}</span>` +
        '<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>';
      await page.pdf({
        path: pdfPath,
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: footer,
      });
    } finally {
      await browser.close();
    }
    lines.push(`pdf: targets/${target}/${OUT_DIR}/${pdfPath.split(/[\\/]/).pop()}`);
    lines.push("  look at every page before sharing it: page breaks, image crops, and wording a stakeholder could misread");
  }
  return lines;
}
