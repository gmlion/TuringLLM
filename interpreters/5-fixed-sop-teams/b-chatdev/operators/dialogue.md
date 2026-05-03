# Dynamic: Dialogue

Consumes (push-args): `participants` (comma-separated role names matching files under `../../roles/`); `topic`; `input` (optional — prior-phase output); `output_path` (a workspace file path where this dialogue must write its consensus artefact body); `acceptance` (optional — `true` or `false`; when `true`, push `evaluate.md` before returning).
Produces: `## Return` with key `dialogue` containing only the literal string `(written to <path>)`. The consensus artefact body itself is written by this dynamic to the `output_path` push-arg's location — never inlined into MEMORY. This avoids fragile section-boundary parsing in the caller (the body can contain arbitrary markdown including `## ...` headers).
State flow: `empty` → `ready_to_speak_first` → `turning` → (`decide_accept` → possibly `decide_accept_completed`) → `done`. The `empty` → `ready_to_speak_first` transition is "Init scoped" (deterministic file writes); `ready_to_speak_first` → `turning` is "First turn — speak" (the LLM's first creative act). Splitting these prevents the LLM from skipping the file initialization while it focuses on composing the turn.
Scoped files: `./scoped/transcript.md` (surgical `echo >>` append only), `./scoped/turns.md` (turn counter), `./scoped/topic.md`, `./scoped/input.md`, `./scoped/output_path.md` (the topic, prior input, and output path, all written once in First turn so subsequent instructions read them by path instead of re-substituting — template substitution amplifies long bodies into the prompt N×).

**Two-agent isolation.** Each turn this dynamic runs, you play exactly ONE participant and read only that participant's persona file. The conversation transcript is shared on disk, but you must interpret it as a chat history from your role's perspective only — your prior turns are your "assistant" responses, the other participant's turns are "user" messages addressed to you. Never read the other participant's persona, and never write a turn in their voice. This mirrors ChatDev's per-agent short-term memory (Qian et al., 2023, §3.2).

## Instruction: Init scoped
**Condition:** MEMORY state is "empty"
**Action:** Persist topic, input, and output path to disk (the only place these placeholders are substituted), initialize the transcript and turn counter, then park at "ready_to_speak_first" so the next cycle can focus solely on composing the first turn:

    cat > ./scoped/topic.md << 'TURING_DLG_TOPIC_EOF_4f7a2b9e'
    {{topic}}
    TURING_DLG_TOPIC_EOF_4f7a2b9e

    cat > ./scoped/input.md << 'TURING_DLG_INPUT_EOF_4f7a2b9e'
    {{input}}
    TURING_DLG_INPUT_EOF_4f7a2b9e

    cat > ./scoped/output_path.md << 'TURING_DLG_OUTPUT_PATH_EOF_4f7a2b9e'
    {{output_path}}
    TURING_DLG_OUTPUT_PATH_EOF_4f7a2b9e

    : > ./scoped/transcript.md
    echo 0 > ./scoped/turns.md

    cat > ./MEMORY.md << 'MEM_EOF'
    ## State
    ready_to_speak_first
    ## Matched Instruction
    Init scoped
    ## Last Action
    Wrote topic/input/output_path scoped files and initialized transcript+turns.
    ## Result
    Ready for first turn.
    MEM_EOF

## Instruction: First turn — speak
**Condition:** MEMORY state is "ready_to_speak_first"
**Action:** Identify the participants and pick the first speaker:

    Participants: {{participants}}

`participants` is a comma-separated list. The first comma-separated name is `<speaker>` for this turn; the second is `<other>`. Read **only your own persona file** plus the topic and prior input:

    bash cat ../../roles/<speaker>.md
    bash cat ./scoped/topic.md
    bash cat ./scoped/input.md

Do NOT read `<other>`'s persona file — you are not them. You are `<speaker>`. Speak in character on the topic, incorporating the prior input. Produce ONE short turn (2–5 sentences) from `<speaker>`'s perspective only; never write `<other>`'s response. Append it surgically:

    echo "### Turn 1 — <speaker>" >> ./scoped/transcript.md
    echo "<your turn body>"        >> ./scoped/transcript.md

Overwrite `./scoped/turns.md` with `1`. Set state to "turning".

## Instruction: Next turn
**Condition:** MEMORY state is "turning" and `./scoped/turns.md` contains an integer less than 10 AND the transcript's last turn does not contain the literal token `<SOLUTION>`
**Action:** Read `./scoped/turns.md` (call its value `N`), `./scoped/transcript.md`, and `./scoped/topic.md` (the topic for this dialogue). Determine who speaks this turn:

    Participants: {{participants}}

The next speaker is `participants[N % len(participants)]` — call them `<speaker>`. The other participant is `<other>`. Read **only your own persona file**:

    bash cat ../../roles/<speaker>.md

Do NOT read `<other>`'s persona. You are `<speaker>`. Read the transcript as a chat history *from your perspective*:

  - Lines under `### Turn K — <speaker>` (your name) are YOUR prior responses.
  - Lines under `### Turn K — <other>` are MESSAGES TO YOU from your counterpart.

Continue the dialogue as `<speaker>` only. Respond to the latest message from `<other>` while staying on the topic. Produce ONE turn (2–5 sentences). If you and `<other>` have reached consensus on the artefact this phase is meant to produce, prefix your turn with `<SOLUTION>` followed by that artefact body. Append surgically:

    echo "### Turn <N+1> — <speaker>" >> ./scoped/transcript.md
    echo "<your turn body>"           >> ./scoped/transcript.md

Overwrite `./scoped/turns.md` with `N+1`. If you emitted `<SOLUTION>`, set state to "decide_accept". Otherwise stay in "turning".

## Instruction: Turn limit
**Condition:** MEMORY state is "turning" and `./scoped/turns.md` contains 10 or more
**Action:** Set state to "decide_accept" (hard cap from ChatDev paper §3.2 — 10 rounds).

## Instruction: Accept via evaluate
**Condition:** MEMORY state is "decide_accept" AND the value below equals the literal `true`: `{{acceptance}}`
**Action:** Extract the consensus artefact from the tail of `./scoped/transcript.md` (the `<SOLUTION>` block if present, or the last speaker's turn otherwise) into a short `attempt` string. The criterion is the topic at `./scoped/topic.md` — read its body and inline it below. The output_path is at `./scoped/output_path.md` — read its body and inline it below so the evaluator can `cat` the consensus file. Append to `./MEMORY.md`:

    ## Push
    dynamics/evaluate.md
    ## Push-Args
    attempt: |
      <extracted attempt, indented two spaces>
    criterion: |
      <verbatim ./scoped/topic.md body, indented two spaces>
    output_path: |
      <verbatim ./scoped/output_path.md body, indented two spaces>

Do not change state.

## Instruction: Return after evaluate
**Condition:** MEMORY state is "decide_accept_completed" and `## Verdict` is present
**Action:** Extract the consensus artefact from the transcript and write it to the output path (read it from `./scoped/output_path.md`):

    OUTPATH=$(cat ./scoped/output_path.md)
    mkdir -p "$(dirname "$OUTPATH")"
    cat > "$OUTPATH" << 'TURING_DLG_BODY_EOF_4f7a2b9e'
    <consensus artefact body — verbatim, NO indentation>
    TURING_DLG_BODY_EOF_4f7a2b9e

Read `## Verdict` (literal `pass` or `fail`) and `## Feedback` from MEMORY — these were placed there by the just-popped `evaluate.md`. Then write `./MEMORY.md` with this EXACT single-heredoc shape (the `## Return` block MUST be in the same heredoc as the state change — without it the shell pops with no return value, breaking the strategy):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Return after evaluate
## Last Action
Wrote consensus artefact to $OUTPATH and verdict + feedback to ## Return; popping back to strategy.
## Result
Dialogue + evaluation complete.
## Return
dialogue: |
  (written to $OUTPATH)
verdict: <copy the literal value of ## Verdict — `pass` or `fail`>
feedback: |
  <verbatim ## Feedback body, indented two spaces>
MEMEOF
```

(The shell will splice `## Dialogue` (containing the path marker), `## Verdict`, and `## Feedback` into the caller's MEMORY; the caller decides whether to retry on `fail` or proceed by reading `$OUTPATH` directly.)

## Instruction: Return without evaluate
**Condition:** MEMORY state is "decide_accept" AND the value below does NOT equal the literal `true`: `{{acceptance}}`
**Action:** Extract the consensus artefact from the transcript and write it to the output path (read it from `./scoped/output_path.md`):

    OUTPATH=$(cat ./scoped/output_path.md)
    mkdir -p "$(dirname "$OUTPATH")"
    cat > "$OUTPATH" << 'TURING_DLG_BODY_EOF_4f7a2b9e'
    <consensus artefact body — verbatim, NO indentation>
    TURING_DLG_BODY_EOF_4f7a2b9e

Then write `./MEMORY.md` with this EXACT single-heredoc shape:

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Return without evaluate
## Last Action
Wrote consensus artefact to $OUTPATH; popping back to strategy.
## Result
Dialogue complete.
## Return
dialogue: |
  (written to $OUTPATH)
MEMEOF
```
