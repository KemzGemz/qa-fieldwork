/**
 * Tallyard HireDesk - equipment hire desk application (single file, Node standard library only).
 *
 * Usage: npx tsx fixtures/acceptance-app/app.ts [port]      (default port 8791, binds 127.0.0.1)
 * Data is held in memory and re-seeded on every start.
 *
 * This is a practice target for QA investigations. A session that is investigating it must not
 * read this file or SEALED/.
 */
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const PRODUCT = "Tallyard HireDesk";
const VERSION = "1.4.2";
const WEEKLY_DISCOUNT_PCT = 10;
const STATUSES = ["Draft", "Reserved", "On Hire", "Returned", "Cancelled"] as const;
type Status = (typeof STATUSES)[number];
type Role = "Manager" | "Clerk";

interface User {
  password: string;
  name: string;
  role: Role;
}
interface Equipment {
  id: number;
  name: string;
  /** Daily rate per unit, in pence. */
  rate: number;
  total: number;
  /** Units held by Reserved and On Hire bookings. */
  out: number;
}
interface Customer {
  id: number;
  name: string;
  phone: string;
  hold: boolean;
}
interface Booking {
  ref: string;
  customer: number;
  equipment: number;
  qty: number;
  start: Date;
  end: Date;
  days: number;
  rate: number;
  gross: number;
  discount: number;
  charge: number;
  deposit: number | null;
  depositPct: number | null;
  status: Status;
  createdBy: string;
  notes: string;
  history: string[];
}
type Flash = ["ok" | "error", string];
interface Session {
  user: string | null;
  flash?: Flash;
}
type Form = Record<string, string>;

const USERS: Record<string, User> = {
  maria: { password: "Depot!Manager1", name: "Maria Okafor", role: "Manager" },
  tom: { password: "Counter!Clerk1", name: "Tom Riley", role: "Clerk" },
  priya: { password: "Counter!Clerk2", name: "Priya Nair", role: "Clerk" },
};

const sessions = new Map<string, Session>();
const settings = { depositPct: 20, maxDays: 28 };
const equipment = new Map<number, Equipment>();
const customers = new Map<number, Customer>();
const bookings = new Map<string, Booking>();
let nextReference = 1001;

/** Look up a record that the caller knows exists. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("missing record");
  return value;
}
const userName = (username: string): string => must(USERS[username]).name;

// ---------------------------------------------------------------- domain logic
const DAY_MS = 86_400_000;

function money(pence: number): string {
  return `&pound;${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function hireDays(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
}

/** Gross, discount and charge in pence. */
function price(rate: number, qty: number, days: number): { gross: number; discount: number; charge: number } {
  const gross = rate * qty * days;
  const discount = days > 7 ? Math.floor((gross * WEEKLY_DISCOUNT_PCT) / 100) : 0;
  return { gross, discount, charge: gross - discount };
}

/** charge x pct / 100 in pence, halves rounded to the even penny. */
function depositFor(charge: number, pct: number): number {
  const scaled = charge * pct;
  const whole = Math.floor(scaled / 100);
  const remainder = scaled % 100;
  return remainder > 50 || (remainder === 50 && whole % 2 === 1) ? whole + 1 : whole;
}

const available = (item: Equipment): number => item.total - item.out;

/** Deposit in pence and the percentage to show for a booking. */
function bookingDeposit(b: Booking): { deposit: number; pct: number } {
  if ((b.status === "On Hire" || b.status === "Returned") && b.deposit !== null && b.depositPct !== null) {
    return { deposit: b.deposit, pct: b.depositPct };
  }
  return { deposit: depositFor(b.charge, settings.depositPct), pct: settings.depositPct };
}

function newBooking(customer: number, item: number, qty: number, start: Date, end: Date, user: string, notes = ""): Booking {
  const line = must(equipment.get(item));
  const days = hireDays(start, end);
  const ref = `B-${nextReference++}`;
  const booking: Booking = {
    ref, customer, equipment: item, qty, start, end, days, rate: line.rate, ...price(line.rate, qty, days),
    deposit: null, depositPct: null, status: "Draft", createdBy: user, notes,
    history: [`Created as Draft by ${userName(user)}`],
  };
  bookings.set(ref, booking);
  return booking;
}

