# Measurement: GSM8K math word problems

Solve the GSM8K math word problems in `workspace/gsm8k.jsonl` (Cobbe et al. 2021, arXiv:2110.14168). The fixture is a deterministic 60-item slice of the official GSM8K test set, fetched and committed via `scripts/fetch-gsm8k.sh`. Each line is a JSON object with a natural-language `question` and a normalised integer `answer`.

The meta-search uses a **30-item search set** that the proposer LLM can see scores from, and a separate **30-item held-out set** the proposer never sees. The discovered agent is evaluated against the held-out set after the search ends; that holdout score is the headline metric.

## What the meta-strategy does

1. **Initialize:** load the fixture, slice into 30 search items + 30 held-out items, copy this PROGRAM.md into the search frame.
2. **Seed phase:** test the 5 base operators (`refine`, `reflexion`, `cove`, `plan-execute`, `debate`) on the 30 search items, append each result to the archive.
3. **Propose phase:** for `max_iterations` iterations (default 10), the proposer reads the full archive (operator content + scores + failure notes) and writes a new operator file; the shell tests it on the 30 search items and appends the result.
4. **Holdout phase:** when the proposer iteration budget is reached, pick the search-winner (max search score, tie-break lowest entry NN), run it once per held-out item, record the holdout score on the winner's archive entry.
5. **Halt:** emit `OUTPUT.md` with the headline `Best agent (held-out): <label> <score>` and the search score adjacent for comparison.

## Multi-run protocol

A single run gives one number; LLM sampling is stochastic so the meaningful measurement is mean ± stdev across multiple runs. Use `scripts/adas-sweep.sh <prefix> <N>` to run N sequential instances, then `scripts/adas-aggregate.sh <prefix>` to produce a markdown report with per-run scores, mean ± stdev of holdout and search, and a per-run search-vs-holdout overfit indicator.
