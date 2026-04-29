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

# Sub-instructions

(none — this interpreter needs none.)
