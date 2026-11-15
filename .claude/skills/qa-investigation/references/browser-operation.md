# Browser operation

Run the tools from the repository root with `npx tsx`; every command also needs `--target <id>`.

## How the tool works

`browser.ts launch` starts one Chromium with a remote-debugging port and a per-target profile kept
outside the repository. Every later command attaches to that browser, works in its one tab, and
disconnects, so page state, cookies and sign-in persist between commands. Console errors, failed
requests and native dialogs are captured for the duration of each command, so they are attributed to
the action that caused them.

`browser.ts attach --cdp http://127.0.0.1:9222` uses a browser the tester started themselves with
`--remote-debugging-port=9222` and already signed in to. `close` never closes an attached browser.

## Reading an observation

`open` and `act` print an observation; `observe` prints one without acting (free). It contains the
URL and title, header and footer text (usually the signed-in user and the version), headings,
`ALERT/STATUS` messages, open dialogs, fields with value and constraints, tables with rows, the
interactive elements with a ref (`e1`, `e2`, ...), the main text, and any console or HTTP errors. The
full observation (including the accessibility snapshot) is saved under `runs/<run>/observations/`
and a screenshot under `runs/<run>/evidence/`. Use those paths as `--evidence`.

`browser.ts text` prints the full visible text when the summary is truncated.
`browser.ts shot --label ...` takes an extra screenshot (`--full-page` for long pages).
`browser.ts eval --js "..."` reads something the observation does not show (an attribute, a computed
value). It is for reading only; anything that acts must go through `act`.

## Locators

In order of preference:

1. `--ref e12` from the latest observation. Refs are only valid for that observation; after the page
   changes, observe again.
2. `--role button --name "Save"` (exact accessible name; `--loose` for substring, `--nth 1` for the
   second match).
3. `--field "Label"` for form fields by label.
4. `--text "visible text"` as a last resort.

Examples:

```
npx tsx tools/browser.ts act fill   --target T --field "Username" --value "j.tan"
npx tsx tools/browser.ts act fill   --target T --field "Password" --secret clerk.password
npx tsx tools/browser.ts act click  --target T --role button --name "Sign in" --label signed-in-as-clerk
npx tsx tools/browser.ts act select --target T --ref e14 --value "Approved"
npx tsx tools/browser.ts act press  --target T --key Escape
npx tsx tools/browser.ts act click  --target T --ref e9 --dialog accept --why "confirm cancellation"
npx tsx tools/browser.ts act reload --target T
```

`--secret role.field` reads `targets/<id>/.local/accounts.yaml`; the value is never printed or
logged. `--why` is kept in the action log. `--label` names the screenshot.

## One step, then read

After a step fails or is refused, the next `act` is refused until you `observe` (free). This is
deliberate: commands chained in one shell line keep running after a failure, clicking on a page
that is not in the state you assumed, and each costs budget. Chain only steps that cannot depend on
each other's outcome (filling several fields of one form), never a step after one that can fail or
navigate. Never put a `records.ts test-result` in the same line as the check it rests on.

## Embedded frames

Payment forms, sign-in widgets and maps are often pages inside the page. An observation lists them
as `EMBEDDED FRAME "<title | name | origin>"` and does not include their contents.

```
npx tsx tools/browser.ts frame --target T                      # which frames are on the page
npx tsx tools/browser.ts frame --target T --match payment      # that frame's controls and text (free)
npx tsx tools/browser.ts act click --target T --frame payment --role button --name "Continue"
```

`--frame` takes part of the frame's title, name or address and works with `--role`, `--field` and
`--text` (refs belong to the page itself). After a frame action the tool prints the frame's text,
because the page observation would show no change. The frame's origin does not need to be in
`allowed_origins`; a page the flow *navigates* to does, if you need to read it.

## Phone and tablet widths

`browser.ts viewport --target T --width 375` (height 812 by default) emulates a page width from the
next step on; reload so the layout settles, then observe and take screenshots as usual.
`viewport --reset` ends it. It changes the layout width only: no touch input and no device user
agent, so a site that switches on the device rather than the width needs a real device or the
user's own check. Tablet: `--width 768 --height 1024`.

## Keyboard walks

`act press --key Tab` prints `focus:` with the control that now has focus and whether focus is
visibly marked, including inside embedded frames. Moving focus counts as a change, so a walk is not
stopped by the repeat limit. A built-in date or time field takes one Tab per part (day, month,
year) while the focus line stays the same; three such presses in a row hit the repeat limit, so
fill that field and continue from the next one.

## What screenshots cannot show

The opened list of a built-in select, built-in date and time pickers, file choosers and `alert`
boxes are drawn by the browser outside the page: no tool screenshot contains them, headless or
visible. Read what the control is with `eval`, then look in a visible browser or ask the user for a
screenshot of the open control, copy it into the run's `evidence/` folder with a name that says it
is user-supplied, and say so in the result. See design-review.md.

