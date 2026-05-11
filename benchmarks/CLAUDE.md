# Benchmarks

This directory holds **single-prompt benchmark runs** of the same
tasks the project's interpreters tackle, and the comparison reports
that contrast them against the multi-cycle interpreter runs.

The point is to measure whether a given interpreter pattern's
overhead (multiple LLM invocations, role agents, evaluators,
retries) earns its cost on a particular task — versus what one
direct LLM call with tools would have produced.

`benchmarks/` is **untracked in git** by convention; results are
local empirical evidence, not project source.

## Naming and layout

One subdirectory per `(task, approach)` pair:

```
benchmarks/<task-slug>-<approach-slug>/
├── PROGRAM.md          # byte-equal copy of the task PROGRAM
├── workspace/          # the artefacts the LLM produces (empty pre-run)
├── result.json         # the claude CLI's JSON output (cost, duration, turns, final text)
├── timing.txt          # wall-clock seconds from the launching shell
├── stderr.log          # captured stderr (usually empty on success)
└── COMPARISON.md       # the comparison report
```

`<task-slug>` matches the demo PROGRAM (e.g. `wc-plus`).
`<approach-slug>` is the benchmark approach (`single-prompt` for
the one-shot CC baseline; future variants might be e.g.
`single-prompt-sonnet`, `single-prompt-no-tools`).

## Recipe — single-prompt benchmark

Same model and toolset the comparison interpreter uses (currently
Haiku 4.5 + Bash/Write/Edit). The prompt is the verbatim PROGRAM
plus a one-line preamble redirecting any `../../workspace/` path
references to "current directory" (the benchmark has no nested
frame layout).

```bash
mkdir -p benchmarks/<task>-<approach>/workspace
cp <path-to-source-PROGRAM.md> benchmarks/<task>-<approach>/PROGRAM.md

cd benchmarks/<task>-<approach>/workspace
T0=$(date +%s)
{
  printf 'Implement the following spec end to end in your CURRENT DIRECTORY. Treat any "../../workspace/" path references in the spec as "current directory" — write all files here. Use the Bash and Write tools as needed; verify with npm test (or the spec's verification command) before reporting success.\n\n---\n\n'
  cat ../PROGRAM.md
} | claude --print \
    --model haiku \
    --output-format json \
    --allowedTools "Bash(*)" "Write(*)" "Edit(*)" \
    --dangerously-skip-permissions \
  > ../result.json 2> ../stderr.log
echo "wall_seconds=$(($(date +%s) - T0))" > ../timing.txt
```

Then verify the produced artefact independently:

```bash
cd benchmarks/<task>-<approach>/workspace
npm test    # or whatever verification the PROGRAM specifies
```

Don't trust the model's "all tests passing" claim in `result.json`
— always re-run the verification yourself in a clean shell.

Note: do not use the standalone `time` command — it isn't
available as a binary in Git Bash on Windows. Use `date +%s`
deltas as shown above.

## Reference comparison: the interpreter instance

The benchmark's *comparison reference* is an instance built with
the interpreter under test on the same PROGRAM. For ChatDev the
canonical reference is `instances/<name>/` created via:

```bash
./new-instance.sh interpreters/<group>/<leaf> <name>
# verify the PROGRAM matches; if needed:
cp <path-to-source-PROGRAM.md> instances/<name>/PROGRAM.md
instances/<name>/run.sh
```

Pull comparison stats from the instance's logs:

```bash
INST=instances/<name>
echo "cycles: $(grep -c '"type":"cycle_start"' $INST/logs/events.jsonl)"
echo "wall_seconds: $(awk -F'"' '/cycle_end/{for(i=1;i<=NF;i++)if($i=="duration_ms"){print $(i+1); break}}' $INST/logs/events.jsonl | tr -d ':,' | awk '{s+=$1}END{print int(s/1000)}')"
echo "frames present: $(ls $INST/frames/ | wc -l)"
echo "workspace files:"
find $INST/workspace -maxdepth 3 -type f | grep -v '\.git/' | sort
```

Cost per ChatDev cycle isn't surfaced by the `claude-code`
provider currently — estimate as `cycles × ~$0.10` (rough order
of magnitude for Haiku 4.5 with cached system prompt).

## Re-run the reference if it's missing or obsolete

**Before comparing, check that the reference instance exists and
was generated against the *current* interpreter source.** If
either fails, recreate the instance and re-run.

Two cases that require regeneration:

1. **No instance exists** for the (interpreter, PROGRAM) pair under
   `instances/`. (`benchmarks/` is gitignored and `instances/` is
   too — neither survives a fresh clone, and instances get
   periodically cleaned up.)
2. **The instance is obsolete.** It was created before the current
   interpreter source. Check by comparing the instance's snapshotted
   INSTRUCTIONS.md to the current source:

   ```bash
   diff -q \
     instances/<name>/history/0001-*/frames/f000-strategy/INSTRUCTIONS.md \
     interpreters/<group>/<leaf>/INSTRUCTIONS.md
   ```

   Any difference, or any `*.md` in the interpreter's `operators/`
   or `roles/` modified after the instance's `frames/f000-strategy/MEMORY.md`
   mtime, means the instance pre-dates the current code and its
   numbers are not directly comparable to a fresh single-prompt
   run.

Recreate by deleting the old instance and re-running:

```bash
rm -rf instances/<name>
./new-instance.sh interpreters/<group>/<leaf> <name>
cp <source-PROGRAM> instances/<name>/PROGRAM.md   # if needed
instances/<name>/run.sh
```

A full ChatDev wc-plus run is roughly 25 minutes; budget time.

## Composing the COMPARISON.md report

Same structure each time so the docs read consistently:

1. **One-paragraph preamble** — same task, same model, same
   toolset; what each side does.
2. **Headline numbers table** — wall time, invocations, cost,
   `npm test` (or other verification) result.
3. **What each produced** — file listings, brief description.
4. **What the comparison says** — the actual finding. Be honest
   about which dimensions favour which approach. The interpreter
   is *trying* to do something the single prompt isn't (audit
   trail, reviewer rejection, role specialization); name those
   things even when the cost dominates.
5. **Methodology notes / caveats** — measurement limits, what's
   estimated vs measured, whether `npm test` was actually re-run.

The `wc-plus-single-prompt/COMPARISON.md` is the reference shape
for new reports.
