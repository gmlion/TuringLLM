# Demo: GSM8K math word problems

Solve the GSM8K math word problems found in `workspace/gsm8k.jsonl` (Cobbe et al. 2021, arXiv:2110.14168). Each line of the fixture is a JSON object with a natural-language `question` (a math word problem) and an integer `answer`.

The meta-search will sample 3 items deterministically at startup and try operator compositions to maximise the fraction answered correctly. The goal is to discover an operator-composition workflow (e.g., `refine,cove`) that achieves 100% accuracy on the 3-item sample, halting early; otherwise it runs up to `max_iterations` (default 10) and reports the best workflow found.

## What the meta-strategy does

1. Initialize: load the fixture, sample 3 items deterministically, copy this PROGRAM.md into the search frame.
2. MCTS loop: select a node (UCT), expand it via `expand-workflow.md` to k=5 candidate workflows, simulate each candidate by running its operators on each of the 3 items, score by mean fraction passing.
3. Halt: on first 1.0 reward, or after `max_iterations`. Emit `## Solution` (best workflow + score) or `## No Solution Found`.