/** Confirm a reservation. Returns an error message when there is not enough stock. */
function reserve(b: Booking, user: string): string | null {
  const line = must(equipment.get(b.equipment));
  if (b.qty > available(line)) {
    return `Only ${available(line)} unit(s) of ${line.name} are available; the booking remains a Draft.`;
  }
  line.out += b.qty;
  b.depositPct = settings.depositPct;
  b.deposit = depositFor(b.charge, b.depositPct);
  b.status = "Reserved";
  b.history.push(`Reserved by ${userName(user)}`);
  return null;
}

function checkOut(b: Booking, user: string): void {
  b.status = "On Hire";
  b.history.push(`Checked out by ${userName(user)}`);
}

function giveBack(b: Booking, user: string): void {
  must(equipment.get(b.equipment)).out -= b.qty;
  b.status = "Returned";
  b.history.push(`Returned, received by ${userName(user)}`);
}

function cancel(b: Booking, user: string): void {
  b.status = "Cancelled";
  b.history.push(`Cancelled by ${userName(user)}`);
}

function seed(): void {
  settings.depositPct = 20;
  settings.maxDays = 28;
  equipment.clear();
  customers.clear();
  bookings.clear();
  nextReference = 1001;
  const lines: [string, number, number][] = [
    ["Cement mixer 140L", 2800, 4], ["Scaffold tower 5m", 4500, 3], ["Floor sander", 3600, 2],
    ["Pressure washer", 2200, 5], ["Mini digger 1.5t", 12000, 1], ["Generator 3kVA", 3200, 6],
  ];
  lines.forEach(([name, rate, total], i) => equipment.set(i + 1, { id: i + 1, name, rate, total, out: 0 }));
  const accounts: [string, string, boolean][] = [
    ["Hartley Builders Ltd", "01632 960101", false], ["Greenway Landscapes", "01632 960144", false],
    ["Mrs J. Whitcombe", "01632 960172", false], ["Sutton & Daughters Roofing", "01632 960190", false],
    ["Kestrel Property Services", "01632 960123", true],
  ];
  accounts.forEach(([name, phone, hold], i) => customers.set(i + 1, { id: i + 1, name, phone, hold }));

  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const d = (offset: number): Date => new Date(today + offset * DAY_MS);
  let b = newBooking(1, 1, 1, d(-12), d(-9), "tom");
  reserve(b, "tom"); checkOut(b, "tom"); giveBack(b, "priya");
  b = newBooking(2, 2, 2, d(-2), d(8), "priya");
  reserve(b, "priya"); checkOut(b, "priya");
  b = newBooking(3, 3, 1, d(3), d(5), "tom");
  reserve(b, "tom");
  b = newBooking(1, 4, 2, d(1), d(4), "tom");
  cancel(b, "tom");
  newBooking(4, 5, 1, d(6), d(9), "priya", "Customer to confirm site access");
  b = newBooking(2, 4, 1, d(2), d(4), "tom");
  reserve(b, "maria");
}

