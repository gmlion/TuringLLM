# 7. Meta-frameworks

Meta-frameworks treat the operator library itself as a search space — they search or learn over compositions of other operators rather than executing a single fixed strategy.

## What's here

A meta-framework operator (such as `aflow-lite.md`) at the canonical position is invoked the same way as any other operator (push it, pass `{{task}}`). Internally it pushes other operators from the library to materialise candidate workflows.

## Members

- **`a-aflow-lite`** — AFlow-lite (Zhang et al. 2024, *AFlow: Automating Agentic Workflow Generation*, arXiv:2410.10762). A lightweight v1 of the AFlow meta-framework: MCTS over candidate workflows from a five-operator library (`refine`, `reflexion`, `cove`, `plan-execute`, `debate`), evaluated on a small benchmark sample. The MCTS controller is reused verbatim from LATS (`interpreters/mas-papers/3-search/b-lats/`); the new piece is `expand-workflow.md` (k=5 LLM-driven workflow expansion) and the per-workflow simulator that pushes operators sequentially with `{{task}}`/`{{prior_answer}}` push-args.

## Notable group properties

- Stack-depth invariant: aflow-lite reaches 4 frames — depth 3 — in the deepest case (root `aflow-lite` at depth 0 + library operator at depth 1 + sub-push of library operator at depth 2 + sub-push's own sub-push at depth 3 — e.g., CoVe → verify → answer-independently). Most cycles run at depth 0–1.
- Operators in the library are byte-equal copies of their canonical sources elsewhere in the catalogue, accessible through any interpreter's `INSTRUCTIONS.md` marker (`operators/<name>.md`).
- No nested shell instances. All workflow execution happens through push/pop within one shell instance.

## Future scope

- **MoA in the library:** blocked on per-prompt model selection in the harness. Future spec adds it.
- **Meta-reflexion:** the operator `reflexion.md` runs *inside* workflows in the library (per-attempt verbal lessons within its own pushed frame), but aflow-lite v1 does NOT push `reflect.md` at the meta level. A higher meta-meta-spec might add cross-iteration meta-reflection.
- **Larger benchmarks / domains beyond GSM8K:** v1 ships GSM8K as a representative arithmetic-reasoning benchmark.
