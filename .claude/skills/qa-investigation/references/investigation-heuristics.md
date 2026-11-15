# Investigation heuristics

Prompts for exploring and for designing tests. Use the ones that apply to this application and say
why; skip the rest. Provenance: the tester's own method, plus the layered effect tests and risk
factors of the earlier `qa-pipeline` helper.

## Questions to carry through every screen

| Question | What it leads to |
|---|---|
| What is this feature trying to achieve, and for whom? | The real acceptance criterion, beyond "it saved" |
| What depends on this setting or record? | Consumers: other screens, totals, reports, other roles |
| What changes elsewhere when I change it? | Cross-module tests |
| What happens to records created before the change? | Retroactivity: is old data recalculated, frozen, or broken? |
| Do different roles see consistent results? | Same record, another role: visibility, figures, offered actions |
| What if the actions happen in a different order? | Sequence tests: approve before complete, pay before confirm |
| What after cancel, interruption, retry, reversal? | Half-done states, double effects, restore to the exact prior state |
| Which effects can I verify through the interface? | Feasible checks now; the rest becomes a recorded limitation |
| Does this state end by itself, and when? | Timed rechecks for holds, reservations, lockouts, sessions, drafts (see "State that changes with time") |
| Where does the user leave the application, and where do they come back? | Every exit to another system and each of its return paths (see "Hand-offs to other systems") |
| What does a person see here, and is it what the rest of the product looks like? | A look at the screenshot of each state, not only its text ([design-review.md](design-review.md)) |

## Layered effect check (for any action that changes data)

"The success message appeared" is layer 1 of 7. Decide how far down each important action deserves
to be followed.

1. **Response**: the action answers without error and says what it did.
2. **Persisted**: after a reload, the record is there with the values entered.
3. **Usable**: the record opens and offers what comparable records offer.
4. **Access**: each other role sees it (or does not) and gets the controls its role allows.
5. **Side effects**: other screens that show or count these records agree (lists, totals, dashboards, reports, stock, balances).
6. **Isolation**: it exists exactly once; neighbouring records are unchanged.
7. **Reversal**: undoing it (cancel, delete, void) restores everything layer 5 touched.

Layers 5 and 7 are where cross-module defects hide: an action often updates its own module and
forgets one consumer, or a reversal undoes the record but not its side effect.

## Where to look, by kind of behaviour

- **Main workflows**: the path the business exists for, end to end, with realistic data. Then the same path with one thing different at a time.
- **Validation and boundaries**: each stated limit at the limit, just inside, just outside. Empty, whitespace, very long, special characters. Does a rejected submit keep the other values? Is the limit enforced where it is stated, or only in the form?
- **State transitions**: draw the states. Try every transition that should be allowed and several that should not. Is a finished item really finished? Can a transition be repeated?
- **Role differences**: for each role, what is offered, what is refused when attempted anyway (a hidden button is not a refused action), and whether the same data looks the same.
- **Cross-module effects**: after changing something in module A, read the figures in module B before and after. Record the before value first.
- **Persistence**: reload, navigate away and back, sign out and in.
- **Retries and duplicates**: press twice, Back then submit again, reload after a submit.
- **Cancellation and recovery**: cancel midway (does anything stick?), cancel after completion (is everything released?).
- **Configuration changes**: change a setting, then check new records, existing open records, and closed historical records. Decide beforehand which of the three should change; requirements often say nothing, which is itself a finding to raise as a question.
- **Calculations**: compute the expected figure yourself, independently, before looking. Check rounding once versus per line, and the same figure on every screen that shows it.
- **Time**: boundaries of any time window, dates at month and year ends, ordering by time.

## State that changes with time

Applies when an action puts something into a state meant to be temporary: a slot or stock held
during checkout, a reservation, a lock on a record being edited, a lockout after failed sign-ins, a
one-time link, an unpaid order, a session, a draft.

- Decide before acting what would be normal: such states usually exist on purpose and end after a
  short, stated time. The state existing is rarely the defect. Its length, whether the user is told,
  whether the user can get back to what they started, and whether it ends early when it should
  (cancel, failure, sign-out) are where defects are.
