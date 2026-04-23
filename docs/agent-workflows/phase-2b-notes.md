# Phase 2b — Implementation notes

Captured at the end of the agent-workflows-phase-2b spec. Findings that future phases can use to avoid the same pain.

## Per-frame directory layout

(To be filled. Note: anything surprising during the new-instance.sh rewrite or the cwd handoff integration.)

## ## Return parsing and splicing

(To be filled. Note: any edge cases in block scalar parsing or splice-into-existing-section semantics that bit implementers.)

## Interpreter retrofits

(To be filled. Note: whether LLMs follow surgical edits (sed -i, echo >>) reliably or regress to wholesale rewrites.)

## d-cove live demo

(To be filled by Task 18.)

## a/b/c live demos

(To be filled by Task 18.)

## Cross-cutting

(To be filled. Breaking changes, removed code paths, anything a future Phase 2c should know.)

**Breaking change (R43):** The Phase-2b layout (`frames/f<NNN>-<slug>/`) is incompatible with the pre-2b layout (flat `INSTRUCTIONS.md` + `MEMORY.md` at instance root). Pre-2b instances cannot resume under the Phase-2b shell. Wipe `instances/` and recreate with `new-instance.sh`. This is a one-time migration cost; no further breaking layout changes are anticipated before Phase 3.
