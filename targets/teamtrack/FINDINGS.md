# Findings: teamtrack

From `findings.json`. Generated from this target's records by the tools. Do not edit: change the records and the view follows. Overview: [README.md](README.md).

### F-001: Duplicate project name accepted (differs only in case)

- **Classification:** product-failure · **Severity:** medium · **Status:** open
- **Found:** run-20261115-002834, role project manager, local, version ?
- **Tests:** T-001 · **Requirements:** R2
- **Expected:** Rejected with an explanation; no second project
- **Actual:** Second project created; both names listed
- **Reproduction:** 1/1; not repeated (isolation check only)
- **Impact (observed):** Two projects with the same name in the list
- **Duplicate check:** First finding of this target
- **Evidence:** [006-t001-duplicate-created.png](runs/run-20261115-002834/evidence/006-t001-duplicate-created.png)
