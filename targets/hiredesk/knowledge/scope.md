# Scope and business purpose: hiredesk

Reusable understanding. Run-specific observations are in runs/.

## Business purpose
Tallyard HireDesk is the counter application of a tool and plant hire depot: staff take hire bookings,
hand equipment out, receive it back, and rely on the availability figure for each equipment line
(FSD section 1). What going wrong costs: double-booking or phantom unavailability (objective 1),
wrong prices or deposits (2), trading with customers on hold (3), a misleading dashboard (4).

## Environment and access
- Start URL: http://127.0.0.1:8791/ (local fixture, started with `npm run fixture:hiredesk`; a restart re-seeds all data).
- Version shown at: page footer ("Tallyard HireDesk version 1.4.2" in run-20261115-001540).
- Roles: Manager (maria), Clerk (tom, priya). The accounts are documented in `fixtures/acceptance-app/docs/test-accounts.md`; the tools read `.local/accounts.yaml` (keys `manager`, `clerk`, `clerk2`). Sign-in form at /login.
- Identity is confirmed from the header: "Signed in as <name> (<role>)". Sign out is a header button; it lands on the sign-in page with "You have signed out."

## Permitted actions and constraints
- Local, single-user, in-memory data: data-changing tests are allowed. No delete or reset controls were seen.
- The investigator must not read `fixtures/acceptance-app/app.ts` or `SEALED/` (blind acceptance fixture).
- No confirmation step was observed on cancel, check out, record return, hold or release: each takes effect on the first click. (An earlier note here claimed native confirm dialogs; that was an assumption and was wrong.)
- In Git Bash, pass relative paths to `browser.ts open --url` without a leading slash (`settings`, not `/settings`).

## In scope / out of scope
In scope: all four modules and both roles. Not attempted: concurrent users (deferred), and requests that cannot be sent through visible controls.

## Change log
- 2026-11-15 · tools and the fixture were ported from Python to TypeScript; the fixture answers identically (130 requests compared) · run-20261115-005911
- 2026-11-15 · target created for the acceptance check of the workspace · run-20261115-001540
