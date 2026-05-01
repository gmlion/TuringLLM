# Dynamic: Evaluate

Receives arguments: {{attempt}}, {{criterion}}.
Produced MEMORY: ## State done + ## Return block with keys `verdict`, `feedback`.
Return: state done → caller sees {caller_state}_completed, and ## Return entries are spliced into caller's MEMORY as ## Verdict and ## Feedback.

**Two modes (decided from the criterion text):**

1. **File-aware mode** — the criterion names workspace paths (substrings starting with `../../workspace/`, e.g. `../../workspace/README.md`, `../../workspace/.chatdev/code.md`, `../../workspace/src/...`). Side effects on disk are part of what's being judged: role agents are expected to USE the Bash tool to write those files. The textual `attempt` is often aspirational — it may *describe* work or even contain a literal `bash` command typed as text — and is NOT proof anything was actually done. In this mode you MUST inspect the filesystem before judging.

2. **Text-only mode** — the criterion does not name workspace paths (typical of iterative-refinement: the artefact under judgement IS the textual `attempt` itself, e.g. a draft, a plan, a summary). No filesystem inspection is required; judge `attempt` against `criterion` directly.

## Instruction: Judge
**Condition:** MEMORY state is "empty"
**Action:** First, classify mode by scanning the criterion for `../../workspace/` substrings.

**If file-aware mode**: inspect on-disk state before judging.

    bash ls -la ../../workspace/
    bash ls -la ../../workspace/.chatdev/    # if criterion references .chatdev artefacts
    bash cat <each workspace path the criterion mentions>

For every workspace path the criterion names: verify the file exists and its content does what the criterion requires. A `bash` command appearing as text in `attempt` is NOT proof of file creation — confirm with `ls`/`cat`. If a consensus-artefact path (e.g. `../../workspace/.chatdev/<phase>.md`) contains a heredoc / shell snippet / "Here's the bash command…" prose, that's `fail` with feedback "consensus artefact contains an unexecuted bash recipe instead of describing executed work". If any required file is missing or its content doesn't match the criterion, verdict is `fail` with concrete feedback naming the missing-or-wrong files (cite `ls -la` byte counts and `cat` snippets).

**If text-only mode**: judge the textual `attempt` against the textual `criterion` directly. Does the attempt meet every bullet of the criterion? If yes, `pass`; if no, `fail` with concrete feedback (cite specific gaps).

Either way, write `./MEMORY.md` with this EXACT single-heredoc shape (the `## Return` block MUST be in the same heredoc as the state change — without it the shell pops with no return value, breaking the caller):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Judge
## Last Action
<one short sentence describing whether you used file-aware or text-only mode and what you checked>
## Result
Evaluation complete.
## Return
verdict: |
  <pass or fail>
feedback: |
  <concrete feedback — for file-aware mode, cite actual on-disk file paths and content snippets; for text-only mode, cite specific bullets of the criterion that the attempt does or does not meet — every line indented two spaces>
MEMEOF
```

Attempt (text from the producer; in file-aware mode this may be aspirational — verify everything against disk):
{{attempt}}

Criterion (the acceptance criterion; if it names `../../workspace/` paths, you are in file-aware mode):
{{criterion}}
