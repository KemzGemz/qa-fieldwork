/** Generated views: built from the records, repeatable, and never a second copy of the state. */
import assert from "node:assert/strict";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createWorkspace, fakeBrowserStep } from "./helpers.ts";

createWorkspace();
const { targetDir } = await import("../tools/lib/core/paths.ts");
const { initTarget } = await import("../tools/lib/target/admin.ts");
const { loadRun, runStart } = await import("../tools/lib/records/runs.ts");
const { testPlan, testResult, testStart } = await import("../tools/lib/records/tests.ts");
const { addFinding } = await import("../tools/lib/records/findings.ts");
const { setCoverage } = await import("../tools/lib/records/coverage.ts");
const { checkpoint } = await import("../tools/lib/records/handover.ts");
const { openQuestions, refreshTargetViews } = await import("../tools/lib/report/views.ts");

initTarget({ target: "shop", url: "http://127.0.0.1:9001/", name: "Shop", env: "staging" });
const root = targetDir("shop");
const overview = (): string => {
  refreshTargetViews("shop");
  return readFileSync(join(root, "README.md"), "utf8");
};

describe("openQuestions", () => {
  const table = [
    "## Assumptions in use",
    "| # | Assumption | Confirmed? |",
    "|---|---|---|",
    "| S1 | Rounds half-up | no |",
    "",
    "## Questions for the business / product owner",
    "| # | Question | Why it matters | Raised (run) | Answer |",
    "|---|---|---|---|---|",
    "| Q1 | Is the threshold inclusive? | F-002 | run-1 | |",
    "| Q2 | Are past dates allowed? | validation | run-1 | No, owner 16 Nov |",
    "| Q3 | Who may refund? | roles | run-2 |  |",
  ].join("\n");

  it("lists the rows whose Answer cell is empty", () => {
    assert.deepEqual(openQuestions(table), [
      { id: "Q1", question: "Is the threshold inclusive?" },
      { id: "Q3", question: "Who may refund?" },
    ]);
  });

  it("returns nothing for the untouched template and for a file without the table", () => {
    assert.deepEqual(openQuestions(readFileSync(join(root, "knowledge", "questions.md"), "utf8")), []);
    assert.deepEqual(openQuestions("# notes"), []);
  });
});

describe("target overview", () => {
  it("exists for a new target and says there is nothing yet", () => {
    const text = overview();
    assert.match(text, /^# Shop\n/);
    assert.match(text, /\*\*Environment:\*\* staging/);
    assert.match(text, /No run yet\./);
    assert.match(text, /## Findings \(0\)/);
    assert.match(text, /No checkpoint yet\./);
  });

  it("follows the records: run, findings, coverage, questions, blockers, next action", () => {
    runStart({ target: "shop", mode: "default", budget: 10 });
    const run = loadRun("shop").dir;
    testPlan({ target: "shop", title: "refund", why: "money", expected: "X", basisType: "requirement", basis: "R1" });
    testStart("shop", "T-001");
    const evidence = fakeBrowserStep(run);
    testResult({ target: "shop", id: "T-001", status: "fail", actual: "Y", evidence: [evidence] });
    addFinding({
      target: "shop", title: "Refund exceeds payment", classification: "product-failure", severity: "high",
      tests: ["T-001"], expected: "X", actual: "Y", repro: "1/1", duplicateCheck: "first", evidence: [evidence],
    });
    setCoverage({ target: "shop", area: "Refunds", status: "covered", note: "one test", tests: ["T-001"] });
    setCoverage({ target: "shop", area: "Exports", status: "blocked", note: "no export account" });
    appendFileSync(join(root, "knowledge", "questions.md"), "| Q1 | May a clerk refund? | F-001 | run | |\n");
    checkpoint({ target: "shop", state: "one finding", next: "test partial refunds", blockers: "export account missing" });

    const text = overview();
    assert.match(text, /mode default · active/);
    assert.match(text, /\*\*Budget:\*\* 1 of 10 browser actions/);
    assert.match(text, /\*\*Tests:\*\* fail 1/);
    assert.match(text, /## Findings \(1\)/);
    assert.match(text, /\| F-001 \| high \| product-failure \| open \| Refund exceeds payment \|/);
    assert.match(text, /## Coverage \(2 areas\)/);
    assert.match(text, /- Exports \(blocked\)/);
    assert.match(text, /- \*\*Q1\*\* May a clerk refund\?/);
    assert.match(text, /- Handover: export account missing/);
    assert.match(text, /- Coverage blocked: Exports\. no export account/);
    assert.match(text, /## Next action\n\ntest partial refunds/);
    for (const link of ["knowledge/system-model.md", "FINDINGS.md", "COVERAGE.md", "HANDOVER.md"]) {
      assert.ok(text.includes(`(${link})`), `links to ${link}`);
      assert.ok(existsSync(join(root, link)), `${link} exists`);
    }
  });

  it("is repeatable: refreshing again without a record change writes the same text", () => {
    assert.equal(overview(), overview());
  });

  it("is rebuilt from the records, so a hand edit to a view does not survive", () => {
    appendFileSync(join(root, "README.md"), "\nhand-written note\n");
    assert.ok(!overview().includes("hand-written note"));
  });
});
