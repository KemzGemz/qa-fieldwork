/** The rules that make recorded verdicts trustworthy, and target isolation. */
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createWorkspace, fakeBrowserStep } from "./helpers.ts";

createWorkspace();
const { ToolError } = await import("../tools/lib/core/errors.ts");
const { inside, targetDir } = await import("../tools/lib/core/paths.ts");
const { requireTargetBranch } = await import("../tools/lib/core/git.ts");
const { readJson } = await import("../tools/lib/core/store.ts");
const { initTarget, checkTarget } = await import("../tools/lib/target/admin.ts");
const { loadRun, readTests, runEnd, runStart } = await import("../tools/lib/records/runs.ts");
const { testPlan, testResult, testRevise, testStart } = await import("../tools/lib/records/tests.ts");
const { addFinding, readFindings, updateFinding } = await import("../tools/lib/records/findings.ts");
const { checkpoint } = await import("../tools/lib/records/handover.ts");
const { checkRecords } = await import("../tools/lib/report/check.ts");

const refused = (pattern: RegExp) => (error: unknown) => error instanceof ToolError && pattern.test(error.message);

initTarget({ target: "app-a", url: "http://127.0.0.1:9001/", env: "local" });
initTarget({ target: "app-b", url: "http://127.0.0.1:9002/", env: "local" });
runStart({ target: "app-a", mode: "default", budget: 20 });
runStart({ target: "app-b", mode: "default" });
const runA = loadRun("app-a").dir;

const plan = (id: string, basisType: "requirement" | "domain" = "requirement") =>
  testPlan({ target: "app-a", id, title: `test ${id}`, why: "matters", expected: "X happens", basisType, basis: "FSD BR-01" });

describe("expectation before verdict", () => {
  it("refuses a verdict for a test that was never planned", () => {
    assert.throws(() => testResult({ target: "app-a", id: "T-900", status: "pass", actual: "x" }), refused(/not planned/));
  });

  it("refuses an executed verdict without test-start", () => {
    plan("T-001");
    assert.throws(() => testResult({ target: "app-a", id: "T-001", status: "pass", actual: "x" }), refused(/never started/));
  });

  it("refuses an executed verdict without logged browser activity", () => {
    testStart("app-a", "T-001");
    assert.throws(() => testResult({ target: "app-a", id: "T-001", status: "pass", actual: "x" }), refused(/no browser activity/));
  });

  it("refuses an executed verdict without evidence, then accepts one with it", () => {
    const evidence = fakeBrowserStep(runA);
    assert.throws(() => testResult({ target: "app-a", id: "T-001", status: "pass", actual: "x" }), refused(/evidence/));
    testResult({ target: "app-a", id: "T-001", status: "pass", actual: "X happened", evidence: [evidence] });
    const result = readTests(runA)["T-001"]?.result;
    assert.equal(result?.status, "pass");
    assert.equal(result?.logged_actions, 1);
    assert.match(result?.evidence[0] ?? "", /^runs\/run-.*\/evidence\/step\.png$/);
  });

  it("allows not-run and blocked without any browser activity", () => {
    plan("T-002");
    testResult({ target: "app-a", id: "T-002", status: "not-run", actual: "out of budget" });
    assert.equal(readTests(runA)["T-002"]?.result?.status, "not-run");
  });
});

describe("confirmed versus suspected", () => {
  it("refuses 'fail' on a soft basis, accepts 'suspected', and accepts 'fail' when objective", () => {
    plan("T-003", "domain");
    testStart("app-a", "T-003");
    const evidence = fakeBrowserStep(runA, "soft.png");
    const base = { target: "app-a", id: "T-003", actual: "Y happened", evidence: [evidence] };
    assert.throws(() => testResult({ ...base, status: "fail" }), refused(/not confirmed/));
    testResult({ ...base, status: "suspected" });
    testResult({ ...base, status: "fail", objective: true });
    assert.equal(readTests(runA)["T-003"]?.result?.status, "fail");
  });

  it("keeps the original expectation when it is revised", () => {
    testRevise({ target: "app-a", id: "T-003", reason: "owner clarified", expected: "Y happens", basisType: "rule", basis: "owner, 15 Nov" });
    const test = readTests(runA)["T-003"];
    assert.equal(test?.expectation.text, "Y happens");
    assert.equal(test?.expectation_history[0]?.text, "X happens");
    assert.equal(test?.expectation_history[0]?.after_result, true);
  });
});

