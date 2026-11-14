/**
 * A small, self-contained demo target ("TeamTrack") for trying the QA workspace.
 * Node standard library only; data is held in memory and reset on restart.
 *
 *   npx tsx fixtures/teamtrack/app.ts [port]      (default http://127.0.0.1:8765)
 *
 * Two demo accounts (Switch account -> pick one -> Sign in): Alex (Project manager, the default
 * when nobody has signed in) and Vic (Viewer). The app contains deliberate defects; a session that
 * is investigating it must not read this file.
 *
 * Test-only switches:
 *   GET /__hold?seconds=N[&who=session]  hold every request (or only those with a session cookie) for N seconds
 *   GET /__release                       stop holding
 *   GET /slow                            a page that takes 40 seconds to answer
 *   GET /__fix?bug=duplicates|viewer-delete   "ship a fix" for one deliberate defect (restart to undo)
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

interface Project {
  id: number;
  name: string;
  owner: string;
  due: string;
  status: string;
  tasks: string[];
}
type Form = Record<string, string>;
type Username = "alex" | "vic";

let projects: Project[] = [
  { id: 1, name: "Website Redesign", owner: "Priya", due: "2026-12-15", status: "Active", tasks: ["Wireframes", "Content audit", "QA sign-off"] },
  { id: 2, name: "Mobile App Launch", owner: "Marco", due: "2027-02-01", status: "Active", tasks: ["Store listing", "Beta feedback"] },
  { id: 3, name: "Data Warehouse Migration", owner: "Priya", due: "2026-11-30", status: "On hold", tasks: ["Schema mapping"] },
];
const OWNERS = ["Priya", "Marco", "Dana"];
const USERS: Record<Username, { name: string; role: string }> = {
  alex: { name: "Alex", role: "Project manager" },
  vic: { name: "Vic", role: "Viewer" },
};
const isUsername = (value: string): value is Username => value in USERS;

const hold = { until: 0, who: "all" };
const fixed = new Set<string>();

const CSS = `
body{font-family:system-ui,Segoe UI,sans-serif;margin:0;background:#f6f7f9;color:#1d2330}
header{background:#24305e;color:#fff;padding:10px 24px;display:flex;gap:24px;align-items:center}
header a{color:#dfe6ff;text-decoration:none} header a[aria-current=page]{color:#fff;font-weight:600}
main{padding:24px;max-width:960px} table{border-collapse:collapse;width:100%;background:#fff}
td,th{border-bottom:1px solid #e3e6ec;padding:8px;text-align:left}
.btn{background:#3b5bdb;color:#fff;border:0;padding:8px 14px;border-radius:6px;cursor:pointer}
.btn.secondary{background:#e3e6ec;color:#1d2330} .btn.danger{background:#c92a2a}
dialog{border:0;border-radius:10px;box-shadow:0 10px 40px #0004;min-width:380px}
label{display:block;margin:10px 0 4px} input,select,textarea{width:100%;padding:6px;box-sizing:border-box}
.error{background:#ffe3e3;color:#a61e1e;padding:8px;border-radius:6px} .ok{background:#d3f9d8;color:#2b8a3e;padding:8px;border-radius:6px}
[role=tablist] button{background:none;border:0;padding:8px 12px;cursor:pointer}
[role=tablist] button[aria-selected=true]{border-bottom:3px solid #3b5bdb;font-weight:600}
.cards{display:flex;gap:16px} .card{background:#fff;padding:16px;border-radius:8px;flex:1}
`;

function esc(value: string | number): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

const NAV: [string, string][] = [["/", "Dashboard"], ["/projects", "Projects"], ["/reports", "Reports"], ["/settings", "Settings"]];

function layout(title: string, current: string, body: string, user: Username, script = ""): string {
  const nav = NAV.map(([href, label]) => `<a href="${href}"${current === href ? " aria-current=page" : ""}>${label}</a>`).join("");
  const who = USERS[user];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)} · TeamTrack</title>
<style>${CSS}</style></head><body><header><strong>TeamTrack</strong><nav aria-label="Main">${nav}</nav>
<span style="margin-left:auto">Signed in as ${who.name} (${who.role}) · <a href="/login">Switch account</a> · <a href="/logout">Log out</a></span></header>
<main>${body}</main><script>${script}</script></body></html>`;
}

// ---------------------------------------------------------------- views
function dashboard(user: Username): string {
  const active = projects.filter((p) => p.status === "Active").length;
  const dueSoon = projects.filter((p) => p.due && p.due <= "2026-12-31");
  const items = dueSoon.map((p) => `<li><a href="/projects/${p.id}">${esc(p.name)}</a> — ${p.due}</li>`).join("");
  const body = `<h1>Dashboard</h1><div class="cards">
<section class="card" aria-label="Active projects"><h2>Active projects</h2><p>${active}</p><a href="/projects">View all projects</a></section>
<section class="card" aria-label="Due this year"><h2>Due this year</h2><ul>${items}</ul></section>
</div>`;
  return layout("Dashboard", "/", body, user);
}

function projectList(user: Username, options: { errors?: string[]; values?: Form; flash?: string } = {}): string {
  const { errors, values = {}, flash = "" } = options;
  const rows = projects
    .map(
      (p) =>
        `<tr><td><a href='/projects/${p.id}'>${esc(p.name)}</a></td><td>${esc(p.owner)}</td>` +
        `<td>${esc(p.due)}</td><td>${esc(p.status)}</td></tr>`,
    )
    .join("");
  const created = flash ? projects.find((p) => String(p.id) === flash) : undefined;
  const message = created ? `<p class="ok" role="status">Project “${esc(created.name)}” created.</p>` : "";
  const error = errors?.length ? `<div class="error" role="alert">${errors.map(esc).join(" ")}</div>` : "";
  const ownerOptions =
    "<option value=''>Select…</option>" +
    OWNERS.map((o) => `<option${values.owner === o ? " selected" : ""}>${o}</option>`).join("");
  const nameInvalid = errors?.length && !(values.name ?? "").trim() ? ' aria-invalid="true"' : "";
  const viewer = user === "vic";
  const dialog = viewer
    ? ""
    : `<dialog id="newdlg" aria-labelledby="dlgtitle">
<form method="post" action="/projects"><h2 id="dlgtitle">New project</h2>${error}
<label for="name">Project name</label><input id="name" name="name" value="${esc(values.name ?? "")}"${nameInvalid}>
<label for="owner">Owner</label><select id="owner" name="owner">${ownerOptions}</select>
<label for="due">Due date</label><input id="due" name="due" type="date" value="${esc(values.due ?? "")}">
<p><button class="btn" type="submit">Create project</button>
<button class="btn secondary" type="button" onclick="document.getElementById('newdlg').close()">Cancel</button></p>
</form></dialog>`;
  const newButton = viewer
    ? ""
    : `<p><button class="btn" type="button" onclick="document.getElementById('newdlg').showModal()">New project</button></p>`;
  const body = `<h1>Projects</h1>${message}${newButton}
<table aria-label="Projects"><thead><tr><th>Name</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>${dialog}`;
  return layout("Projects", "/projects", body, user, errors?.length ? "document.getElementById('newdlg').showModal()" : "");
}

function projectDetail(user: Username, p: Project): string {
  const tasks = p.tasks.map((t) => `<li>${esc(t)}</li>`).join("") || "<li>No tasks yet</li>";
  const deleteForm =
    user === "vic" && fixed.has("viewer-delete")
      ? ""
      : `<form method="post" action="/projects/${p.id}/delete" onsubmit="return confirm('Delete this project?')">
<button class="btn danger" type="submit">Delete project</button></form>`;
  const body = `<p><a href="/projects">← Back to projects</a></p><h1>${esc(p.name)}</h1>
<div role="tablist" aria-label="Project sections">
<button role="tab" id="t-ov" aria-selected="true" aria-controls="p-ov">Overview</button>
<button role="tab" id="t-tk" aria-selected="false" aria-controls="p-tk">Tasks</button>
<button role="tab" id="t-ac" aria-selected="false" aria-controls="p-ac">Activity</button></div>
<section role="tabpanel" id="p-ov" aria-labelledby="t-ov"><p>Owner: ${esc(p.owner)}</p><p>Due: ${esc(p.due)}</p><p>Status: ${esc(p.status)}</p></section>
<section role="tabpanel" id="p-tk" aria-labelledby="t-tk" hidden><h2>Tasks</h2><ul>${tasks}</ul></section>
<section role="tabpanel" id="p-ac" aria-labelledby="t-ac" hidden><h2>Activity</h2><p>Created by Alex.</p></section>
${deleteForm}`;
  const script = `document.querySelectorAll('[role=tab]').forEach(t=>t.onclick=()=>{
document.querySelectorAll('[role=tab]').forEach(o=>{o.setAttribute('aria-selected',o===t);
document.getElementById(o.getAttribute('aria-controls')).hidden=o!==t;});});`;
  return layout(p.name, "", body, user, script);
}

function login(user: Username, error = ""): string {
  const alert = error ? `<div class="error" role="alert">${esc(error)}</div>` : "";
  const buttons = (Object.entries(USERS) as [Username, { name: string; role: string }][])
    .map(
      ([key, { name, role }]) =>
        `<button class="btn secondary" type="button" onclick="document.getElementById('acct').value='${key}';` +
        `document.getElementById('chosen').textContent='${name}'">${name} (${role})</button> `,
    )
    .join("");
  const body = `<h1>Sign in</h1>${alert}<p>Demo accounts:</p><form method="post" action="/login">
<p>${buttons}</p><p>Selected: <span id="chosen">nobody</span></p><input type="hidden" id="acct" name="account">
<button class="btn" type="submit">Sign in</button></form>`;
  return layout("Sign in", "", body, user);
}

function reports(user: Username, owner: string): string {
  const rows = projects.filter((p) => owner === "All" || owner === "" || p.owner === owner);
  const options = ["All", ...OWNERS].map((o) => `<option${owner === o ? " selected" : ""}>${o}</option>`).join("");
  const body = `<h1>Reports</h1><form method="get"><label for="o">Owner</label>
<select id="o" name="owner">${options}</select><button class="btn secondary" type="submit">Apply filter</button></form>
<p>${rows.length} project(s)</p><ul>${rows.map((p) => `<li>${esc(p.name)} (${esc(p.status)})</li>`).join("")}</ul>
<p><a href="/reports/export.csv">Export CSV</a></p>`;
  return layout("Reports", "/reports", body, user);
}

function settingsPage(user: Username): string {
  const body = `<h1>Settings</h1><form method="post" action="/settings">
<label for="dn">Display name</label><input id="dn" name="dn" value="Alex">
<label><input type="checkbox" name="digest" checked style="width:auto"> Email me a weekly digest</label>
<p><button class="btn" type="submit">Save changes</button></p></form>`;
  return layout("Settings", "/settings", body, user, "console.error('settings: failed to load notification preferences')");
}

// ---------------------------------------------------------------- HTTP layer
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function currentUser(req: IncomingMessage): Username {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [key, value = ""] = part.trim().split("=", 2);
    if (key === "user" && isUsername(value)) return value;
  }
  return "alex";
}

async function waitWhileHeld(req: IncomingMessage): Promise<void> {
  const held = hold.who === "all" || (req.headers.cookie ?? "").includes("sid=");
  while (held && Date.now() < hold.until) await sleep(200);
}

function send(res: ServerResponse, body: string, status = 200, type = "text/html; charset=utf-8", cookie = ""): void {
  const bytes = Buffer.from(body, "utf8");
  res.writeHead(status, {
    "Set-Cookie": cookie ? ["sid=demo; Path=/", cookie] : ["sid=demo; Path=/"],
    "Content-Type": type,
    "Content-Length": bytes.length,
  });
  res.end(bytes);
}

function redirect(res: ServerResponse, to: string, cookie = ""): void {
  res.writeHead(303, cookie ? { Location: to, "Set-Cookie": cookie } : { Location: to });
  res.end();
}

async function handleGet(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const parts = url.pathname.split("/").filter(Boolean);
  const query = url.searchParams;
  const route = parts.join("/");
  if (route === "__hold") {
    hold.until = Date.now() + Number(query.get("seconds") ?? "30") * 1000;
    hold.who = query.get("who") ?? "all";
    return send(res, "held", 200, "text/plain");
  }
  if (route === "__fix") {
    fixed.add(query.get("bug") ?? "");
    return send(res, `fixed: ${JSON.stringify([...fixed].sort())}`, 200, "text/plain");
  }
  if (route === "__release") {
    hold.until = 0;
    return send(res, "released", 200, "text/plain");
  }
  await waitWhileHeld(req);
  const user = currentUser(req);
  if (route === "slow") {
    await sleep(40_000);
    return send(res, layout("Slow", "", "<h1>Slow page</h1>", "alex"));
  }
  if (url.pathname === "/") return send(res, dashboard(user));
  if (route === "projects") return send(res, projectList(user, { flash: query.get("created") ?? "" }));
  if (parts.length === 2 && parts[0] === "projects" && /^\d+$/.test(parts[1] ?? "")) {
    const project = projects.find((p) => p.id === Number(parts[1]));
    return project
      ? send(res, projectDetail(user, project))
      : send(res, layout("Not found", "", "<h1>Project not found</h1>", "alex"), 404);
  }
  if (route === "reports") return send(res, reports(user, query.get("owner") ?? "All"));
  if (route === "reports/export.csv") {
    const rows = `name,owner,due\n${projects.map((p) => `${p.name},${p.owner},${p.due}\n`).join("")}`;
    res.writeHead(200, { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=projects.csv" });
    res.end(rows);
    return;
  }
  if (route === "settings") return send(res, settingsPage(user));
  if (route === "login") return send(res, login(user));
  if (route === "logout") {
    return send(res, layout("Signed out", "", "<h1>You have been signed out</h1><a href='/'>Sign in again</a>", "alex"));
  }
  send(res, layout("Not found", "", "<h1>Page not found</h1>", "alex"), 404);
}

async function readForm(req: IncomingMessage): Promise<Form> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const form: Form = {};
  for (const [key, value] of new URLSearchParams(Buffer.concat(chunks).toString("utf8"))) {
    if (value !== "" && !(key in form)) form[key] = value; // blank values are dropped
  }
  return form;
}

async function handlePost(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  await waitWhileHeld(req);
  const form = await readForm(req);
  const parts = url.pathname.split("/").filter(Boolean);
  const route = parts.join("/");
  const user = currentUser(req);
  if (route === "login") {
    const who = form.account ?? "";
    if (!isUsername(who)) return send(res, login(user, "Choose an account."), 422);
    return redirect(res, "/", `user=${who}; Path=/`);
  }
  if (route === "projects") {
    if (user === "vic") {
      const body = "<h1>Not allowed</h1><p role='alert'>Viewers can't create projects.</p>";
      return send(res, layout("Not allowed", "/projects", body, user), 403);
    }
    const name = (form.name ?? "").trim();
    const errors: string[] = [];
    if (!name) errors.push("Project name is required.");
    if (!OWNERS.includes(form.owner ?? "")) errors.push("Choose an owner.");
    // Deliberate defect: the rules say names must be unique, but duplicates are not rejected.
    if (fixed.has("duplicates") && projects.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      errors.push("A project with this name already exists.");
    }
    if (errors.length > 0) return send(res, projectList(user, { errors, values: form }), 422);
    const id = Math.max(...projects.map((p) => p.id)) + 1;
    projects.push({ id, name, owner: form.owner ?? "", due: form.due ?? "", status: "Active", tasks: [] });
    return redirect(res, `/projects?created=${id}`);
  }
  if (parts.length === 3 && parts[0] === "projects" && parts[2] === "delete") {
    // Deliberate defect: no role check here; a Viewer may delete.
    projects = projects.filter((p) => String(p.id) !== parts[1]);
    return redirect(res, "/projects");
  }
  if (route === "settings") return redirect(res, "/settings");
  send(res, "not found", 404, "text/plain");
}

function main(): void {
  const port = Number(process.argv[2] ?? 8765);
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const work = req.method === "POST" ? handlePost(req, res, url) : handleGet(req, res, url);
    work.catch((error: unknown) => {
      console.error(error);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`TeamTrack demo running on http://127.0.0.1:${port}  (today is ${new Date().toISOString().slice(0, 10)})`);
  });
}

main();
