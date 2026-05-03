# 7. Meta-frameworks

Operators in this group treat the operator library itself as a search space — they compose other operators into workflows and search/learn over those compositions.

## Members

- **`a-aflow-lite`** — AFlow-lite (Zhang et al. arXiv:2410.10762, lightweight v1). MCTS over candidate workflows from a five-operator library (refine, reflexion, cove, plan-execute, debate); evaluates each workflow on a small benchmark; halts on first perfect-score workflow or after `max_iterations`.

(Full content arrives in T36.)
