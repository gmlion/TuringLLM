# Strategy: Multi-Agent Debate

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

This interpreter implements Multi-Agent Debate (Du et al., 2023; patterns.md Group 4 — Peer Collaboration). The strategy is a round coordinator over R rounds × N personas. Each opinion is dispatched via a three-cycle **stage / push / absorb** pattern, plus a dedicated round-transition cycle at every round boundary. Strict round isolation is enforced: when dispatching opinion K of round R, the `transcript` push-arg passed to `opine.md` contains opinions only from rounds 1..R−1 — never siblings in round R. After R rounds, one inline concluding cycle synthesises the full transcript into `## Final Position`.

Scoped files (in this strategy frame's `./scoped/`):

- `./scoped/question.md` — the question (free-form prose), parsed once at Initialize
- `./scoped/rounds.md` — single integer R (defaults to 3)
- `./scoped/personas.md` — N persona blocks of the form `### <name>\n<description>\n\n`
- `./scoped/N.md` — single integer (count of personas), precomputed for absorb routing
- `./scoped/round.md` — current round (1-indexed)
- `./scoped/agent.md` — current agent within the round (0-indexed)
- `./scoped/transcript.md` — cumulative log of all opinions; surgical appends only
- `./scoped/round-1.md` … `./scoped/round-{R}.md` — per-round snapshots; built incrementally during the round; surgical appends only
- `./scoped/staged/{round,persona_name,persona_description,question,transcript}.md` — push-arg staging files; overwritten each Stage cycle

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read `../../PROGRAM.md`. Extract three things:

1. **The question** — the prose stating what is being debated.
2. **The round count R** — if PROGRAM.md mentions an explicit number of rounds, use that. Otherwise default to R = 3.
3. **The personas** — a list of named experts, each with a description of their priorities/background. Look for `### <name>` headers, "Three experts: …" prose, or any naturally-named cast.

Validate: there must be at least two distinct personas. If fewer than two are named, append a non-blocking question and pause (R3):

    cat > ./MEMORY.md << 'INIT_FAIL_EOF'
    ## State
    waiting_for_user
    ## Matched Instruction
    Initialize (insufficient personas)
    ## Last Action
    PROGRAM.md does not name at least two personas; pausing for input.
    ## Result
    Awaiting personas.
    ## Pending Questions
    - Q1: Please name at least two distinct personas with descriptions for the debate (e.g. "DBA: cares about ..." and "App Dev: cares about ...").
    INIT_FAIL_EOF

Otherwise, persist parsed values to scoped files and initialize counters:

    mkdir -p ./scoped/staged

    cat > ./scoped/question.md << 'TURING_DEBATE_QUESTION_EOF_5a8f3c'
    <verbatim question prose extracted from PROGRAM.md>
    TURING_DEBATE_QUESTION_EOF_5a8f3c

    echo 3 > ./scoped/rounds.md   # OR the explicit R from PROGRAM.md if specified

    cat > ./scoped/personas.md << 'TURING_DEBATE_PERSONAS_EOF_5a8f3c'
    ### <name1>
    <description1, possibly multi-line>

    ### <name2>
    <description2>

    ### <name3>
    <description3>
    TURING_DEBATE_PERSONAS_EOF_5a8f3c

    grep -c '^### ' ./scoped/personas.md > ./scoped/N.md
    echo 1 > ./scoped/round.md
    echo 0 > ./scoped/agent.md
    : > ./scoped/transcript.md

Then wholesale-rewrite MEMORY:

    cat > ./MEMORY.md << 'INIT_OK_EOF'
    ## State
    dispatch_stage
    ## Matched Instruction
    Initialize
    ## Last Action
    Parsed PROGRAM.md; wrote scoped/{question,rounds,personas,N,round,agent}.md and initialized scoped/transcript.md.
    ## Result
    Initialization complete; ready to dispatch round 1, agent 0.
    INIT_OK_EOF

## Instruction: Stage
**Condition:** MEMORY state is "dispatch_stage"
**Action:** Compute the push-args for the next opine.md push and stage them as files under `./scoped/staged/`. Do NOT emit a `## Push` block this cycle — that is the next cycle's job.

    r=$(cat ./scoped/round.md)
    k=$(cat ./scoped/agent.md)
    target=$((k + 1))   # 1-indexed for awk

    # Extract the target-th persona block ("### name\n<description until next ### or EOF>").
    awk -v target=$target '
      /^### / {
        count++
        if (count == target) { in_block = 1; print; next }
        if (count > target) { in_block = 0; exit }
      }
      in_block { print }
    ' ./scoped/personas.md > ./scoped/staged/_persona_block.md

    head -n 1 ./scoped/staged/_persona_block.md | sed 's/^### //' > ./scoped/staged/persona_name.md
    tail -n +2 ./scoped/staged/_persona_block.md > ./scoped/staged/persona_description.md
    rm -f ./scoped/staged/_persona_block.md

    echo "$r" > ./scoped/staged/round.md
    cp ./scoped/question.md ./scoped/staged/question.md

    # Build the prior-rounds transcript. Loop bound is strictly less than r — the in-progress
    # current round is deliberately excluded (R5 strict round isolation).
    if [ "$r" -eq 1 ]; then
      printf '%s\n' '(none — round 1)' > ./scoped/staged/transcript.md
    else
      : > ./scoped/staged/transcript.md
      i=1
      while [ "$i" -lt "$r" ]; do
        cat ./scoped/round-$i.md >> ./scoped/staged/transcript.md
        i=$((i + 1))
      done
    fi

