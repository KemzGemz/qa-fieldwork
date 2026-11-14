/** The parts of the browser layer that need no browser: snapshot parsing and the stall decision table. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAriaSnapshot } from "../tools/lib/browser/aria.ts";
import { classifyStall, type StallProbes } from "../tools/lib/browser/stall.ts";

const SNAPSHOT = `
- banner:
  - link "Bookings":
    - /url: /bookings
  - button "Sign out"
- main:
  - heading "Customers" [level=1]
  - status: Hold released for Kestrel.
  - alert:
    - text: Name is required.
  - table "Customers":
    - rowgroup:
      - row "Kestrel Active":
        - cell "Kestrel"
        - cell:
          - button "Place hold"
      - row "Hartley Active":
        - cell:
          - button "Place hold"
  - textbox "Deposit rate (%)": "20"
  - combobox "Owner":
    - option "Select…" [selected]
    - option "Priya"
  - 'link "Help: FAQ"':
    - /url: /help
  - dialog "New project":
    - button "Cancel" [disabled]
`;

describe("parseAriaSnapshot", () => {
  const facts = parseAriaSnapshot(SNAPSHOT);
  const find = (name: string, nth = 0) => facts.elements.find((e) => e.name === name && e.nth === nth);

  it("numbers interactive elements and reads link addresses", () => {
    assert.deepEqual(facts.elements.map((e) => e.ref).slice(0, 3), ["e1", "e2", "e3"]);
    assert.equal(find("Bookings")?.href, "/bookings");
    assert.equal(find("Help: FAQ")?.href, "/help");
  });

  it("tells apart elements that share a role and name", () => {
    assert.equal(find("Place hold", 0)?.nth, 0);
    assert.equal(find("Place hold", 1)?.nth, 1);
  });

  it("reads headings, status and alert text, dialogs and values", () => {
    assert.deepEqual(facts.headings, ["Customers"]);
    assert.deepEqual(facts.alerts, ["Hold released for Kestrel.", "Name is required."]);
    assert.equal(facts.dialog, "New project");
    assert.equal(find("Deposit rate (%)")?.value, "20");
    assert.equal(find("Cancel")?.in_dialog, true);
    assert.deepEqual(find("Cancel")?.attrs, ["disabled"]);
  });

  it("does not list the options of a select as separate controls", () => {
    assert.equal(facts.elements.filter((e) => e.role === "option").length, 0);
    assert.ok(find("Owner"));
  });
});

describe("classifyStall", () => {
  const healthy: StallProbes = { pageJs: true, withSession: true, withoutSession: true, appBusy: false, stuck: [] };
  const stuck = (type: string) => [{ age_s: 9, method: "GET", type, url: "http://x/" }];
  const cases: [string, Partial<StallProbes>, string][] = [
    ["nothing wrong on the site or page", {}, "automation-wait"],
    ["the tab does not run JavaScript", { pageJs: false }, "browser-frozen"],
    ["the site answers nobody", { withSession: false, withoutSession: false }, "site-unreachable"],
    ["the site answers others but not this session", { withSession: false }, "site-holding-session"],
    ["the page shows its own loader", { appBusy: true }, "application-loading"],
    ["a page load is stuck", { stuck: stuck("document") }, "navigation-stuck"],
    ["a background request is slow", { stuck: stuck("fetch") }, "one-request-slow"],
  ];
  for (const [situation, probes, expected] of cases) {
    it(`${situation} -> ${expected}`, () => {
      assert.equal(classifyStall({ ...healthy, ...probes }).kind, expected);
    });
  }
});
