# Operator: SDLC Orchestrator

IMPORTANT: This operator file is the canonical strategy. Do not modify it via update_instructions; it is only loaded at push-time.

Receives push-args:
  - `{{task}}` — the user's PROGRAM.md content (POC name + source-document list + constraints). Substituted at root bootstrap.
  - `{{prior_answer}}` — empty at root bootstrap.

Produces: `## State done` + `## Return` block with key `answer`. Halts when the user approves at the final phase gate or types `cancel` at any gate.

This is the root strategy of the SDLC POC interpreter. It runs six phases in sequence (Summarise → Requirements → Design → Backlog → Tasks → Plan), opening a user-approval gate after each phase. Inside each phase, the work is delegated to a phase-specific shim (`operators/phase-<name>.md`) which composes existing MAS operators (`dialogue.md` for multi-role debate, `plan-execute.md` / `tackle.md` for decomposition, `cove.md` for fact-grounding, `evaluate.md` for acceptance).

**Two-cycle phase transitions** (ChatDev pattern): every transition that emits a `## Push` template is split across two cycles. The first cycle prunes the popped child's return-spliced sections and parks at an intermediate `*_pushing` state; the second cycle wholesale-rewrites MEMORY with a *fully static* push template (no LLM-side substitution from prior MEMORY). This avoids the failure mode where the LLM narrates a push while skipping the textual emission.

**Cross-frame staging.** All inter-frame state lives under `../../workspace/.sdlc/`:
- `../../workspace/.sdlc/<phase>-refinement-note.md` — user's refinement note for that phase, written when the user types `refine: <note>` at the phase's gate; truncated to empty when the phase is run fresh. Phase shims read this file at start to decide whether they are doing a fresh run or a refinement.
- `../../workspace/.sdlc/last-artefact.md` — path of the most recently completed artefact (for the gate question).

**Local scoped state** (in this orchestrator's frame's `./scoped/`):
- `./scoped/gate.md` — current phase name (`summarise` | `requirements` | `design` | `backlog` | `tasks` | `plan`), updated as the orchestrator advances.

The six phases, in order:

