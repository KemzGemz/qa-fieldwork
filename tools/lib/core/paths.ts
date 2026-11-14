/**
 * Target validation and paths. Every tool takes `--target <id>` explicitly; nothing here guesses
 * a target, and every path a tool writes is checked to be inside `targets/<id>/` (see `inside`).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { fail } from "./errors.ts";

/** Repository root. `QA_FIELDWORK_ROOT` overrides it (used by the unit tests). */
export const REPO = resolve(
  process.env.QA_FIELDWORK_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".."),
);
export const TARGETS = join(REPO, "targets");
export const TEMPLATE = join(REPO, "templates", "target");
export const DEFAULTS_FILE = join(REPO, "tools", "defaults.yaml");
export const LESSONS_FILE = join(REPO, ".claude", "skills", "qa-investigation", "references", "lessons-proposed.md");

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,47}$/;

export function listTargets(): string[] {
  if (!existsSync(TARGETS)) return [];
  return readdirSync(TARGETS)
    .filter((name) => existsSync(join(TARGETS, name, "target.yaml")))
    .sort();
}

export function targetDir(target: string, mustExist = true): string {
  if (!target || !ID_PATTERN.test(target)) {
    fail(`invalid target id ${JSON.stringify(target)}: use lowercase letters, digits and hyphens (2-48 chars)`);
  }
  const dir = resolve(TARGETS, target);
  if (dirname(dir) !== resolve(TARGETS)) fail(`target path escapes targets/: ${dir}`);
  if (mustExist && !existsSync(join(dir, "target.yaml"))) {
    const known = listTargets().join(", ") || "(none)";
    fail(`unknown target '${target}'. Known targets: ${known}. Create one with: tools/target.ts init`);
  }
  return dir;
}

function isWithin(root: string, path: string): boolean {
  return path === root || path.startsWith(root + sep);
}

/** Resolve a path (absolute, repo-relative or target-relative) and require it to be inside the target. */
export function inside(target: string, path: string): string {
  const root = targetDir(target);
  const candidates = isAbsolute(path) ? [path] : [join(REPO, path), join(root, path)];
  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    if (isWithin(root, resolved)) return resolved;
    if (existsSync(resolved)) break; // a real file, but outside this target: refuse rather than look further
  }
  fail(`path '${path}' is not inside targets/${target}/ (cross-target and outside paths are refused)`);
}

/** Path relative to the target directory, with forward slashes (what records store). */
export function rel(target: string, path: string): string {
  return relative(targetDir(target), resolve(path)).split(sep).join("/");
}

/** Uncommitted per-target state: browser endpoint, active run, accounts. */
export function localDir(target: string): string {
  const dir = join(targetDir(target), ".local");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Per-target browser profile, kept outside the repository (cookies, sessions; large). */
export function machineDir(target: string): string {
  const base = join(process.env.LOCALAPPDATA ?? join(homedir(), ".cache"), "qa-fieldwork");
  const tag = createHash("sha1").update(REPO).digest("hex").slice(0, 8);
  const dir = join(base, `${target}-${tag}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}