// ---------------------------------------------------------------- rendering
const CSS = `body{font-family:Segoe UI,Arial,sans-serif;margin:0;color:#1d2733;background:#f4f5f7}
header{background:#1f3a5f;color:#fff;padding:.6rem 1.2rem;display:flex;gap:1rem;align-items:center;flex-wrap:wrap}
header .brand{font-weight:700;font-size:1.15rem;margin-right:1rem}header a{color:#fff}
nav ul{list-style:none;display:flex;gap:1rem;margin:0;padding:0}.who{margin-left:auto;display:flex;gap:.8rem;align-items:center}
main{max-width:1000px;margin:1rem auto;padding:1rem 1.4rem;background:#fff;border:1px solid #d9dde3}
table{border-collapse:collapse;width:100%;margin:.6rem 0}th,td{border:1px solid #d0d5dc;padding:.35rem .6rem;text-align:left}
th{background:#eef1f5}td.num,th.num{text-align:right}form.inline{display:inline}
label{display:block;margin:.6rem 0 .15rem;font-weight:600}input,select,textarea{padding:.3rem;font:inherit}
button{padding:.35rem .8rem;font:inherit;cursor:pointer}.actions{margin:1rem 0;display:flex;gap:.6rem;flex-wrap:wrap;align-items:center}
.msg{padding:.6rem .8rem;margin:.6rem 0;border:1px solid}.error{background:#fdecea;border-color:#d9534f}
.ok{background:#e8f5e9;border-color:#4caf50}dl{display:grid;grid-template-columns:14rem 1fr;gap:.3rem .8rem}dt{font-weight:600}dd{margin:0}
footer{max-width:1000px;margin:0 auto 2rem;color:#566;font-size:.85rem;padding:0 1.4rem}`;

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

