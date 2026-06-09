# Implementation Plan — Incremental Matching (new-candidate funnel)

Date: 2026-06-09
Status: Proposed (awaiting build go-ahead)
Branch: feat/new-role-screen (or a fresh branch)

## Problem

Re-running matching today re-scores the entire pool (248 candidates → top 10) every
time, even when nothing changed — wasting ~minutes of LLM calls. The earlier
"skip already-scored candidates" attempt was reverted because it broke the funnel:
the cascade is a **top-N competitive selection** that only persists the final 10 +
the floor-rejects, so funnel drop-outs (~203) look "unprocessed" and got re-funneled
into a second, wrong top-10 (the 20-instead-of-10 bug).

Goal: when a **new candidate** appears and the **role is unchanged**, evaluate only
that candidate against the previous run's rankings — promoting them to full scoring
only if they would have survived the funnel — instead of re-running everyone.

## Why this is possible (verified)

1. **Step scores are absolute, not batch-relative.** Each funnel step scores every
   candidate 0–100 against a fixed rubric (cascade.ts `scoreStepNBatch`), then ranks
   by `effective = score × completeness_multiplier(candidate)` and slices the top N
   (`prunePool`, cascade.ts:82). Because a candidate's step score does not depend on
   who else is in the batch, **a new candidate's score is directly comparable to a
   prior run's scores.**
2. **Rankings are persisted.** Every run writes `_cascade_runs.cascade_tree` (jsonb)
   with each step's `survived_ids` + `pruned`, and the final 10's full scores.

## Design decisions

- **Displacement = keep 11+ (decided).** A newcomer that reaches Step 6 is scored and
  **added**; existing scored candidates are never dropped. The scored set grows on the
  incremental path. (A full run re-ranks and resets it.)
- **Role edit ⇒ full re-rank.** Any change to the role invalidates all scores and the
  frozen cutoffs. Detected via `_role.updated_at` (already added in migration 0004).
- **Nothing changed ⇒ no-op.** Role unchanged and no new candidates ⇒ return existing
  results, zero LLM calls. (Directly fixes the original "reran everything for nothing"
  complaint.)
- **Cutoffs are frozen from the last full run** and carried forward across incremental
  runs (re-baselined only on a full run). This is an approximation (see Caveats).
- **No new migration.** New persisted fields live inside the existing `cascade_tree`
  jsonb; the only schema dependency (`_role.updated_at`) already exists.

## What we additionally persist (in `cascade_tree`)

On every **full** run, store:

- `step_cutoffs: { floor: number, step1..step5: number }` — the minimum surviving
  `effective` score at each step (i.e. the score of the last survivor, index
  `targetCount-1`). `floor` = the core-fields threshold (currently 3). A step with no
  pruning stores cutoff 0 (everyone passes).
- `evaluated_talent_ids: string[]` — the full set of verified candidate ids the run
  considered. Used to detect "new" candidates next time. (Union of floor + funnel
  input; stored explicitly to be robust.)

On every **incremental** run, write a new `_cascade_runs` row (mode `incremental`)
that carries forward the frozen `step_cutoffs`, grows `evaluated_talent_ids` (old ∪
new), and grows the `scored` set (keep-11+). Run history is preserved.

## Algorithm

### Dispatch (new orchestrator `runMatching(roleId)`, called by both endpoints)

1. Load `role`, last **completed** `_cascade_runs` row, and verified talents.
2. `roleEdited = role.updated_at > lastRun.created_at`
3. `newCandidates = verifiedTalents where id ∉ lastRun.evaluated_talent_ids`
4. Branch:
   - no last completed run **or** `roleEdited` → **full** `runCascadePipeline` (re-baseline)
   - `newCandidates.length === 0` → **no-op** (return lastRun tree, no LLM)
   - else → **incremental** `runIncrementalScoring(role, newCandidates, lastRun)`

### Incremental path `runIncrementalScoring(role, newCandidates, lastRun)`

Mirror the full funnel but prune by **frozen cutoff** instead of top-N, on the new
candidates only (batched per step for efficiency):

```
cutoffs = lastRun.step_cutoffs
survivors = newCandidates

# Floor (same rule as full run)
for c in survivors with coreFieldsFilled(c) < cutoffs.floor:
    upsert screened_out match   # consistent with full run
survivors = survivors with coreFieldsFilled(c) >= cutoffs.floor

# Steps 1..5: score the batch, drop anyone below the step cutoff.
for k in 1..5:
    scores = scoreStepKBatch(role, survivors)            # reuse existing step scorers
    survivors = [c for c in survivors
                 if scores[c] * completeness(c) >= cutoffs[stepK]]
    # pruned newcomers get NO match row — identical to a full-run funnel drop

# Step 6: anyone who survived all 5 cutoffs reaches full scoring.
for c in survivors:
    score = fullScore(role, c)                            # reuse Step 6 scorer
    upsert 'suggested' match                              # keep-11+: additive

persist new _cascade_runs row (incremental): carry cutoffs, grow evaluated_ids + scored
```

Notes:
- A weak newcomer dies after one step call (cheap). Cost ≈ up to 5 step calls + maybe
  Step 6 per new candidate, vs. a full 248-candidate re-run.
- Step scorers (`scoreStep1Batch`…`scoreStep5Batch`) and the Step 6 scorer are reused
  as-is; only the prune rule changes (cutoff vs top-N). Factor the per-step
  "score → effective" logic into a shared helper so both paths share it.

## Files to touch

- `server/matching/cascade.ts`
  - In the full run: compute + store `step_cutoffs` and `evaluated_talent_ids` in the
    tree (capture the last-survivor effective score in `prunePool` / at each step).
  - Add `runIncrementalScoring(...)` reusing the step + Step 6 scorers.
  - Add orchestrator `runMatching(roleId)` (dispatch: full / incremental / no-op).
- `server/matching/types.ts` — extend `CascadeTree` with `step_cutoffs`,
  `evaluated_talent_ids`, and a run `mode: 'full' | 'incremental'`.
- `server/index.ts` — `/rerun-matches` (and `/start-matching`) call `runMatching`
  instead of `runCascadePipeline` directly.
- No migration (reuses `_role.updated_at` from 0004 + `cascade_tree` jsonb).

## Caveats (accepted)

- **Approximation, not a re-rank.** Frozen cutoffs + LLM temperature mean an
  incrementally-added candidate may rank slightly differently than in a full re-run.
  Fine for "did this newcomer crack the tier"; exact ordering needs an occasional full
  rebaseline.
- **Cutoff drift.** Carrying cutoffs across many incremental runs drifts from the true
  distribution. Mitigation: full run on role edit; optional manual "Force full re-rank".
- **Scored set only grows on the incremental path** (keep-11+). A full run resets it.
- **Candidate profile edits do not invalidate** (out of scope — only role edits + new
  candidates trigger work). Can be added later by also comparing candidate `updated_at`.

## Verification

1. Full run stores `step_cutoffs` + `evaluated_talent_ids` in the tree.
2. Add one verified candidate → rerun → logs show `incremental: 1 candidate`; weak
   newcomer pruned after a step (no match row), strong newcomer → Step 6 → 11 scored.
3. Rerun with nothing new → no-op, zero LLM calls.
4. Edit the role → next rerun is a full re-rank (re-baselines cutoffs, resets scored).
5. `npm run build` clean.

## Open question

- Do we want an explicit **"Force full re-rank"** control (admin button / flag on
  rerun) to re-baseline on demand, or rely solely on role edits? (Recommend: add a
  cheap `force` flag now; UI later.)
