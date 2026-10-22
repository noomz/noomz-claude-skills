# Readout example

Worked example of the Step 3 readout block. Shape rules live in SKILL.md.

```
BLANK BRAIN RECAP — 2026-09-06 + 2026-09-07 (cold, today had 4 commits)

SHIPPED
  api-service     commit a1b2c3d  issue #101 rate-table split
                  -> deployed to staging                                  (measured)
  schema          commit e4f5a6b  migration 0007, new payee columns       (measured)

IN PROGRESS
  #118 phase B2   stopped at: loader cannot reach the mandate record
                  api-service [main]  M etl/loader.py  (real:1 filtered:2)  (measured)

BLOCKED / WAITING
  PR #204 api-service     open, 2 owner rulings pending      (gh-verified)
  pricing-rounding        waiting on analyst answer          [unverified, from memory]

NEXT STEP
  Do Job 1 in HANDOFF-promote-2026-09-07: write promote_settlement.py,
  dry-run against staging, then --apply.

basis: git log 19 repos, 2026-09-06 + 2026-09-07; git status --porcelain, noise-filtered;
       .planning/HANDOFF-promote-2026-09-07.md (next step);
       .planning/STATE-213-B.md (in-progress item);
       gh pr list 4 GitHub repos of 19, cross-checked vs MEMORY.md open threads
```