describe("findings", () => {
  const finding = { target: "app-a", title: "broken", expected: "X", actual: "Y", duplicateCheck: "first", repro: "1/1" };

  it("refuses a defect finding that rests only on passing tests", () => {
    assert.throws(() => addFinding({ ...finding, classification: "product-failure", tests: ["T-001"] }), refused(/fail\/suspected/));
  });

  it("refuses a product failure without a reproduction statement", () => {
    assert.throws(
      () => addFinding({ ...finding, repro: undefined, classification: "product-failure", tests: ["T-003"] }),
      refused(/--repro/),
    );
  });

  it("files a finding, and updates append to its history instead of rewriting it", () => {
    addFinding({ ...finding, classification: "product-failure", tests: ["T-003", "T-001"] });
    updateFinding({ target: "app-a", id: "F-001", status: "confirmed", note: "seen again" });
    const stored = readFindings("app-a")["F-001"];
    assert.equal(stored?.status, "confirmed");
    assert.deepEqual(stored?.history.map((h) => [h.from, h.to]), [["open", "confirmed"]]);
  });

  it("flags a failing test no finding refers to, and a defect finding without evidence", () => {
    plan("T-004");
    testStart("app-a", "T-004");
    testResult({ target: "app-a", id: "T-004", status: "fail", actual: "Z", evidence: [fakeBrowserStep(runA, "z.png")] });
    const problems = checkRecords("app-a", readTests(runA), readFindings("app-a"));
    assert.deepEqual(problems, [
      "T-004: fail but no finding refers to it (file one, or explain in the result)",
      "F-001: defect finding without evidence",
    ]);
  });
});

describe("target isolation", () => {
  it("rejects malformed and unknown target ids", () => {
    assert.throws(() => targetDir("../app-a"), refused(/invalid target id/));
    assert.throws(() => targetDir("App"), refused(/invalid target id/));
    assert.throws(() => targetDir("nope"), refused(/unknown target/));
  });

  it("refuses evidence that belongs to another target", () => {
    const foreign = join(runA, "evidence", "step.png");
    assert.throws(() => inside("app-b", foreign), refused(/not inside targets\/app-b/));
    testPlan({ target: "app-b", id: "T-001", title: "t", why: "w", expected: "e", basisType: "requirement", basis: "b" });
    assert.throws(
      () => testResult({ target: "app-b", id: "T-001", status: "blocked", actual: "x", evidence: [foreign] }),
      refused(/not inside targets\/app-b/),
    );
  });

  it("keeps each target's records apart", () => {
    assert.deepEqual(Object.keys(readFindings("app-b")), []);
    assert.deepEqual(Object.keys(readTests(loadRun("app-b").dir)), ["T-001"]);
  });

  it("detects a URL that belongs to another target", () => {
    const { lines, exitCode } = checkTarget("app-a", "http://127.0.0.1:9002/login");
    assert.equal(exitCode, 3);
    assert.ok(lines.some((line) => line.includes("did you mean --target app-b")));
    assert.equal(checkTarget("app-a", "http://127.0.0.1:9001/x").exitCode, 0);
  });
});

describe("branch rule", () => {
  it("refuses to create a target on main and names the worktree command", () => {
    assert.throws(() => requireTargetBranch("shop", "main"), refused(/git worktree add \.\.\/qa-fieldwork-shop -b sut\/shop main/));
    assert.throws(() => requireTargetBranch("shop", "master"), refused(/holds only the workspace/));
  });

  it("allows a SUT branch, a checkout without Git, and an explicit override", () => {
    requireTargetBranch("shop", "sut/shop");
    requireTargetBranch("shop", undefined);
    requireTargetBranch("shop", "main", true);
  });
});

describe("runs", () => {
  it("refuses to end a run that was not checkpointed, and to start a second active run", () => {
    assert.throws(() => runEnd("app-a"), refused(/checkpoint this run first/));
    assert.throws(() => runStart({ target: "app-a", mode: "resume" }), refused(/still active/));
    checkpoint({ target: "app-a", state: "done", next: "continue with area Y" });
    runEnd("app-a");
    assert.equal(loadRun("app-a").run.status, "closed");
    const handover = readJson<{ next_action: string }>(join(targetDir("app-a"), "handover.json"));
    assert.equal(handover?.next_action, "continue with area Y");
  });
});
