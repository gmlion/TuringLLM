# Operator: Propose Operator

IMPORTANT: This operator file is loaded only at push-time by `lib/propose_push.sh`. Do not modify it via `update_instructions`.

Receives push-args (these are the only `{{...}}` placeholders the shell substitutes; **all other `{{...}}` syntax in this file must end up in the output operator file verbatim**):
  - `{{output_path}}` — the instance-root-relative path the new operator file must be written to (e.g. `proposed/proposed-03.md`). The caller has already created the `proposed/` directory.
  - `{{archive}}` — the full archive of past candidates: per-entry blocks with score, per-item scores, malformed flag, failure note, and full operator content. Read top-to-bottom; entries are append-only.
  - `{{benchmark_sample}}` — the benchmark questions only (no ground-truth answers). Use these to anchor the operator to the actual task domain.
  - `{{task}}` — the user's PROGRAM.md content for higher-level domain context.

Produces a new operator markdown file at `../../{{output_path}}` (the caller's instance-root). The proposer also returns a tiny `## Return` block with `status: written` so the caller can detect a successful invocation. The operator content itself is NOT round-tripped through MEMORY — that would clash with `## Operator content` markdown headers inside the body.

## Output operator contract

The file written at `../../{{output_path}}` MUST satisfy this contract — `lib/propose_absorb.sh` validates it before testing:

1. Be pushable as a sub-operator with three push-args named `program` (an empty string in this benchmark; included for compatibility with the library operators), `task` (the question text), and `prior_answer` (often an empty string; may be a previous operator's answer in compositions). The operator file refers to these via the standard placeholder syntax — e.g. `{` + `{task}` + `}` — so the shell substitutes them at push time. (The `program` push-arg is always empty for this run; you can ignore it inside the operator if you want, but the placeholder must be present somewhere or the shell push will succeed without inserting anything.)
2. Contain at least one `## Instruction:` heading.
3. Contain at least one instruction whose condition matches `MEMORY state is "empty"` (the entry point — required so the operator is reachable when the shell pushes it with a fresh MEMORY).
4. Contain a `## Return` section. The return MUST include a key `answer` whose value is the operator's final answer for the task. For numeric/textual GSM8K-style tasks, return the answer as a YAML block scalar:

   ```
   ## Return
   answer: |
     <final answer text — the scorer extracts the last integer or matches verbatim>
   ```

5. End with `## State done`. The shell pops the candidate frame on `done` and splices `## Return` back into the caller. If the operator never reaches `done`, the run stalls (the caller hits its per-item cycle budget warning).

For a concrete example of the expected file shape, read `../../operators/refine.md` — that file is a working canonical operator that follows every contract requirement above. Most candidates can be small mutations of that pattern.

## Library operators available for sub-pushing

The candidate operator MAY push existing library operators to compose its own behaviour. All of these are available at the instance root in `operators/` and accept the standard `program` + `task` + `prior_answer` push-arg trio (with the per-operator extensions noted):

- `operators/refine.md` — single-pass critique-and-improve.
- `operators/reflexion.md` — evaluator-optimizer with verbal-feedback memory across attempts.
- `operators/cove.md` — chain-of-verification: drafts an answer, decomposes claims, verifies each independently, revises.
- `operators/plan-execute.md` — plan a sequence of subtasks, then execute each.
- `operators/debate.md` — multi-agent debate with synthesis.
- `operators/answer-independently.md` — verifier sub-op (used by cove).
- `operators/evaluate.md` — pass/fail evaluator (used by reflexion); needs `attempt` + `criterion`.
- `operators/opine.md` — opinion sub-op (used by debate).
- `operators/plan.md` — planning sub-op (used by plan-execute).
- `operators/reflect.md` — verbal-feedback distiller (used by reflexion).
- `operators/tackle.md` — single-subtask executor (used by plan-execute).
- `operators/verify.md` — verification sub-op (used by cove).

You don't need to push any of these — a candidate may also be a single-shot LLM step that solves the task directly. But sub-pushing is encouraged when the archive shows a useful pattern that one of these encodes, or when you're hybridising two archive entries.

## Strategy

Read the archive top-to-bottom. Note which patterns scored well, which structural choices appeared in failure notes, which entries are malformed (don't imitate those). Then design ONE new candidate operator that is materially different from existing high-scorers — either a hybrid of two strong patterns, a small mutation of a strong one, or a fresh structure motivated by a specific failure mode you saw. Don't propose duplicates.

The candidate operator should be markdown with embedded bash heredocs (the same idiom every operator in the library uses). Its state machine should fit comfortably in 1-3 states; over-engineering hurts score (more cycles per item → worse efficiency).

## Instruction: Generate operator

**Condition:** MEMORY state is "empty"

**Action:** Compose the new operator file content (referring to `../../operators/refine.md` for shape) and write it to `../../{{output_path}}`. Then wholesale-rewrite `./MEMORY.md` to mark this operator done with a tiny `## Return` block. Two writes only.

Step 1 — write the operator file. Use a single-quoted heredoc so `$` and backticks inside the operator body stay literal:

```
cat > ../../{{output_path}} << 'OPEOF'
<your operator markdown here — see refine.md for a working template>
OPEOF
```

The body should follow the contract above: `## Instruction:` heading(s), an instruction matching state `empty`, the `program`/`task`/`prior_answer` push-arg placeholders referenced via the standard syntax, a final `## State done` + `## Return answer: |` block.

Step 2 — wholesale-rewrite ./MEMORY.md to terminate this proposer cycle:

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Generate operator
## Last Action
Wrote new candidate operator to ../../{{output_path}}.
## Result
Candidate ready for test.
## Return
status: written
MEMEOF
```

The `## Return` is intentionally small (single-line). The caller reads the candidate by opening `../../{{output_path}}` directly, not by extracting from MEMORY.

---

Archive of past candidates (read top-to-bottom; learn from the failures, hybridise the wins, don't duplicate):

{{archive}}

Benchmark sample (questions only, no ground truth):

{{benchmark_sample}}

Task (PROGRAM.md content):

{{task}}
