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

Append the summary or full report body to `./MEMORY.md` as:

    ## Return
    report: |
      <report body or short summary>

Then set state to "done".
