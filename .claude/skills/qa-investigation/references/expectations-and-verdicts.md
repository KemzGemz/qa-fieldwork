# Expectations and verdicts

## The rule

Write down what should happen, and why you believe it, before you look. An expectation invented
after seeing the result is a description, not a test.

What the application does is evidence of its behaviour, never of its correctness. "It has always
shown 16" does not make 16 right.

## Bases for an expectation

| `--basis-type` | Meaning | Strength | If violated |
|---|---|---|---|
| `requirement` | An explicit statement in a supplied document. Cite ID and section. | firm | `fail` |
| `rule` | A business rule confirmed by the user or product owner in conversation. Cite who and when. | firm | `fail` |
| `invariant` | A consistency relationship that must hold whatever the business rule is: the same figure on two screens, a total equal to the sum of its lines, a record existing once, a reversal restoring the prior state. | firm | `fail` |
| `domain` | Normal practice in this kind of business or application. Say which practice. | soft | `suspected` |
| `standard` | A published standard or guideline. Name it precisely, and check that it applies to this product and context. | soft unless the requirements adopt it | `suspected` |
| `hypothesis` | A reasoned guess where nothing else speaks. Say what would confirm it. | soft | `suspected` |

Record uncertainty in `--uncertainty`: what you are unsure of and what would settle it.

`--objective` on `test-result` allows `fail` on a soft basis only for outcomes wrong under any
reading: a crash, a server error page, lost data, another user's private data shown.

Invariants deserve care. "The list and the detail show the same amount" is an invariant.
"A cancelled booking frees its slot" is a requirement or domain expectation, not an invariant, unless
two screens disagree about whether the slot is free.

## Citing standards

Before citing a standard: can you name the specific clause or criterion, and does it govern this kind
of product? WCAG applies to web content generally, but conformance is only an obligation where the
requirements or the law in that market say so. If you cannot verify the clause from a source
available to you, describe the expectation as domain practice instead and say so. Never cite a
standard from memory with a made-up clause number.

## When requirements are silent or ambiguous

1. State the gap in `knowledge/requirements.md` (ambiguities table).
2. Form the most defensible expectation: what serves the stated objective, what the surrounding
   rules imply, what comparable systems do, what would surprise a user least.
3. Record it as `domain` or `hypothesis` with the reasoning and the alternative readings.
4. Test it. A violation is `suspected`, filed with the question for the owner.
5. Add the question to `knowledge/questions.md`. When answered, `test-revise` if needed.

Example. The document says discounts "apply to orders over 100". Is exactly 100 included? Reading 1:
"over" means strictly greater. Reading 2: the author meant "100 or more". Expectation recorded:
no discount at exactly 100 (`hypothesis`, literal reading; alternative reading noted). The app gives
a discount at 100.00. Result: `suspected`, with the question "is the threshold inclusive?". Not a
confirmed failure: the document supports both readings.

## Revising an expectation

New evidence can show the expectation was wrong: a requirement misread, a rule clarified by the
owner, a precondition you had not noticed. Use `test-revise` with the reason; the original stays in
the record and the report shows both. Do not revise merely because the application disagrees.

## Classifying an unexpected outcome

| Classification | Signs | Do |
|---|---|---|
| **Product failure** (reproducible) | Firm basis, automation verified, happens again or is objective | `fail`, finding `product-failure`, `--repro` |
| **Suspected defect** | Behaviour is clear but the expectation is soft | `suspected`, finding `suspected-defect`, question for the owner |
| **Automation failure** | Wrong element, value not entered, wrong role, stale page, tool error | `automation-error`; fix the approach and rerun; no product finding |
| **Environmental issue** | Site unreachable, slow for everyone, shared data changed by someone else, session expired | `env-issue`; retry later or record blocked |
| **Inconclusive** | Evidence does not settle it and more cannot be obtained now | `inconclusive`; say what would settle it |

Before calling it a product failure, rule out yourself: was the right record edited? was the value
actually in the field when submitted (read it back from the observation)? were you signed in as the
role you thought? is the "before" value one you recorded, or one you remember?

## Reproduction

Reproduce once where it is safe and the action is repeatable; `2/2` is stronger than `1/1`. Vary one
factor to narrow the cause (another record, another role, a boundary value either side). Some actions
should not be repeated: they consume a unique record, move money, send something to real people, or
alter data others share. Then write in `--repro` why it was not repeated and what single run showed.

## Duplicates

Two symptoms with one cause are one finding. Before filing, ask whether an existing finding's cause
would also produce this symptom; if so add the evidence to it with `finding-update`. Two findings
are distinct when fixing one would plausibly leave the other.

## Describing impact

`--impact-observed`: only what you saw ("the summary showed 3 available while the calendar showed
the slot booked"). `--impact-reasoned`: what follows, labelled as reasoning ("a second customer could
be booked into the same slot; not attempted"). Severity follows business consequence, not how easy
the defect was to find.

## Worked example from field use

Source: a specification-based test event against a food-court ordering system (see
field-lessons.md). The spec gave each stall a last-orders time ahead of its closing time. Expectation
recorded from the spec's exact message text. A send one minute before the cut-off was accepted (pass); sends at and
after it were also accepted (fail, requirement). A follow-up varied one factor and found the check
compared against closing time rather than last-orders time: one cause, reported once, with the
narrowed cause in the finding. Two other "findings" from the same session were withdrawn after a
fresh screenshot showed the record had been cancelled by an earlier test: the before-state had been
remembered, not recorded.
