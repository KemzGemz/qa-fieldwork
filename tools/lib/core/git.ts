/**
 * The branch rule: `main` holds only the workspace. Each application under test lives on its own
 * branch, `sut/<target-id>`, checked out as a worktree.
 */
import { execFileSync } from "node:child_process";
import { fail } from "./errors.ts";
import { REPO } from "./paths.ts";

/** Branches that must stay free of target records. */
const BASE_BRANCHES = new Set(["main", "master"]);

/** Name of the checked-out branch, or undefined outside a Git repository or on a detached HEAD. */
export function currentBranch(): string | undefined {
  try {
    const name = execFileSync("git", ["-C", REPO, "branch", "--show-current"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return name || undefined;
  } catch {
    return undefined;
  }
}

/** Shared files: the guidance and tools a run was made with. Target records are not part of it. */
const FRAMEWORK_PATHS = ["tools", ".claude/skills", "templates", "CLAUDE.md"];

/**
 * Which version of the shared framework this checkout holds: the last commit that touched the shared
 * files, and whether they have uncommitted changes. Recorded with each run, so a later reader can
 * tell which guidance and tool behaviour an investigation was made with. Undefined outside Git.
 */
export function frameworkVersion(): { commit: string; dirty: boolean } | undefined {
  const git = (args: string[]): string =>
    execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    const commit = git(["log", "-1", "--format=%h", "--", ...FRAMEWORK_PATHS]);
    if (!commit) return undefined;
    return { commit, dirty: git(["status", "--porcelain", "--", ...FRAMEWORK_PATHS]) !== "" };
  } catch {
    return undefined;
  }
}

/** Refuse to create a target on a base branch; say how to create the application's worktree instead. */
export function requireTargetBranch(target: string, branch: string | undefined, allowBase = false): void {
  if (!branch || !BASE_BRANCHES.has(branch) || allowBase) return;
  fail(
    `this checkout is on '${branch}', which holds only the workspace. Create the application's worktree and ` +
      `work there:\n  git worktree add ../qa-fieldwork-${target} -b sut/${target} ${branch}\n` +
      "then run npm install in that folder. (--allow-base-branch overrides this, for throw-away checks only.)",
  );
}
