/** Revising findings, improvement suggestions, evidence arguments, the destructive-word guard, and the stakeholder report. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWorkspace, fakeBrowserStep } from "./helpers.ts";

createWorkspace();
const { ToolError } = await import("../tools/lib/core/errors.ts");
const { initTarget } = await import("../tools/lib/target/admin.ts");
const { loadRun, runStart } = await import("../tools/lib/records/runs.ts");
const { resolveEvidence, testPlan, testResult, testStart } = await import("../tools/lib/records/tests.ts");
const { addFinding, readFindings, updateFinding } = await import("../tools/lib/records/findings.ts");
const { setCoverage } = await import("../tools/lib/records/coverage.ts");
const { destructiveRefusal } = await import("../tools/lib/browser/actions.ts");
const { Brief, loadStakeholderData, stakeholderHtml, statusLabel } = await import("../tools/lib/report/stakeholder.ts");

const refused = (pattern: RegExp) => (error: unknown) => error instanceof ToolError && pattern.test(error.message);

initTarget({ target: "shop", url: "http://127.0.0.1:9101/", env: "local" });
runStart({ target: "shop", mode: "default" });
const run = loadRun("shop").dir;

function executed(id: string, status: "pass" | "suspected", evidenceName: string): string {
  testPlan({ target: "shop", id, title: `test ${id}`, area: "Checkout", why: "matters", expected: "X", basisType: "domain", basis: "practice" });
  testStart("shop", id);
  const evidence = fakeBrowserStep(run, evidenceName);
  testResult({ target: "shop", id, status, actual: "Y", evidence: [evidence] });
  return evidence;
}
const shot1 = executed("T-001", "suspected", "one.png");
const shot2 = executed("T-002", "pass", "two.png");

describe("revising a finding", () => {
  addFinding({
    target: "shop",
    title: "Opening checkout takes the item out of stock",
    classification: "suspected-defect",
    severity: "high",
    tests: ["T-001"],
    expected: "stock is reserved briefly",
    actual: "stock stays reserved",
    duplicateCheck: "first",
    evidence: [shot1],
  });

  it("changes severity and title and keeps the earlier values in the history", () => {
    const lines = updateFinding({
      target: "shop",
      id: "F-001",
      severity: "medium",
      title: "A reservation lasts 30 minutes and is not shown to the customer",
      note: "a recheck showed the reservation expires",
    });
    const finding = readFindings("shop")["F-001"];
    assert.equal(finding?.severity, "medium");
    assert.match(finding?.title ?? "", /30 minutes/);
    assert.deepEqual((finding?.history[0] as { changes?: unknown }).changes, {
      severity: { from: "high", to: "medium" },
      title: { from: "Opening checkout takes the item out of stock", to: "A reservation lasts 30 minutes and is not shown to the customer" },
    });
    assert.match(lines[0] ?? "", /revised: severity high -> medium/);
  });

  it("records no change when the same values are given again", () => {
    updateFinding({ target: "shop", id: "F-001", severity: "medium", note: "nothing new" });
    assert.equal((readFindings("shop")["F-001"]?.history[1] as { changes?: unknown }).changes, undefined);
  });
});

describe("improvement suggestions", () => {
  it("may rest on a passing test, unlike a defect", () => {
    const base = { target: "shop", tests: ["T-002"], expected: "n/a", actual: "works", duplicateCheck: "new", evidence: [shot2] };
    assert.throws(() => addFinding({ ...base, title: "x", classification: "suspected-defect" }), refused(/must rest on an executed test/));
    addFinding({ ...base, title: "Show sold-out sizes greyed out", classification: "improvement", severity: "low" });
    const finding = readFindings("shop")["F-002"];
    assert.equal(finding?.status, "open");
    assert.equal(statusLabel(finding!).text, "Suggestion");
  });
});

describe("evidence arguments", () => {
  it("splits several paths that a shell joined into one argument", () => {
    assert.equal(resolveEvidence("shop", [`${shot1} ${shot2}`]).length, 2);
  });
  it("still refuses a path that does not exist", () => {
    assert.throws(() => resolveEvidence("shop", [`${shot1} runs/nope.png`]), refused(/evidence file not found/));
  });
});

describe("destructive-word guard", () => {
  const off = { destructive: false, destructive_allow: [] as string[] };
  it("refuses a control named like a destructive action and says how to record an exception", () => {
    assert.match(destructiveRefusal('button "Delete account"', off) ?? "", /destructive_allow/);
  });
  it("lets through a harmless control once its name is listed", () => {
    const allow = { destructive: false, destructive_allow: ["remove my current plan only"] };
    assert.equal(destructiveRefusal('button "Remove my current plan only"', allow), undefined);
    assert.ok(destructiveRefusal('button "Remove account"', allow), "another control with the same word is still refused");
  });
  it("does not touch controls without such a word", () => {
    assert.equal(destructiveRefusal('button "Continue"', off), undefined);
  });
});

describe("stakeholder report", () => {
  setCoverage({ target: "shop", area: "Refunds", status: "not-covered", note: "no refund control found", tests: [], req: [] });

  it("builds from the records alone", () => {
    const html = stakeholderHtml(loadStakeholderData("shop"));
    assert.match(html, /2 findings from 2 tests/);
    assert.match(html, /findings: 1 medium, 1 low/);
    assert.match(html, /Needs decision/);
    assert.match(html, /Suggestion/);
    assert.match(html, /Refunds/, "coverage that is not covered is listed as not tested");
    assert.match(html, /background-image:url\('\.\.\/runs\//, "evidence screenshots are shown");
  });

  it("uses the tester's wording from the brief, escaped, and reports missing images", () => {
    const brief = Brief.parse({
      headline: "Checkout works, but <reservations> are invisible",
      priorities: [{ finding: "F-001", text: "Tell the customer how long the item is held." }],
      findings: { "F-001": { suggestion: "Show a countdown.", images: [{ path: "runs/missing.png", caption: "x" }] } },
      decisions: ["How long should a reservation last?"],
    });
    const missing: string[] = [];
    const html = stakeholderHtml({ ...loadStakeholderData("shop"), brief }, missing);
    assert.match(html, /Checkout works, but &lt;reservations&gt; are invisible/);
    assert.match(html, /Suggested direction/);
    assert.match(html, /How long should a reservation last\?/);
    assert.deepEqual(missing, ["runs/missing.png"]);
  });
});
