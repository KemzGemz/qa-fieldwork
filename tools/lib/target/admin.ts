/** Target management: create a target, load its status, check that a URL belongs to it, add requirements. */
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { allowedOrigins, loadConfig, originOf } from "../core/config.ts";
import { Exit, fail } from "../core/errors.ts";
import { isFile, listTargets, localDir, targetDir, TEMPLATE } from "../core/paths.ts";
import { countBy, formatCounts, now, readJson, readText, sha256, writeJson, writeText } from "../core/store.ts";
import { readCoverage } from "../records/coverage.ts";
import { readFindings } from "../records/findings.ts";
import { readHandover } from "../records/handover.ts";
import { actionsUsed, findRunDir, listRunDirs, readTests } from "../records/runs.ts";
import { RequirementManifest } from "../schemas/handover.ts";
import { Run } from "../schemas/run.ts";

export const ENVIRONMENTS = ["local", "test", "staging", "production"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

const TEMPLATE_TEXT = new Set([".yaml", ".md", ".json"]);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

export function listTargetLines(): string[] {
  const targets = listTargets();
  if (targets.length === 0) return ["(no targets yet)"];
  return targets.map((id) => {
    const config = loadConfig(id);
    return `${id.padEnd(24)} ${config.environment.padEnd(10)} ${config.base_url}`;
  });
}

export function initTarget(input: { target: string; url: string; name?: string; env: Environment }): string[] {
  const dir = targetDir(input.target, false);
  if (existsSync(dir) && readdirSync(dir).length > 0) {
    fail(`targets/${input.target}/ already exists; use status/resume instead of init`);
  }
  originOf(input.url);
  cpSync(TEMPLATE, dir, { recursive: true });
  const values: Record<string, string> = {
    "{{target}}": input.target,
    "{{name}}": input.name || input.target,
    "{{base_url}}": input.url,
    "{{environment}}": input.env,
    "{{created}}": now(),
  };
  for (const file of walk(dir).filter((f) => TEMPLATE_TEXT.has(extname(f)))) {
    let text = readText(file);
    for (const [placeholder, value] of Object.entries(values)) text = text.replaceAll(placeholder, value);
    writeText(file, text);
  }
  mkdirSync(join(dir, "runs"), { recursive: true });
  mkdirSync(join(dir, "requirements", "source"), { recursive: true });
  localDir(input.target);
  return [
    `created targets/${input.target}/ for ${input.url} (${input.env})`,
    "next: review target.yaml (roles, scope, permissions), add requirements, then records.ts run-start",
  ];
}

// ---------------------------------------------------------------- requirements

const requirementsDir = (target: string): string => join(targetDir(target), "requirements");

function readManifest(target: string): RequirementManifest {
  return RequirementManifest.parse(readJson(join(requirementsDir(target), "manifest.json"), { files: [] }));
}

/** Requirement documents that changed, vanished or were never registered since they were recorded. */
export function requirementChanges(target: string): string[] {
  const source = join(requirementsDir(target), "source");
  const manifest = readManifest(target);
  const changes: string[] = [];
  for (const file of manifest.files) {
    const path = join(source, file.name);
    if (!existsSync(path)) changes.push(`MISSING ${file.name} (recorded ${file.added})`);
    else if (sha256(path) !== file.sha256) {
      changes.push(`CHANGED ${file.name} since ${file.added}: re-read it and re-check dependent conclusions`);
    }
  }
  const known = new Set(manifest.files.flatMap((f) => [f.name, `${f.name}.txt`]));
  if (existsSync(source)) {
    for (const name of readdirSync(source).sort()) {
      if (isFile(join(source, name)) && !known.has(name)) {
        changes.push(`UNTRACKED ${name} (add it with add-requirements so changes are detected)`);
      }
    }
  }
  return changes;
}

async function extractPdfText(path: string): Promise<string[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const document = await getDocumentProxy(new Uint8Array(readFileSync(path)));
  const { text } = await extractText(document, { mergePages: false });
  return text.map((page, index) => `--- page ${index + 1} ---\n${page}`);
}

export async function addRequirements(target: string, files: string[]): Promise<string[]> {
  const dir = requirementsDir(target);
  const source = join(dir, "source");
  mkdirSync(source, { recursive: true });
  const manifest = readManifest(target);
  const lines: string[] = [];
  for (const file of files) {
    if (!isFile(file)) fail(`no such file: ${file}`);
    const name = basename(file);
    const destination = join(source, name);
    const digest = sha256(file);
    const entry = manifest.files.find((f) => f.name === name);
    if (entry && entry.sha256 === digest && existsSync(destination)) {
      lines.push(`unchanged: ${name}`);
      continue;
    }
    if (resolve(file) !== resolve(destination)) copyFileSync(file, destination);
    if (entry) {
      entry.history = [...(entry.history ?? []), { sha256: entry.sha256, added: entry.added }];
      Object.assign(entry, { sha256: digest, added: now(), origin: file });
      lines.push(`updated: ${name} (previous hash kept in manifest history): re-read and re-check conclusions`);
    } else {
      manifest.files.push({ name, sha256: digest, added: now(), origin: file });
      lines.push(`added: requirements/source/${name}`);
    }
    if (extname(name).toLowerCase() === ".pdf") {
      try {
        const pages = await extractPdfText(destination);
        writeText(join(source, `${name}.txt`), pages.join("\n\n"));
        lines.push(`extracted text: requirements/source/${name}.txt (${pages.length} pages; cite page numbers)`);
      } catch (error) {
        lines.push(`could not extract PDF text (${String(error).slice(0, 120)}); read the PDF directly`);
      }
    }
  }
  writeJson(join(dir, "manifest.json"), manifest);
  return lines;
}

// ---------------------------------------------------------------- status and check

/** What a session loads first, and what a resuming session needs. */
export function statusLines(target: string): string[] {
  const root = targetDir(target);
  const config = loadConfig(target);
  const lines = [
    `# target ${target}: ${config.name}`,
    `base_url: ${config.base_url}   environment: ${config.environment}`,
  ];
  if (config.allowed_origins.length > 0) lines.push(`allowed_origins: ${config.allowed_origins.join(", ")}`);
  lines.push(
    `roles: ${Object.keys(config.roles).join(", ") || "(none recorded)"}`,
    `scope include: ${config.scope.include.join("; ") || "(all)"}   exclude: ${config.scope.exclude.join("; ") || "(none)"}`,
    `permissions: change_data=${config.permissions.change_data} destructive=${config.permissions.destructive} ` +
      `create_accounts=${config.permissions.create_accounts}`,
    `default budget: ${config.budget.actions} actions, reserve ${config.budget.report_reserve}`,
    "",
    "## requirements",
  );
  const manifest = readManifest(target);
  lines.push(...manifest.files.map((f) => `- requirements/source/${f.name}  (added ${f.added})`));
  if (manifest.files.length === 0) {
    lines.push("- none recorded: investigate from observed purpose, domain knowledge and explicit assumptions");
  }
  lines.push(...requirementChanges(target).map((change) => `  !! ${change}`));

  lines.push("", "## knowledge files (read the ones relevant to the task)");
  const knowledge = join(root, "knowledge");
  for (const name of existsSync(knowledge) ? readdirSync(knowledge).filter((f) => f.endsWith(".md")).sort() : []) {
    const stat = statSync(join(knowledge, name));
    lines.push(`- knowledge/${name}  ${stat.size} bytes, updated ${now(stat.mtime).slice(0, 16).replace("T", " ")}`);
  }

  const runDirs = listRunDirs(target);
  lines.push("", `## runs (${runDirs.length})`);
  for (const dir of runDirs.slice(-5)) {
    const run = Run.parse(readJson(join(dir, "run.json")));
    lines.push(
      `- ${run.id}  mode=${run.mode} status=${run.status} role=${run.role ?? "?"} version=${run.app_version ?? "?"} ` +
        `actions=${actionsUsed(dir)}/${run.budget} tests=${Object.keys(readTests(dir)).length}`,
    );
  }
  const lastDir = findRunDir(target);
  if (lastDir) {
    const last = Run.parse(readJson(join(lastDir, "run.json")));
    lines.push(`last run: ${last.id} (${last.status})`);
  } else lines.push("last run: (none)");

  const findings = Object.values(readFindings(target));
  lines.push("", `## findings: ${findings.length}  ${formatCounts(countBy(findings, (f) => f.status), "")}`);
  lines.push(...findings.map((f) => `- ${f.id} [${f.classification}/${f.status}] ${f.title}`));
  const coverage = Object.values(readCoverage(target));
  lines.push("", `## coverage areas: ${coverage.length}  ${formatCounts(countBy(coverage, (c) => c.status), "")}`);

  lines.push("", "## handover");
  const handover = readHandover(target);
  if (!handover) {
    lines.push("no handover yet: this target has not been checkpointed");
    return lines;
  }
  lines.push(
    `saved ${handover.saved} (run ${handover.run}, version ${handover.app_version ?? "?"})`,
    `state: ${handover.state}`,
    `NEXT ACTION: ${handover.next_action}`,
  );
  if (handover.blockers) lines.push(`blockers: ${handover.blockers}`);
  lines.push(
    "before continuing: confirm URL/environment (target.ts check), compare the app version shown now " +
      "with the one above, and re-verify any conclusion that depends on changed requirements or behaviour",
  );
  return lines;
}

/** Does the supplied URL (and environment) belong to this target? */
export function checkTarget(target: string, url: string, env?: string): { lines: string[]; exitCode: number } {
  const config = loadConfig(target);
  const origin = originOf(url);
  const allowed = allowedOrigins(config);
  const problems: string[] = [];
  if (!allowed.has(origin)) {
    problems.push(`URL origin ${origin} is not this target's (${[...allowed].sort().join(", ")})`);
    for (const other of listTargets()) {
      if (other !== target && originOf(loadConfig(other).base_url) === origin) {
        problems.push(`that origin belongs to target '${other}': did you mean --target ${other}?`);
      }
    }
  }
  if (env && env !== config.environment) {
    problems.push(`environment '${env}' differs from the recorded '${config.environment}'`);
  }
  problems.push(
    ...requirementChanges(target)
      .filter((change) => !change.startsWith("UNTRACKED"))
      .map((change) => `requirements: ${change}`),
  );
  if (problems.length === 0) {
    return { lines: [`ok: ${url} belongs to target ${target} (${config.environment})`], exitCode: Exit.ok };
  }
  return {
    lines: [
      `MISMATCH for target ${target}:`,
      ...problems.map((p) => `- ${p}`),
      "Resolve this before executing or updating records: pick the right target, create a new one, " +
        "or (if the application really moved) update target.yaml and note it in knowledge/scope.md.",
    ],
    exitCode: Exit.targetMismatch,
  };
}