Then wholesale-rewrite MEMORY:

    cat > ./MEMORY.md << 'STAGE_EOF'
    ## State
    dispatch_push
    ## Matched Instruction
    Stage
    ## Last Action
    Staged push-args for round $r, agent $k.
    ## Result
    Ready to push opine.md.
    STAGE_EOF

## Instruction: Push
**Condition:** MEMORY state is "dispatch_push"
**Action:** Emit the static-template MEMORY rewrite that pushes `opine.md`. Bash variable substitution interpolates the staged values into the heredoc (the `MEM_EOF` delimiter is unquoted, so `$VAR` is expanded; bash variable expansion is one-shot — values containing `$`, backticks, etc. become literal text in the output, not re-evaluated). The heredoc text itself is invariant across pushes.

    ROUND=$(cat ./scoped/staged/round.md)
    PERSONA_NAME=$(cat ./scoped/staged/persona_name.md)
    PERSONA_DESC=$(sed 's/^/  /' ./scoped/staged/persona_description.md)
    QUESTION=$(sed 's/^/  /' ./scoped/staged/question.md)
    TRANSCRIPT=$(sed 's/^/  /' ./scoped/staged/transcript.md)

    cat > ./MEMORY.md << MEM_EOF
    ## State
    dispatching
    ## Matched Instruction
    Push
    ## Last Action
    Pushed opine.md for $PERSONA_NAME in round $ROUND.
    ## Result
    Push queued.
    ## Push
    dynamics/opine.md
    ## Push-Args
    round: $ROUND
    persona_name: $PERSONA_NAME
    persona_description: |
    $PERSONA_DESC
    question: |
    $QUESTION
    transcript: |
    $TRANSCRIPT
    MEM_EOF

The state value `dispatching` is what the shell stores as the returnState; on pop it becomes `dispatching_completed`, which `Absorb` matches.

## Instruction: Absorb
**Condition:** MEMORY state is "dispatching_completed" and `## Opinion` is present
**Action:** Extract the returned opinion from MEMORY's `## Opinion` section, surgically append it to the cumulative transcript and to the per-round snapshot, advance the agent counter, then route based on whether more agents remain in this round.

    r=$(cat ./scoped/round.md)
    k=$(cat ./scoped/agent.md)
    name=$(cat ./scoped/staged/persona_name.md)
    N=$(cat ./scoped/N.md)

    awk '/^## Opinion$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md > ./scoped/_last_opinion.txt

    {
      echo ""
      echo "### Round $r — $name"
      cat ./scoped/_last_opinion.txt
    } >> ./scoped/transcript.md

    {
      echo ""
      echo "### Round $r — $name"
      cat ./scoped/_last_opinion.txt
    } >> ./scoped/round-$r.md

    new_k=$((k + 1))
    echo "$new_k" > ./scoped/agent.md

    if [ "$new_k" -lt "$N" ]; then
      NEXT_STATE=dispatch_stage
    else
      NEXT_STATE=round_transition
    fi

    cat > ./MEMORY.md << ABSORB_EOF
    ## State
    $NEXT_STATE
    ## Matched Instruction
    Absorb
    ## Last Action
    Absorbed opinion for $name in round $r; advanced agent to $new_k; routing to $NEXT_STATE.
    ## Result
    Opinion appended to transcript and round-$r snapshot.
    ABSORB_EOF

R7 is satisfied because the absorb cycle that handles agent K = N writes the final entry to `./scoped/round-$r.md` BEFORE setting state to `round_transition` — by the time `Stage` runs again for round r+1, the snapshot is complete on disk.

# Sub-instructions

(none — this interpreter needs none.)
