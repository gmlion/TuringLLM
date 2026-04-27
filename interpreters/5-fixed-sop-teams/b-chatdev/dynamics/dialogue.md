# Dynamic: Dialogue

Consumes: `{{participants}}` (comma-separated role names matching files under `../../roles/`); `{{topic}}`; `{{input}}` (optional — prior-phase output); `{{acceptance}}` (optional — `true` or `false`; when `true`, push `evaluate.md` before returning).
Produces: `## Return` with key `dialogue` (the shell splices it into the caller's MEMORY as `## Dialogue`).
State flow: `empty` → `turning` → (`decide_accept` → possibly `decide_accept_completed`) → `done`.
Scoped files: `./scoped/transcript.md` (surgical `echo >>` append only), `./scoped/turns.md` (turn counter).

**Two-agent isolation.** Each turn this dynamic runs, you play exactly ONE participant and read only that participant's persona file. The conversation transcript is shared on disk, but you must interpret it as a chat history from your role's perspective only — your prior turns are your "assistant" responses, the other participant's turns are "user" messages addressed to you. Never read the other participant's persona, and never write a turn in their voice. This mirrors ChatDev's per-agent short-term memory (Qian et al., 2023, §3.2).

## Instruction: First turn
**Condition:** MEMORY state is "empty"
**Action:** Create `./scoped/transcript.md` (empty file) and `./scoped/turns.md` containing `0`. Identify the participants and pick the first speaker:

    Participants: {{participants}}
    Topic:        {{topic}}
    Prior input:  {{input}}

`participants` is a comma-separated list. The first comma-separated name is `<speaker>` for this turn; the second is `<other>`. Read **only your own persona file**:

    bash cat ../../roles/<speaker>.md

Do NOT read `<other>`'s persona file — you are not them. You are `<speaker>`. Speak in character on the topic, incorporating the prior input. Produce ONE short turn (2–5 sentences) from `<speaker>`'s perspective only; never write `<other>`'s response. Append it surgically:

    echo "### Turn 1 — <speaker>" >> ./scoped/transcript.md
    echo "<your turn body>"        >> ./scoped/transcript.md

Overwrite `./scoped/turns.md` with `1`. Set state to "turning".

## Instruction: Next turn
**Condition:** MEMORY state is "turning" and `./scoped/turns.md` contains an integer less than 10 AND the transcript's last turn does not contain the literal token `<SOLUTION>`
**Action:** Read `./scoped/turns.md` (call its value `N`) and `./scoped/transcript.md`. Determine who speaks this turn:

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
**Action:** Extract the consensus artefact from the tail of `./scoped/transcript.md` (the `<SOLUTION>` block if present, or the last speaker's turn otherwise) into a short `attempt` string. Use `{{topic}}` as the `criterion`. Append to `./MEMORY.md`:

    ## Push
    dynamics/evaluate.md
    ## Push-Args
    attempt: |
      <extracted attempt, indented two spaces>
    criterion: |
      {{topic}}

Do not change state.

## Instruction: Return after evaluate
**Condition:** MEMORY state is "decide_accept_completed" and `## Verdict` is present
**Action:** Extract the consensus artefact from the transcript. Read `## Verdict` (literal `pass` or `fail`) and `## Feedback` from MEMORY — these were placed there by the just-popped `evaluate.md`. Write `./MEMORY.md` with this EXACT single-heredoc shape (the `## Return` block MUST be in the same heredoc as the state change — without it the shell pops with no return value, breaking the strategy):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Return after evaluate
## Last Action
Wrote consensus artefact + verdict + feedback to ## Return; popping back to strategy.
## Result
Dialogue + evaluation complete.
## Return
dialogue: |
  <consensus artefact body, indented two spaces>
verdict: <copy the literal value of ## Verdict — `pass` or `fail`>
feedback: |
  <verbatim ## Feedback body, indented two spaces>
MEMEOF
```

(The shell will splice `## Dialogue`, `## Verdict`, and `## Feedback` into the caller's MEMORY; the caller decides whether to retry on `fail` or proceed.)

## Instruction: Return without evaluate
**Condition:** MEMORY state is "decide_accept" AND the value below does NOT equal the literal `true`: `{{acceptance}}`
**Action:** Extract the consensus artefact from the transcript. Write `./MEMORY.md` with this EXACT single-heredoc shape:

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Return without evaluate
## Last Action
Wrote consensus artefact to ## Return (no acceptance gate); popping back to strategy.
## Result
Dialogue complete.
## Return
dialogue: |
  <consensus artefact body, indented two spaces>
MEMEOF
```