- Write down the wall-clock time when you create the state (read the clock; do not estimate it).
- One look straight after proves nothing about how it ends. Plan rechecks at increasing intervals
  (for example 5, 15, 30, 60 minutes), do other tests in between, and record each look with its
  time. If the run ends first, the checkpoint names the record and the time of the next look.
- Until a recheck has been made, a finding may say "still in this state after N minutes", never
  "permanent", and its severity follows the part that was verified.
- Each state you create is test data left behind: list it, and say when it should clear.

Example. A course site holds a seat when a learner starts enrolling. Right after abandoning
enrolment the seat is gone for everyone: expected. Looks at 5 and 15 minutes: still held. At 40
minutes: free again. Findings that follow are about a 15 to 40 minute hold nobody is told about and
that a cancel button does not end, not about "abandoning enrolment takes the seat".

Does not apply: a state the user ends themselves and that is meant to last (a saved booking, a
published post). There the reversal tests above are the right tool, not timed rechecks.

## Hand-offs to other systems

Applies when a flow leaves the application: a payment page, single sign-on, a map, an identity
check, an emailed link.

- List every exit and every way back: success, failure, cancel, the provider's own back link, the
  browser's Back button, closing the tab and returning later.
- For each way back, check the address the user lands on (is it this application's host, does it
  load) before checking what the page says. A wrong return address is invisible until that path is
  taken, and each path can be wrong separately.
- Compare what the application believes afterwards with what the user was shown: a payment recorded
  while the user saw an error, or the reverse.
- The other system's page is often inside an embedded frame or on another origin: see
  browser-operation.md ("Embedded frames"). Add its origin to `allowed_origins` only to read it.
- Prefer the provider's test routes that need no card or bank details (a simulated bank page with
  succeed and fail buttons). The session does not type payment credentials; if only a card form
  exists, the user completes that step and the investigation continues after it.

Does not apply: links that merely leave (a social media link, directions). Check that they open the
right place, once, and move on.

## Reasoning perspectives

Run the feature past each before closing the test list:

- **Business owner**: what would lose money, break a promise to a customer, or break a rule we are held to?
- **User in each role**: what am I trying to get done, and what would stop or mislead me?
- **Careless or hostile user**: what should I not be able to do or see, and what happens if I try?
- **Keeper of the data**: which numbers and states must always agree, wherever they are shown?
- **Next tester**: what would I need written down to trust and continue this work?

## Prioritising

Score roughly, not arithmetically. Higher priority when:

- **Impact**: money, access to other people's data, legal or contractual rules, irreversible effects.
- **Reach**: many screens, roles or records consume the result.
- **Uncertainty**: the requirement is silent, ambiguous or contradicted by what was observed; the area has already produced a finding; the behaviour was never tested.
- **Cost**: cheap to run within the remaining budget, and does not destroy data other tests need.

Order tests so that destructive or state-consuming ones come after the tests that need the same
records intact. When the budget cannot cover an important area, record it as `not-covered` with the
reason rather than running a thin test and calling it covered.

The reason on a `not-covered` or `deferred` area must be the real one. "Budget" is only true when
the budget was spent: if actions remain when the run ends, either use them on the highest-priority
uncovered area or write what actually stopped you (needs approval, no account, tool cannot reach
it, not asked for). A user who later asks "did you cover X?" should find the honest answer already
in coverage.

## Dependency thinking: a short example

A requirement says a rate setting is "applied to new orders". Exploration shows the order list, an
order detail, and a monthly summary all display amounts. Model: `Setting.rate → Order.amount`
(documented), `Order.amount → Summary.total` (observed), `Setting change → existing open orders`
(hypothesized: unchanged). Tests that follow: a new order uses the new rate (requirement); an order
created before the change keeps its amount on list, detail and summary (invariant between screens,
hypothesis on retroactivity); the summary equals the sum of its orders after the change (invariant).
Three tests from one sentence, and one question for the owner about retroactivity.
