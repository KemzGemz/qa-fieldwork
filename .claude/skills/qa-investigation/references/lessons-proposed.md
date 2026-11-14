# Proposed lessons (unreviewed)

Appended by `tools/records.ts lesson`. Each entry is one application's experience with its
provenance. The tester reviews entries and moves the ones that generalise into `field-lessons.md`.
Do not treat anything here as an expectation for another target.

- **When a tool argument is an application path, pass a full URL or a path without a leading slash: Git Bash on Windows rewrites a leading '/' into a local file path. And do not chain further actions behind a step whose outcome has not been read.**
  - Basis: A rewritten path took the tab out of the application; four chained clicks then timed out on the browser error page and cost five budgeted actions before the state was observed.
  - Provenance: target `hiredesk`, run-20261115-001540, 2026-11-15. Status: proposed (one application's experience; not a universal expectation).