If a screenshot fails while the page still responds, the observation says so and its JSON file is
valid evidence. If it keeps failing, `close` and `launch --headless`.

## The destructive-word guard

`act` refuses controls whose name contains a word such as delete, remove or reset unless the target
permits destructive actions. The guard reads only the name, so it also stops harmless controls: an
answer option "Remove my old one first", a "Remove filter" chip. For those, add the control's name
to `permissions.destructive_allow` in `target.yaml` and note the reason in `knowledge/scope.md`.
That is the tester's call. Turning on `permissions.destructive` for the whole target is for
controls that really destroy data, and is the user's decision.

Native `confirm()`/`alert()` dialogs are dismissed by default (configurable); pass `--dialog accept`
on the action that should confirm. The dialog text appears in the observation.

## Navigation

Open the start URL, then use the application's own controls. Typed addresses are limited to the
start URL unless you pass `--reason`, which is for tests where the address is the point (another
user's record, a page the role has no link to). The field lesson behind this: new tabs and typed
addresses were what a live site stopped answering during a real event; clicking in one tab kept
working.

## Changing role

1. Sign out with the application's control.
2. Observe: confirm the signed-out state (sign-in form shown, no user name in the header).
3. Sign in as the next user (`--secret` for the password).
4. Observe: confirm the name and role the page shows.
5. `npx tsx tools/records.ts role --target T --role <name> --verified-by "<what the page shows>"`.

Every later action, observation, result and finding is stamped with that role. If the application
has no sign-out control, record that as a finding candidate and ask the user how to switch.

## Budget

`open` and `act` cost one action each, including failed ones. `observe`, `text`, `shot`, `eval`,
`frame`, `viewport` and `diagnose` are free. The remaining budget is printed after each action. Inside the reporting
reserve, finish the test in hand, then checkpoint and report. `--over-budget` exists to finish
evidence for a test already under way; note its use.

## Stalls

When an action or page load times out, the tool prints a `STALL [kind]` block with the URL, a
screenshot if one could be taken, the last action, and probes:

| Kind | Meaning | What to do |
|---|---|---|
| `automation-wait` | Site and page respond; the tool waited for something not there, hidden, covered or disabled | Observe; pick the locator from what is visible; check for an open dialog covering the page |
| `application-loading` | The page shows its own loading indicator | Observe once more. A loader that never ends is an observation about the product |
| `one-request-slow` | A background request is slow; the page works | Observe and continue |
| `navigation-stuck` | Site answers but this load hung; it has been stopped | Continue by clicking links; avoid typed addresses |
| `site-holding-session` | Site answers others, not this session | Stop the request that triggered it; slow down; click-only |
| `site-unreachable` | Site answers nobody | Environment issue: wait once, retry once, then blocker |
| `browser-frozen` | The tab does not respond | `close`, `launch`; if attached, ask the tester |

The tool counts consecutive stalls and declares a **blocker** after `recovery.max_attempts`
(default 2). It also refuses an identical action repeated `recovery.repeat_limit` times with no
visible change. At a blocker: record the test as `blocked`, `env-issue` or `automation-error`,
`checkpoint` with the blocker text, `run-end`, report. A successful action resets the stall count.

`browser.ts diagnose` runs the same probes on demand.

## Configuration

`tools/defaults.yaml`, overridden per target in `target.yaml`: headless or visible, viewport, one-tab
behaviour, timeouts, dialog policy, direct-navigation policy, recovery limits, budget, permissions.

## Shell notes (Windows)

- PowerShell: a double quote inside an argument splits it. Write values without inner double
  quotes, or use single-quoted strings. Pass several `--evidence` paths as separate arguments.
- Git Bash: a leading `/` in an argument is rewritten into a Windows path; heredocs containing
  apostrophes fail. Use the file tools to write files.

## Steps taken outside the tool

When a step cannot be done with this tool and is done elsewhere (the user's own browser, another
browser the session can drive, a screenshot the user sends), it leaves no logged action. Record it
with `records.ts note --kind limitation` saying what was done where, copy any image into the run's
`evidence/` folder, and in the test result say which part was seen outside the tool. Results that
rest only on such steps are `inconclusive` or `not-run`, with the note as their trace.

## Fallback without this tool

If Playwright cannot run in the environment but the session has its own browser tools, the same
procedure applies: act one step at a time, save screenshots into `runs/<run>/evidence/`, and log
steps with `records.ts note`. The tool's logged-activity check will then refuse executed verdicts,
so say in the report that the run used the fallback and record such tests as `inconclusive` with the
evidence attached, or get Playwright working. Do not bypass the check.