function layout(session: Session, title: string, body: string): string {
  const user = session.user ? USERS[session.user] : undefined;
  let flash = "";
  if (session.flash) {
    const [kind, text] = session.flash;
    delete session.flash;
    const role = kind === "error" ? "alert" : "status";
    flash = `<div class="msg ${kind === "error" ? "error" : "ok"}" role="${role}">${escapeHtml(text)}</div>`;
  }
  let head = `<span class="brand">${PRODUCT}</span>`;
  if (user) {
    const links: [string, string][] = [["/", "Dashboard"], ["/bookings", "Bookings"], ["/inventory", "Inventory"], ["/customers", "Customers"]];
    if (user.role === "Manager") links.push(["/settings", "Settings"]);
    head += `<nav aria-label="Main"><ul>${links.map(([href, text]) => `<li><a href="${href}">${text}</a></li>`).join("")}</ul></nav>`;
    head +=
      `<div class="who"><span>Signed in as <strong>${escapeHtml(user.name)}</strong> (${user.role})</span>` +
      '<form class="inline" method="post" action="/logout"><button type="submit">Sign out</button></form></div>';
  }
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)} - ${PRODUCT}</title><style>${CSS}</style></head>` +
    `<body><header>${head}</header><main><h1>${escapeHtml(title)}</h1>${flash}${body}</main>` +
    `<footer><p>${PRODUCT} version ${VERSION}</p></footer></body></html>`
  );
}

function breakdown(b: Booking): string {
  const { deposit, pct } = bookingDeposit(b);
  let depositLabel = `Deposit (${pct}%)`;
  let depositValue = money(deposit);
  if (b.status === "Draft") depositLabel = `Deposit (${pct}%, estimate)`;
  else if (b.status === "Cancelled") {
    depositLabel = "Deposit";
    depositValue = "Not applicable";
  }
  const rows: [string, string | number][] = [
    ["Reference", b.ref], ["Status", b.status],
    ["Customer", escapeHtml(must(customers.get(b.customer)).name)],
    ["Equipment", escapeHtml(must(equipment.get(b.equipment)).name)],
    ["Quantity", b.qty], ["Start date", isoDate(b.start)], ["End date", isoDate(b.end)],
    ["Chargeable days", b.days], ["Daily rate (per unit)", money(b.rate)],
    ["Gross hire", money(b.gross)], ["Weekly discount", b.discount ? `-${money(b.discount)}` : "None"],
    ["Hire charge", money(b.charge)], [depositLabel, depositValue],
    ["Created by", escapeHtml(userName(b.createdBy))], ["Notes", escapeHtml(b.notes) || "-"],
  ];
  return `<dl>${rows.map(([term, value]) => `<dt>${term}</dt><dd>${value}</dd>`).join("")}</dl>`;
}

function postButton(action: string, label: string): string {
  return `<form class="inline" method="post" action="${action}"><button type="submit">${label}</button></form>`;
}

function pageLogin(session: Session, username = ""): string {
  const body =
    '<form method="post" action="/login"><label for="username">Username</label>' +
    `<input id="username" name="username" value="${escapeHtml(username)}" autocomplete="username" required>` +
    '<label for="password">Password</label>' +
    '<input id="password" name="password" type="password" autocomplete="current-password" required>' +
    '<div class="actions"><button type="submit">Sign in</button></div></form>';
  return layout(session, "Sign in", body);
}

function pageDashboard(session: Session): string {
  const counts = new Map<Status, number>(STATUSES.map((s) => [s, 0]));
  let value = 0;
  for (const b of bookings.values()) {
    counts.set(b.status, (counts.get(b.status) ?? 0) + 1);
    if (b.status !== "Draft") value += b.charge;
  }
  const units = [...equipment.values()].reduce((sum, e) => sum + e.out, 0);
  const rows = STATUSES.map((s) => `<tr><th scope="row">${s}</th><td class="num">${counts.get(s)}</td></tr>`).join("");
  const body =
    '<h2>Bookings by status</h2><table aria-label="Bookings by status"><thead><tr><th scope="col">Status</th>' +
    `<th scope="col" class="num">Bookings</th></tr></thead><tbody>${rows}</tbody></table>` +
    `<h2>Key figures</h2><dl><dt>Booked hire value</dt><dd id="booked-value">${money(value)}</dd>` +
    `<dt>Units reserved or on hire</dt><dd id="units-out">${units}</dd>` +
    `<dt>Current deposit rate</dt><dd>${settings.depositPct}%</dd></dl>` +
    '<div class="actions"><a href="/bookings/new">New booking</a></div>';
  return layout(session, "Dashboard", body);
}

function pageBookings(session: Session, status: string): string {
  const options =
    '<option value="">All</option>' +
    STATUSES.map((s) => `<option${s === status ? " selected" : ""}>${s}</option>`).join("");
  let rows = [...bookings.values()]
    .sort((a, b) => (a.ref < b.ref ? 1 : -1))
    .filter((b) => !status || b.status === status)
    .map(
      (b) =>
        `<tr><td><a href="/bookings/${b.ref}">${b.ref}</a></td><td>${escapeHtml(must(customers.get(b.customer)).name)}</td>` +
        `<td>${escapeHtml(must(equipment.get(b.equipment)).name)}</td><td class="num">${b.qty}</td>` +
        `<td>${isoDate(b.start)}</td><td>${isoDate(b.end)}</td><td class="num">${money(b.charge)}</td><td>${b.status}</td></tr>`,
    )
    .join("");
  if (!rows) rows = '<tr><td colspan="8">No bookings found.</td></tr>';
  const body =
    '<div class="actions"><a href="/bookings/new">New booking</a>' +
    '<form class="inline" method="get" action="/bookings"><label for="status" style="display:inline">Status</label> ' +
    `<select id="status" name="status">${options}</select> <button type="submit">Filter</button></form></div>` +
    '<table aria-label="Bookings"><thead><tr><th scope="col">Reference</th><th scope="col">Customer</th>' +
    '<th scope="col">Equipment</th><th scope="col" class="num">Qty</th><th scope="col">Start</th>' +
    '<th scope="col">End</th><th scope="col" class="num">Hire charge</th><th scope="col">Status</th></tr></thead>' +
    `<tbody>${rows}</tbody></table>`;
  return layout(session, "Bookings", body);
}

function pageNewBooking(session: Session, form: Form = {}, error?: string): string {
  if (error) session.flash = ["error", error];
  const selected = (field: string, id: number): string => (form[field] === String(id) ? " selected" : "");
  const customerOptions =
    '<option value="">Select a customer</option>' +
    [...customers.values()]
      .map((c) => `<option value="${c.id}"${selected("customer", c.id)}>${escapeHtml(c.name)}${c.hold ? " (on hold)" : ""}</option>`)
      .join("");
  const equipmentOptions =
    '<option value="">Select equipment</option>' +
    [...equipment.values()]
      .map((e) => `<option value="${e.id}"${selected("equipment", e.id)}>${escapeHtml(e.name)} - ${money(e.rate)} per day</option>`)
      .join("");
  const body =
    '<form method="post" action="/bookings/new">' +
    `<label for="customer">Customer</label><select id="customer" name="customer">${customerOptions}</select>` +
    `<label for="equipment">Equipment</label><select id="equipment" name="equipment">${equipmentOptions}</select>` +
    `<label for="qty">Quantity</label><input id="qty" name="qty" type="number" min="1" value="${escapeHtml(form.qty ?? "1")}">` +
    `<label for="start">Start date</label><input id="start" name="start" type="date" value="${escapeHtml(form.start ?? "")}">` +
    `<label for="end">End date</label><input id="end" name="end" type="date" value="${escapeHtml(form.end ?? "")}">` +
    `<label for="notes">Notes</label><textarea id="notes" name="notes" rows="2" cols="50">${escapeHtml(form.notes ?? "")}</textarea>` +
    '<div class="actions"><button type="submit">Continue to review</button><a href="/bookings">Back to bookings</a></div></form>';
  return layout(session, "New booking", body);
}

function pageReview(session: Session, b: Booking): string {
  const line = must(equipment.get(b.equipment));
  const body =
    "<p>Check the details below with the customer. The booking is saved as a Draft until the reservation is confirmed.</p>" +
    `${breakdown(b)}<p>Currently available: ${available(line)} of ${line.total} unit(s) of ${escapeHtml(line.name)}.</p>` +
    `<div class="actions">${postButton(`/bookings/${b.ref}/confirm`, "Confirm reservation")}` +
    `${postButton(`/bookings/${b.ref}/cancel`, "Cancel booking")}<a href="/bookings">Back to bookings</a></div>`;
  return layout(session, `Review booking ${b.ref}`, body);
}

function pageBooking(session: Session, b: Booking, role: Role): string {
  const base = `/bookings/${b.ref}`;
  let actions = "";
  if (b.status === "Draft") {
    actions += `<a href="${base}/review">Review and confirm</a>${postButton(`${base}/cancel`, "Cancel booking")}`;
  } else if (b.status === "Reserved") {
    actions += postButton(`${base}/checkout`, "Check out");
    if (role === "Manager") actions += postButton(`${base}/cancel`, "Cancel booking");
  } else if (b.status === "On Hire") {
    actions += postButton(`${base}/return`, "Record return");
  }
  const history = b.history.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("");
  const body =
    `${breakdown(b)}<div class="actions">${actions}<a href="/bookings">Back to bookings</a></div>` +
    `<h2>History</h2><ol>${history}</ol>`;
  return layout(session, `Booking ${b.ref}`, body);
}

function pageInventory(session: Session, role: Role): string {
  const manager = role === "Manager";
  const rows = [...equipment.values()]
    .map((e) => {
      const edit = manager
        ? `<td><form class="inline" method="post" action="/inventory/${e.id}/rate">` +
          `<label for="rate${e.id}" style="display:inline;font-weight:400">New daily rate for ${escapeHtml(e.name)}</label> ` +
          `<input id="rate${e.id}" name="rate" size="6" value="${(e.rate / 100).toFixed(2)}"> <button type="submit">Update rate</button></form></td>`
        : "";
      return (
        `<tr><th scope="row">${escapeHtml(e.name)}</th><td class="num">${money(e.rate)}</td><td class="num">${e.total}</td>` +
        `<td class="num">${e.out}</td><td class="num">${available(e)}</td>${edit}</tr>`
      );
    })
    .join("");
  const body =
    '<table aria-label="Equipment"><thead><tr><th scope="col">Equipment</th><th scope="col" class="num">Daily rate</th>' +
    '<th scope="col" class="num">Total stock</th><th scope="col" class="num">Reserved / on hire</th>' +
    `<th scope="col" class="num">Available</th>${manager ? '<th scope="col">Change rate</th>' : ""}</tr></thead>` +
    `<tbody>${rows}</tbody></table>`;
  return layout(session, "Inventory", body);
}

const OPEN_STATUSES: readonly Status[] = ["Draft", "Reserved", "On Hire"];

function pageCustomers(session: Session, role: Role): string {
  const rows = [...customers.values()]
    .map((c) => {
      const open = [...bookings.values()].filter((b) => b.customer === c.id && OPEN_STATUSES.includes(b.status)).length;
      let action = "";
      if (c.hold) action = postButton(`/customers/${c.id}/release`, `Release hold on ${escapeHtml(c.name)}`);
      else if (role === "Manager") action = postButton(`/customers/${c.id}/hold`, `Place hold on ${escapeHtml(c.name)}`);
      return (
        `<tr><th scope="row">${escapeHtml(c.name)}</th><td>${c.phone}</td><td>${c.hold ? "On hold" : "Active"}</td>` +
        `<td class="num">${open}</td><td>${action}</td></tr>`
      );
    })
    .join("");
  const body =
    '<table aria-label="Customers"><thead><tr><th scope="col">Customer</th><th scope="col">Phone</th>' +
    '<th scope="col">Account status</th><th scope="col" class="num">Open bookings</th><th scope="col">Actions</th></tr></thead>' +
    `<tbody>${rows}</tbody></table>`;
  return layout(session, "Customers", body);
}

function pageSettings(session: Session): string {
  const body =
    '<form method="post" action="/settings"><label for="deposit_pct">Deposit rate (%)</label>' +
    `<input id="deposit_pct" name="deposit_pct" type="number" min="0" max="100" value="${settings.depositPct}">` +
    '<label for="max_days">Maximum hire length (days)</label>' +
    `<input id="max_days" name="max_days" type="number" min="1" max="365" value="${settings.maxDays}">` +
    '<div class="actions"><button type="submit">Save settings</button></div></form>';
  return layout(session, "Settings", body);
}

// ---------------------------------------------------------------- validation
const WHOLE_NUMBER = /^\d+$/;

function parseDate(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

type BookingValues = { customer: number; equipment: number; qty: number; start: Date; end: Date };

function validateBooking(form: Form): { error: string } | { values: BookingValues } {
  const customer = WHOLE_NUMBER.test(form.customer ?? "") ? customers.get(Number(form.customer)) : undefined;
  const line = WHOLE_NUMBER.test(form.equipment ?? "") ? equipment.get(Number(form.equipment)) : undefined;
  if (!customer) return { error: "Select a customer." };
  if (!line) return { error: "Select the equipment to hire." };
  if (!WHOLE_NUMBER.test(form.qty ?? "") || Number(form.qty) < 1) {
    return { error: "Quantity must be a whole number of 1 or more." };
  }
  const start = parseDate(form.start ?? "");
  const end = parseDate(form.end ?? "");
  if (!start || !end) return { error: "Enter a valid start date and end date." };
  if (end < start) return { error: "The end date cannot be before the start date." };
  if (hireDays(start, end) > settings.maxDays) {
    return { error: `The hire is longer than the maximum of ${settings.maxDays} days.` };
  }
  if (customer.hold) return { error: `${customer.name} is on hold. New bookings cannot be created for this customer.` };
  return { values: { customer: customer.id, equipment: line.id, qty: Number(form.qty), start, end } };
}

// ---------------------------------------------------------------- HTTP layer
/** One request: knows its session and how to answer. */
class Exchange {
  readonly session: Session;
  private newSessionId: string | null = null;

  constructor(
    readonly req: IncomingMessage,
    private readonly res: ServerResponse,
  ) {
    const cookie = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
    let session = cookie ? sessions.get(cookie) : undefined;
    if (!session) {
      this.newSessionId = randomBytes(16).toString("hex");
      session = { user: null };
      sessions.set(this.newSessionId, session);
    }
    this.session = session;
  }

  private cookieHeader(): Record<string, string> {
    return this.newSessionId ? { "Set-Cookie": `sid=${this.newSessionId}; Path=/; HttpOnly; SameSite=Lax` } : {};
  }

  send(body: string, status = 200): void {
    const bytes = Buffer.from(body, "utf8");
    this.res.writeHead(status, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": bytes.length,
      "Cache-Control": "no-store",
      ...this.cookieHeader(),
    });
    this.res.end(bytes);
  }

  redirect(to: string, flash?: Flash): void {
    if (flash) this.session.flash = flash;
    this.res.writeHead(303, { Location: to, "Content-Length": 0, ...this.cookieHeader() });
    this.res.end();
  }

  denied(): void {
    this.session.flash = ["error", "You do not have permission to do that."];
    this.send(layout(this.session, "Access denied", '<p><a href="/">Return to the dashboard</a></p>'), 403);
  }

  notFound(): void {
    this.send(layout(this.session, "Page not found", '<p><a href="/">Return to the dashboard</a></p>'), 404);
  }
}

function handleGet(x: Exchange, path: string, query: URLSearchParams): void {
  const { session } = x;
  if (path === "/login") return session.user ? x.redirect("/") : x.send(pageLogin(session));
  if (!session.user) return x.redirect("/login");
  const role = must(USERS[session.user]).role;
  if (path === "/") return x.send(pageDashboard(session));
  if (path === "/bookings") {
    const status = query.get("status") ?? "";
    return x.send(pageBookings(session, (STATUSES as readonly string[]).includes(status) ? status : ""));
  }
  if (path === "/bookings/new") return x.send(pageNewBooking(session));
  if (path === "/inventory") return x.send(pageInventory(session, role));
  if (path === "/customers") return x.send(pageCustomers(session, role));
  if (path === "/settings") return role === "Manager" ? x.send(pageSettings(session)) : x.denied();
  const match = /^\/bookings\/(B-\d+)(\/review)?$/.exec(path);
  const booking = match?.[1] ? bookings.get(match[1]) : undefined;
  if (booking) {
    if (match?.[2]) {
      return booking.status === "Draft" ? x.send(pageReview(session, booking)) : x.redirect(`/bookings/${booking.ref}`);
    }
    return x.send(pageBooking(session, booking, role));
  }
  x.notFound();
}

function handleBookingAction(x: Exchange, b: Booking, action: string, username: string, role: Role): void {
  const here = `/bookings/${b.ref}`;
  const wrong: Flash = ["error", `That action is not available for a booking with status ${b.status}.`];
  switch (action) {
    case "confirm": {
      if (b.status !== "Draft") return x.redirect(here, wrong);
      const error = reserve(b, username);
      return error ? x.redirect(`${here}/review`, ["error", error]) : x.redirect(here, ["ok", `Booking ${b.ref} is now Reserved.`]);
    }
    case "checkout":
      if (b.status !== "Reserved") return x.redirect(here, wrong);
      checkOut(b, username);
      return x.redirect(here, ["ok", `Booking ${b.ref} checked out. Equipment is On Hire.`]);
    case "return":
      if (b.status !== "On Hire") return x.redirect(here, wrong);
      giveBack(b, username);
      return x.redirect(here, ["ok", `Return recorded for booking ${b.ref}.`]);
    default:
      if (b.status !== "Draft" && b.status !== "Reserved") return x.redirect(here, wrong);
      if (b.status === "Reserved" && role !== "Manager") return x.denied();
      cancel(b, username);
      return x.redirect(here, ["ok", `Booking ${b.ref} has been cancelled.`]);
  }
}

function handlePost(x: Exchange, path: string, form: Form): void {
  const { session } = x;
  if (path === "/login") {
    const username = (form.username ?? "").toLowerCase();
    const user = USERS[username];
    if (user && user.password === (form.password ?? "")) {
      session.user = username;
      return x.redirect("/", ["ok", `Welcome, ${user.name}.`]);
    }
    session.flash = ["error", "The username or password is incorrect."];
    return x.send(pageLogin(session, form.username ?? ""), 401);
  }
  if (!session.user) return x.redirect("/login");
  const username = session.user;
  const role = must(USERS[username]).role;

  if (path === "/logout") {
    session.user = null;
    return x.redirect("/login", ["ok", "You have signed out."]);
  }
  if (path === "/bookings/new") {
    const outcome = validateBooking(form);
    if ("error" in outcome) return x.send(pageNewBooking(session, form, outcome.error), 400);
    const v = outcome.values;
    const b = newBooking(v.customer, v.equipment, v.qty, v.start, v.end, username, (form.notes ?? "").slice(0, 200));
    return x.redirect(`/bookings/${b.ref}/review`, ["ok", `Draft booking ${b.ref} saved.`]);
  }
  if (path === "/settings") {
    if (role !== "Manager") return x.denied();
    const deposit = form.deposit_pct ?? "";
    const maxDays = form.max_days ?? "";
    if (!WHOLE_NUMBER.test(deposit) || Number(deposit) > 100) {
      return x.redirect("/settings", ["error", "Deposit rate must be a whole number from 0 to 100."]);
    }
    if (!WHOLE_NUMBER.test(maxDays) || Number(maxDays) < 1 || Number(maxDays) > 365) {
      return x.redirect("/settings", ["error", "Maximum hire length must be a whole number from 1 to 365."]);
    }
    settings.depositPct = Number(deposit);
    settings.maxDays = Number(maxDays);
    return x.redirect("/settings", ["ok", "Settings saved."]);
  }

  let match = /^\/inventory\/(\d+)\/rate$/.exec(path);
  const line = match ? equipment.get(Number(match[1])) : undefined;
  if (line) {
    if (role !== "Manager") return x.denied();
    const rate = form.rate ?? "";
    if (!/^\d{1,5}(\.\d{1,2})?$/.test(rate) || Number(rate) <= 0) {
      return x.redirect("/inventory", ["error", "Enter a daily rate greater than zero, for example 28.50."]);
    }
    line.rate = Math.round(Number(rate) * 100);
    return x.redirect("/inventory", ["ok", `Daily rate for ${line.name} updated.`]);
  }

  match = /^\/customers\/(\d+)\/(hold|release)$/.exec(path);
  const customer = match ? customers.get(Number(match[1])) : undefined;
  if (customer) {
    if (match?.[2] === "hold") {
      if (role !== "Manager") return x.denied();
      customer.hold = true;
      return x.redirect("/customers", ["ok", `${customer.name} is now on hold.`]);
    }
    customer.hold = false;
    return x.redirect("/customers", ["ok", `Hold released for ${customer.name}.`]);
  }

  match = /^\/bookings\/(B-\d+)\/(confirm|checkout|return|cancel)$/.exec(path);
  const booking = match?.[1] ? bookings.get(match[1]) : undefined;
  if (booking && match?.[2]) return handleBookingAction(x, booking, match[2], username, role);
  x.notFound();
}

async function readForm(req: IncomingMessage): Promise<Form> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const form: Form = {};
  for (const [key, value] of new URLSearchParams(Buffer.concat(chunks).toString("utf8"))) {
    if (!(key in form)) form[key] = value.trim();
  }
  return form;
}

function main(): void {
  const port = Number(process.argv[2] ?? 8791);
  seed();
  const server = createServer((req, res) => {
    void (async () => {
      const exchange = new Exchange(req, res);
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method === "POST") {
        handlePost(exchange, url.pathname.replace(/\/+$/, ""), await readForm(req));
      } else {
        handleGet(exchange, url.pathname.replace(/\/+$/, "") || "/", url.searchParams);
      }
    })().catch((error: unknown) => {
      console.error(error);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`${PRODUCT} ${VERSION} running at http://127.0.0.1:${port}/ (Ctrl+C to stop)`);
  });
}

main();
