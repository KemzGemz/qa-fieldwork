/**
 * Parser for Playwright's YAML-like accessibility snapshot: turns it into the interactive elements
 * a tester can act on (each with a ref, e1, e2, ...) plus headings, alerts and any open dialog.
 * Knows nothing about any target application. Ported from qa-pipeline (qahelper/browser.py).
 */

const INTERACTIVE_ROLES = new Set([
  "link", "button", "textbox", "searchbox", "combobox", "listbox", "checkbox", "radio", "switch", "tab",
  "menuitem", "menuitemcheckbox", "menuitemradio", "spinbutton", "slider", "option", "treeitem",
]);
const VALUE_ROLES = new Set(["textbox", "searchbox", "combobox", "spinbutton", "slider"]);
const ALERT_TEXT_ROLES = new Set(["text", "paragraph", "generic", "strong", "emphasis"]);
const STRUCTURAL_ROLES = new Set(["generic", "group", "list", "listitem", "row", "cell", "rowgroup", "paragraph"]);
const DIALOG_ROLES = new Set(["dialog", "alertdialog"]);

const LINE =
  /^(?<indent>\s*)- (?<role>[a-zA-Z/]+)(?: (?<name>"(?:[^"\\]|\\.)*"|\/(?:[^/\\]|\\.)*\/))?(?<attrs>(?: \[[^\]]*\])*)(?<colon>:)?\s?(?<rest>.*)$/;
const ATTRIBUTE = /\[([^\]]*)\]/g;
/** YAML quotes a whole entry when it contains ": ", e.g.  - 'link "Help: FAQ"': */
const YAML_QUOTED = /^(\s*)- '((?:[^']|'')*)'(:?.*)$/;

export interface PageElement {
  /** Handle valid for the observation it came from: e1, e2, ... */
  ref: string;
  role: string;
  /** Accessible name. */
  name: string;
  /** Index among elements with the same role and name. */
  nth: number;
  /** Index among elements with the same role (used when the name is empty). */
  nth_role: number;
  attrs: string[];
  /** Enclosing landmarks and containers, innermost last. */
  context: string;
  in_dialog: boolean;
  href?: string;
  value?: string;
}

export interface AriaFacts {
  elements: PageElement[];
  headings: string[];
  alerts: string[];
  dialog: string | null;
}

function unquote(name: string | undefined): string {
  if (!name) return "";
  if (name.startsWith('"')) return name.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  return name.replace(/^\/|\/$/g, "");
}

const stripQuotes = (text: string): string => text.replace(/^"|"$/g, "");

export function parseAriaSnapshot(snapshot: string): AriaFacts {
  const elements: PageElement[] = [];
  const headings: string[] = [];
  const alerts: string[] = [];
  let dialog: string | null = null;
  const stack: { indent: number; role: string; name: string }[] = [];
  const sameNameCount = new Map<string, number>();
  const sameRoleCount = new Map<string, number>();
  let lastLink: PageElement | undefined;
  let alertIndent: number | undefined;

  for (let raw of snapshot.split("\n")) {
    const quoted = YAML_QUOTED.exec(raw);
    if (quoted) raw = `${quoted[1]}- ${(quoted[2] ?? "").replace(/''/g, "'")}${quoted[3]}`;
    const groups = LINE.exec(raw)?.groups;
    if (!groups) continue;

    const indent = (groups.indent ?? "").length;
    const role = groups.role ?? "";
    const name = unquote(groups.name);
    const attrs = [...(groups.attrs ?? "").matchAll(ATTRIBUTE)].map((m) => (m[1] ?? "").trim());
    const rest = (groups.rest ?? "").trim();

    while (stack.length > 0 && (stack.at(-1)?.indent ?? 0) >= indent) stack.pop();
    if (alertIndent !== undefined && indent <= alertIndent) alertIndent = undefined;

    if (role === "/url") {
      if (lastLink) lastLink.href = stripQuotes(rest);
      continue;
    }
    if (role.startsWith("/")) continue;

    if (alertIndent !== undefined && (name || rest) && ALERT_TEXT_ROLES.has(role)) {
      alerts.push(name || stripQuotes(rest));
    }
    if (role === "alert" || role === "status") {
      const text = name || stripQuotes(rest);
      if (text) alerts.push(text);
      alertIndent = indent;
    }
    if (role === "heading" && name) headings.push(name);
    if (DIALOG_ROLES.has(role) && dialog === null) dialog = name || "(unnamed dialog)";

    const parentRole = stack.at(-1)?.role;
    const isSelectOption = role === "option" && (parentRole === "combobox" || parentRole === "listbox");
    if (INTERACTIVE_ROLES.has(role) && !isSelectOption) {
      const nameKey = `${role}\u0000${name}`;
      const nth = sameNameCount.get(nameKey) ?? 0;
      sameNameCount.set(nameKey, nth + 1);
      const nthRole = sameRoleCount.get(role) ?? 0;
      sameRoleCount.set(role, nthRole + 1);
      const element: PageElement = {
        ref: `e${elements.length + 1}`,
        role,
        name,
        nth,
        nth_role: nthRole,
        attrs,
        context: stack
          .filter((s) => !STRUCTURAL_ROLES.has(s.role))
          .map((s) => `${s.role} ${s.name}`.trim())
          .join(" > ")
          .slice(-100),
        in_dialog: stack.some((s) => DIALOG_ROLES.has(s.role)),
      };
      if (rest && VALUE_ROLES.has(role)) element.value = stripQuotes(rest);
      elements.push(element);
      lastLink = role === "link" ? element : undefined;
    }
    if (groups.colon) stack.push({ indent, role, name });
  }
  return { elements, headings, alerts, dialog };
}