| #  | Phase         | Shim                       | Artefact                                          |
| -- | ------------- | -------------------------- | ------------------------------------------------- |
| 0  | Summarise     | operators/phase-summarise.md     | ../../workspace/00-system-summary.md       |
| 1  | Requirements  | operators/phase-requirements.md  | ../../workspace/01-requirements.md         |
| 2  | Design        | operators/phase-design.md        | ../../workspace/02-design.md + 02-adr/*.md |
| 3  | Backlog       | operators/phase-backlog.md       | ../../workspace/03-backlog.md              |
| 4  | Tasks         | operators/phase-tasks.md         | ../../workspace/04-tasks.md                |
| 5  | Plan          | operators/phase-plan.md          | ../../workspace/05-plan.md                 |

User gate verbs (typed in answer to the `## Pending Questions` prompt):
- `approve` — advance to next phase (or halt with success on the Plan gate).
- `refine: <note>` (or `refine <note>`) — re-run current phase with the note written to `<phase>-refinement-note.md`.
- `cancel` — stop; preserve `workspace/`; write OUTPUT diagnostic.
- Anything else — treated as implicit `refine: <verbatim text>`.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Set up scratch directory and refinement-note files, then park at the first push state.

    mkdir -p ../../workspace/.sdlc
    : > ../../workspace/.sdlc/summarise-refinement-note.md
    : > ../../workspace/.sdlc/requirements-refinement-note.md
    : > ../../workspace/.sdlc/design-refinement-note.md
    : > ../../workspace/.sdlc/backlog-refinement-note.md
    : > ../../workspace/.sdlc/tasks-refinement-note.md
    : > ../../workspace/.sdlc/plan-refinement-note.md
    echo summarise > ./scoped/gate.md

Then wholesale-rewrite MEMORY:

    cat > ./MEMORY.md << 'MEM_EOF'
    ## State
    summarise_pushing
    ## Matched Instruction
    Initialize
    ## Last Action
    Staged refinement-note files under ../../workspace/.sdlc/ and parked at summarise_pushing.
    ## Result
    Ready to push phase-summarise.md.
    MEM_EOF

Task (substituted at root bootstrap; the orchestrator does not consult this directly — phase shims read PROGRAM.md as needed):
{{task}}

Prior answer (always empty at root bootstrap):
{{prior_answer}}

## Instruction: Push summarise
**Condition:** MEMORY state is "summarise_pushing"
**Action:** Wholesale-rewrite MEMORY with the static push template for phase-summarise.md:

    cat > ./MEMORY.md << 'MEM_EOF'
    ## State
    summarise_active
    ## Matched Instruction
    Push summarise
    ## Last Action
    Pushed phase-summarise.md.
    ## Result
    Summarise phase initiated.
    ## Push
    operators/phase-summarise.md
    MEM_EOF

(Post-pop state will be "summarise_active_completed".)

## Instruction: Push requirements
**Condition:** MEMORY state is "requirements_pushing"
**Action:** Wholesale-rewrite MEMORY with the static push template for phase-requirements.md:

    cat > ./MEMORY.md << 'MEM_EOF'
    ## State
    requirements_active
    ## Matched Instruction
    Push requirements
    ## Last Action
    Pushed phase-requirements.md.
    ## Result
    Requirements phase initiated.
    ## Push
    operators/phase-requirements.md
    MEM_EOF

## Instruction: Push design
**Condition:** MEMORY state is "design_pushing"
**Action:** Wholesale-rewrite MEMORY with the static push template for phase-design.md:

    cat > ./MEMORY.md << 'MEM_EOF'
    ## State
    design_active
    ## Matched Instruction
    Push design
    ## Last Action
    Pushed phase-design.md.
    ## Result
    Design phase initiated.
    ## Push
    operators/phase-design.md
    MEM_EOF

## Instruction: Push backlog
**Condition:** MEMORY state is "backlog_pushing"
**Action:** Wholesale-rewrite MEMORY with the static push template for phase-backlog.md:

    cat > ./MEMORY.md << 'MEM_EOF'
    ## State
    backlog_active
    ## Matched Instruction
    Push backlog
    ## Last Action
    Pushed phase-backlog.md.
    ## Result
    Backlog phase initiated.
    ## Push
    operators/phase-backlog.md
    MEM_EOF

## Instruction: Push tasks
**Condition:** MEMORY state is "tasks_pushing"
**Action:** Wholesale-rewrite MEMORY with the static push template for phase-tasks.md:

    cat > ./MEMORY.md << 'MEM_EOF'
    ## State
    tasks_active
    ## Matched Instruction
    Push tasks
    ## Last Action
    Pushed phase-tasks.md.
    ## Result
    Tasks phase initiated.
    ## Push
    operators/phase-tasks.md
    MEM_EOF

## Instruction: Push plan
**Condition:** MEMORY state is "plan_pushing"
**Action:** Wholesale-rewrite MEMORY with the static push template for phase-plan.md:

    cat > ./MEMORY.md << 'MEM_EOF'
    ## State
    plan_active
    ## Matched Instruction
    Push plan
    ## Last Action
    Pushed phase-plan.md.
    ## Result
    Plan phase initiated.
    ## Push
    operators/phase-plan.md
    MEM_EOF

## Instruction: Phase completed — stage gate
**Condition:** MEMORY state is one of "summarise_active_completed", "requirements_active_completed", "design_active_completed", "backlog_active_completed", "tasks_active_completed", "plan_active_completed"
**Action:** A phase shim has popped. The shell spliced its `## Return` keys as top-level MEMORY sections (typically `## Artefact`, possibly `## Verdict` and `## Feedback`). Extract the artefact path to `../../workspace/.sdlc/last-artefact.md` so the next instruction can write a clean gate question, then prune those splice sections from MEMORY and park at the gating state.

First, extract the artefact path. The `## Artefact` body is a single line (a path); grab it:

    awk '/^## Artefact$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md > ../../workspace/.sdlc/last-artefact.md

If a `## Verdict` is present and equals `fail`, also stage `## Feedback` for inclusion in the gate question:

    if grep -q '^## Verdict$' ./MEMORY.md; then
      awk '/^## Verdict$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md > ../../workspace/.sdlc/last-verdict.md
      awk '/^## Feedback$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md > ../../workspace/.sdlc/last-feedback.md
    else
      : > ../../workspace/.sdlc/last-verdict.md
      : > ../../workspace/.sdlc/last-feedback.md
    fi

Prune the spliced sections from MEMORY:

    awk 'BEGIN{f=0} /^## (Artefact|Verdict|Feedback|Answer|Dialogue|Refined|Revised|Lesson|Lessons)$/{f=1; next} /^## [A-Z]/ && f {f=0} !f' ./MEMORY.md > ./MEMORY.md.tmp && mv ./MEMORY.md.tmp ./MEMORY.md

Transition state from `<phase>_active_completed` to `<phase>_gating` via in-place sed:

    sed -i 's/_active_completed$/_gating/' ./MEMORY.md

## Instruction: Open user gate
**Condition:** MEMORY state is one of "summarise_gating", "requirements_gating", "design_gating", "backlog_gating", "tasks_gating", "plan_gating"
**Action:** Either open a real user-approval gate (attended mode) OR auto-approve and short-circuit straight to `user_responded` (unattended mode). The mode is read from PROGRAM.md's `## Mode` section: a body of `unattended` (case-insensitive, whitespace-trimmed) means unattended; anything else — including a missing section — means attended. Run this ENTIRE block in a SINGLE bash invocation so the if/elif/else dispatches correctly:

    GATE=$(cat ./scoped/gate.md)
    ARTEFACT=$(cat ../../workspace/.sdlc/last-artefact.md)
    VERDICT=$(cat ../../workspace/.sdlc/last-verdict.md)
    FEEDBACK=$(cat ../../workspace/.sdlc/last-feedback.md)
    MODE=$(awk '/^## Mode$/{f=1; next} /^## [A-Z]/ && f {exit} f' ../../PROGRAM.md 2>/dev/null | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')

    if [ "$MODE" = "unattended" ]; then
      # Unattended mode: audit + auto-approve, skip waiting_for_user entirely.
      mkdir -p ../../workspace/.sdlc
      TS=$(date -u +%FT%TZ 2>/dev/null || date)
      printf '[%s] gate=%s verdict=%s artefact=%s\n' "$TS" "$GATE" "${VERDICT:-pass}" "$ARTEFACT" >> ../../workspace/.sdlc/unattended-log.md
      if [ "$VERDICT" = "fail" ]; then
        printf '  feedback: %s\n' "$FEEDBACK" >> ../../workspace/.sdlc/unattended-log.md
      fi
      cat > ./MEMORY.md << MEM_EOF
    ## State
    user_responded
    ## Matched Instruction
    Open user gate
    ## Last Action
    Unattended mode (PROGRAM.md "## Mode" is "unattended"): auto-approved the $GATE gate (verdict=${VERDICT:-pass}); audit appended to ../../workspace/.sdlc/unattended-log.md.
    ## Result
    Auto-approved.
    ## Answers
    approve
    MEM_EOF
    elif [ "$VERDICT" = "fail" ]; then
      # Attended mode, evaluator returned fail — include feedback in the gate question.
      cat > ./MEMORY.md << MEM_EOF
    ## State
    waiting_for_user
    ## Matched Instruction
    Open user gate
    ## Last Action
    Opened the $GATE phase gate (consensus NOT reached internally).
    ## Result
    Awaiting user verdict on $GATE.
    ## Pending Questions
    Phase '$GATE' completed WITHOUT internal consensus. Artefact written to: $ARTEFACT

    Reviewer feedback:
    $FEEDBACK

    Reply with one of:
      approve            (accept as-is; continue to next phase)
      refine: <note>     (re-run $GATE with the note applied)
      cancel             (stop and preserve the workspace)
    MEM_EOF
    else
      # Attended mode, pass verdict — normal gate question.
      cat > ./MEMORY.md << MEM_EOF
    ## State
    waiting_for_user
    ## Matched Instruction
    Open user gate
    ## Last Action
    Opened the $GATE phase gate.
    ## Result
    Awaiting user verdict on $GATE.
    ## Pending Questions
    Phase '$GATE' complete. Artefact written to: $ARTEFACT

    Reply with one of:
      approve            (continue to the next phase)
      refine: <note>     (re-run $GATE with the note applied)
      cancel             (stop and preserve the workspace)
    MEM_EOF
    fi

## Instruction: Dispatch gate verb
**Condition:** MEMORY state is "user_responded" and `## Answers` is present
**Action:** Parse the first whitespace-separated token of `## Answers` (case-insensitive) and dispatch.

Extract the answer text:

    awk '/^## Answers$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md > ../../workspace/.sdlc/last-answer.md
    ANSWER=$(cat ../../workspace/.sdlc/last-answer.md)
    VERB=$(echo "$ANSWER" | awk '{print tolower($1)}' | tr -d ':')
    GATE=$(cat ./scoped/gate.md)

Three branches:

**(a) `$VERB == "approve"`.** Advance to next phase. The mapping is `summarise→requirements→design→backlog→tasks→plan→DONE`. Update `./scoped/gate.md`, truncate the next phase's refinement-note (fresh run), and set state to `<next>_pushing`. If the current gate was `plan`, set state to `all_done` instead.

    case "$GATE" in
      summarise)    NEXT=requirements ;;
      requirements) NEXT=design ;;
      design)       NEXT=backlog ;;
      backlog)      NEXT=tasks ;;
      tasks)        NEXT=plan ;;
      plan)         NEXT=DONE ;;
    esac

If `$NEXT == DONE`:

    cat > ./MEMORY.md << 'MEM_EOF'
    ## State
    all_done
    ## Matched Instruction
    Dispatch gate verb (approve at plan)
    ## Last Action
    User approved the final (plan) gate.
    ## Result
    All six phases approved.
    MEM_EOF

Else:

    echo "$NEXT" > ./scoped/gate.md
    : > "../../workspace/.sdlc/${NEXT}-refinement-note.md"
    cat > ./MEMORY.md << MEM_EOF
    ## State
    ${NEXT}_pushing
    ## Matched Instruction
    Dispatch gate verb (approve)
    ## Last Action
    User approved the $GATE gate; advancing to $NEXT.
    ## Result
    Advancing.
    MEM_EOF

**(b) `$VERB == "cancel"`.** Set state to `cancelled`:

    cat > ./MEMORY.md << MEM_EOF
    ## State
    cancelled
    ## Matched Instruction
    Dispatch gate verb (cancel)
    ## Last Action
    User cancelled at the $GATE gate.
    ## Result
    Cancellation requested.
    MEM_EOF

**(c) Anything else (treat as refine).** If the answer begins with `refine` (case-insensitive), strip that prefix and any leading colon/whitespace to get the note. Otherwise, treat the entire answer verbatim as the note (implicit refine).

    NOTE_PRE=$(echo "$ANSWER" | sed -E 's/^[[:space:]]*[Rr][Ee][Ff][Ii][Nn][Ee][[:space:]:]*//')
    if [ "$NOTE_PRE" = "$ANSWER" ]; then
      # No "refine" prefix matched — use verbatim
      NOTE="$ANSWER"
    else
      NOTE="$NOTE_PRE"
    fi
    printf '%s\n' "$NOTE" > "../../workspace/.sdlc/${GATE}-refinement-note.md"
    cat > ./MEMORY.md << MEM_EOF
    ## State
    ${GATE}_pushing
    ## Matched Instruction
    Dispatch gate verb (refine)
    ## Last Action
    User asked to refine the $GATE phase; note written to ../../workspace/.sdlc/${GATE}-refinement-note.md.
    ## Result
    Re-running $GATE with refinement note.
    MEM_EOF

