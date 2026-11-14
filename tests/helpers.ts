/**
 * Test workspace: a throw-away repository root with the real templates and defaults.
 * Call `createWorkspace()` before importing anything from tools/lib, because the library reads
 * QA_FIELDWORK_ROOT once, when it is first loaded. Each test file runs in its own process.
 */
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REAL_REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

export function createWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "qa-fieldwork-test-"));
  cpSync(join(REAL_REPO, "templates"), join(root, "templates"), { recursive: true });
  mkdirSync(join(root, "tools"), { recursive: true });
  cpSync(join(REAL_REPO, "tools", "defaults.yaml"), join(root, "tools", "defaults.yaml"));
  const references = join(root, ".claude", "skills", "qa-investigation", "references");
  mkdirSync(references, { recursive: true });
  writeFileSync(join(references, "lessons-proposed.md"), "# Proposed lessons\n");
  process.env.QA_FIELDWORK_ROOT = root;
  return root;
}

/** Stand in for the browser tool: log one step and leave one screenshot file. Returns the evidence path. */
export function fakeBrowserStep(runDir: string, name = "step.png"): string {
  const row = { t: "", run: "", role: null, environment: "local", app_version: null, test: null, counts: true, kind: "click", desc: "click", ok: true };
  writeFileSync(join(runDir, "actions.jsonl"), `${JSON.stringify(row)}\n`, { flag: "a" });
  const evidence = join(runDir, "evidence", name);
  writeFileSync(evidence, "png");
  return evidence;
}
