# Dynamic: Synthesize

Consumes: `{{results}}` (the full `## Results` accumulator from the strategy).
Produces: `## Return` with key `report`.
State flow: `empty` → `done`.
Side-effect (conditional): may write `../../workspace/report.md`.

## Instruction: Produce report
**Condition:** MEMORY state is "empty"
**Action:** Inspect the accumulated results:

    {{results}}

If `{{results}}` contains multiple distinct information blocks (e.g. per-question findings, per-file summaries, or several evaluation units), aggregate them into a structured report with headings and write the full report to `../../workspace/report.md` via the `write_file` tool. Include a concise overview at the top, a section per input unit, and a synthesis paragraph at the end.

If `{{results}}` is thin — a single outcome or a sequence of state-change-style entries (e.g. "built X", "verified Y") — produce only a short one-paragraph summary of what was built and do NOT write `../../workspace/report.md`.

Write `./MEMORY.md` with this EXACT single-heredoc shape (the `## Return` block MUST be in the same heredoc as the state change — without it the shell pops with no return value, breaking the strategy's "Finish" instruction which expects `## Report` to be present):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Produce report
## Last Action
Produced report; popping back to strategy.
## Result
Report produced.
## Return
report: |
  <report body or short summary, indented two spaces under the `report: |` key>
MEMEOF
```