## Instruction: Finish — all phases approved
**Condition:** MEMORY state is "all_done"
**Action:** Write OUTPUT via `## Return` and set state to "done":

    cat > ./MEMORY.md << FINEOF
    ## State
    done
    ## Matched Instruction
    Finish — all phases approved
    ## Last Action
    SDLC POC pipeline completed; all six artefacts approved at their respective gates.
    ## Result
    Workspace contains the seven durable artefacts (00-system-summary, 01-requirements, 02-design, 02-adr/*, 03-backlog, 04-tasks, 05-plan).
    ## Return
    answer: |
      SDLC POC artefacts produced under ../../workspace/. All six phase gates were approved.
      Files: 00-system-summary.md, 01-requirements.md, 02-design.md, 02-adr/*.md, 03-backlog.md, 04-tasks.md, 05-plan.md.
    FINEOF

## Instruction: Finish — cancelled
**Condition:** MEMORY state is "cancelled"
**Action:** Write OUTPUT diagnostic via `## Return` and set state to "done":

    GATE=$(cat ./scoped/gate.md)
    LAST_ARTEFACT=$(cat ../../workspace/.sdlc/last-artefact.md 2>/dev/null || echo "(none)")
    cat > ./MEMORY.md << FINEOF
    ## State
    done
    ## Matched Instruction
    Finish — cancelled
    ## Last Action
    User cancelled the SDLC POC pipeline at the $GATE gate.
    ## Result
    Workspace preserved. Last completed artefact: $LAST_ARTEFACT.
    ## Return
    answer: |
      Cancelled at phase '$GATE'. Workspace preserved untouched.
      Last completed artefact: $LAST_ARTEFACT.
    FINEOF

# Sub-instructions

(none — this operator needs none.)
