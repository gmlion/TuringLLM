# Dynamic: Dialogue

Consumes: `{{participants}}` (comma-separated role names matching files under `../../roles/`); `{{topic}}`; `{{input}}` (optional — prior-phase output); `{{acceptance}}` (optional — `true` or `false`; when `true`, push `evaluate.md` before returning).
Produces: `## Return` with key `dialogue_output`.
State flow: `empty` → `turning` → (`decide_accept` → possibly `awaiting_verdict_completed`) → `done`.
Scoped files: `./scoped/transcript.md` (surgical `echo >>` append only), `./scoped/turns.md` (turn counter).

## Instruction: First turn
**Condition:** MEMORY state is "empty"
**Action:** Create `./scoped/transcript.md` (empty file) and `./scoped/turns.md` containing `0`. Read the role description files for the named participants:

    Participants: {{participants}}
    Topic:        {{topic}}
    Prior input:  {{input}}

For each participant, `bash cat ../../roles/<name>.md` to load their persona. Pick `participants[0]` as the first speaker. Produce one short turn (2–5 sentences) speaking *as* that role on the topic, incorporating the prior input. Append it surgically:

    echo "### Turn 1 — <speaker>" >> ./scoped/transcript.md
    echo "<speaker's turn body>"   >> ./scoped/transcript.md

Overwrite `./scoped/turns.md` with `1`. Set state to "turning".

## Instruction: Next turn
**Condition:** MEMORY state is "turning" and `./scoped/turns.md` contains an integer less than 6 AND the transcript's last turn does not contain the literal word `FINAL:`
**Action:** Read `./scoped/turns.md` and `./scoped/transcript.md`. Pick the next participant by rotation: the next speaker is `participants[(turns) % len(participants)]`. Produce a turn responding to the prior speaker, staying on the topic. Append surgically:

    echo "### Turn <N+1> — <speaker>" >> ./scoped/transcript.md
    echo "<turn body>"                >> ./scoped/transcript.md

Overwrite `./scoped/turns.md` with the incremented number. If convergence is reached (participants agree, or one emits `FINAL:` prefixed with the consensus artefact), set state to "decide_accept". Otherwise stay in "turning".

## Instruction: Turn limit
**Condition:** MEMORY state is "turning" and `./scoped/turns.md` contains 6 or more
**Action:** Set state to "decide_accept" (hard cap to prevent infinite dialogue).

## Instruction: Accept via evaluate
**Condition:** MEMORY state is "decide_accept" and `{{acceptance}}` has the literal value `true`
**Action:** Extract the consensus artefact from the tail of `./scoped/transcript.md` (the `FINAL:` block if present, or the last speaker's turn otherwise) into a short `attempt` string. Use `{{topic}}` as the `criterion`. Append to `./MEMORY.md`:

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
**Action:** Extract the consensus artefact from the transcript. Append to `./MEMORY.md`:

    ## Return
    dialogue_output: |
      <consensus artefact body, indented two spaces>

Remove `## Verdict` and `## Feedback` from MEMORY. Set state to "done". (The strategy that called dialogue.md will splice `## Dialogue Output` and can rename/route it as needed.)

## Instruction: Return without evaluate
**Condition:** MEMORY state is "decide_accept" and `{{acceptance}}` has any value other than the literal `true` (including absent)
**Action:** Extract the consensus artefact from the transcript. Append to `./MEMORY.md`:

    ## Return
    dialogue_output: |
      <consensus artefact body, indented two spaces>

Set state to "done".
