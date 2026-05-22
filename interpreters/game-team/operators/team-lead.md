# Operator: Team Lead (Game Development)

IMPORTANT: This operator file is the canonical strategy. Do not modify it via update_instructions; it is only loaded at push-time.

Receives push-args:
  - `{{task}}` — the game brief (PROGRAM.md content at bootstrap-load).
  - `{{prior_answer}}` — unused (empty at bootstrap).

Produces: `## State done` + `## Return` block with key `summary` (the project summary).

This operator orchestrates a small game-development team. AI roles live under `../../roles/`. The human user is the senior member — consulted on design / product calls, never on internal implementation details. Sub-operators handle multi-role consultation and per-feature implementation:
  - `operators/consult-role.md` — push to consult one AI role; returns its `opinion`.
  - `operators/implement-feature.md` — implementation + headless verification; returns `outcome`.

Scoped state:
  - `./scoped/feature_backlog.md` — ordered list of `- F<N>: <feature>; <status>` lines (status: `pending`, `discussing`, `implementing`, `done`, `dropped`). **Surgical edits only** (`sed -i`, `echo >>`); never wholesale-rewrite.
  - `./scoped/current_feature.md` — current F# being worked.
  - `./scoped/opinions.md` — accumulated role opinions for the current feature (`- <role>: <opinion>`); reset between features. **Surgical edits only.**
  - `./scoped/implementation_plan.md` — current feature's synthesized plan (single blob, wholesale rewrite OK).
  - `./scoped/completed.md` — append-only `- F<N>: <feature> (verified <date>)` log. **Surgical edits only.**

## Instruction: Bootstrap
**Condition:** MEMORY state is "empty"
**Action:** Read the game brief from the `{{task}}` section below. Decompose into an initial feature backlog: identify 3-8 concrete features that together satisfy the brief's acceptance criteria. Order them so foundational features (engine setup, game loop, base rendering) come before content features (levels, art, polish).

Write the backlog wholesale (first-time creation only) using `cat > ./scoped/feature_backlog.md << EOF`:

    - F1: <foundational feature>; pending
    - F2: <next feature>; pending
    ...

Write the game brief verbatim to `./scoped/game_brief.md` (single blob, wholesale-rewrite OK so role files can re-read it later without re-substituting `{{task}}`). Create empty `./scoped/opinions.md`, `./scoped/completed.md`. Set MEMORY state to "planning".

Game brief (substituted at push-time):
{{task}}

## Instruction: Plan — pick next feature
**Condition:** MEMORY state is "planning"
**Action:** Read `./scoped/feature_backlog.md`. Find the FIRST line whose status is the literal word `pending`. Extract its F# into `./scoped/current_feature.md` (just the F# id, e.g. `F2`). Reset `./scoped/opinions.md` to empty (`: > ./scoped/opinions.md`). Surgically mark that bullet as `discussing` via `sed -i`:

    sed -i '0,/^- \(F[0-9]\+\):.*pending$/{s/pending$/discussing/}' ./scoped/feature_backlog.md

If no pending bullets remain, set MEMORY state to "finishing" instead.

Otherwise set MEMORY state to "consulting" and stage the first consultation. Decide which roles to consult based on the feature's nature — the rule of thumb:
  - foundational engine/setup features → `architect`, `developer`
  - gameplay/mechanics features → `game-designer`, `developer`
  - art/visual features → `artist-2d`, `ui-ux`, `game-designer`
  - UI/interaction features → `ui-ux`, `game-designer`, `developer`

Write the chosen roles to `./scoped/roles_to_consult.md`, one per line. Pick the FIRST role and append to MEMORY a push of `consult-role.md`:

    ## Push
    operators/consult-role.md
    ## Push-Args
    role: <first role name, no quotes>
    feature: |
      <verbatim feature description from the backlog bullet, two-space indented>
    brief_path: |
      ./scoped/game_brief.md

Do not change state — the shell sets state to "empty" on push and to "consulting_completed" on pop.

## Instruction: Absorb opinion, consult next
**Condition:** MEMORY state is "consulting_completed" and `## Popped Return` is present in MEMORY with a `role` key and an `opinion` key
**Action:** Read the `role` and `opinion` values from inside `## Popped Return`. Append the opinion surgically to `./scoped/opinions.md`:

    ROLE=$(awk '
      /^## Popped Return$/ { in_pr=1; next }
      in_pr && /^## / { exit }
      in_pr && /^role: / { sub(/^role: /, ""); print; exit }
    ' ./MEMORY.md)
    OPINION=$(awk '
      /^## Popped Return$/ { in_pr=1; next }
      in_pr && /^## / { exit }
      in_pr && /^opinion: \|$/ { in_v=1; next }
      in_pr && in_v && /^[a-zA-Z_]/ { exit }
      in_pr && in_v { sub(/^  /, ""); print }
    ' ./MEMORY.md | tr '\n' ' ' | sed 's/  */ /g; s/^ *//; s/ *$//')
    echo "- ${ROLE}: ${OPINION}" >> ./scoped/opinions.md

Surgically remove the consulted role from `./scoped/roles_to_consult.md`:

    sed -i "/^${ROLE}$/d" ./scoped/roles_to_consult.md

Then prune `## Popped Return` from MEMORY:

    awk 'BEGIN{f=0} /^## Popped Return$/{f=1; next} /^## [A-Z]/ && f {f=0} !f' ./MEMORY.md > ./MEMORY.md.tmp && mv ./MEMORY.md.tmp ./MEMORY.md

If `./scoped/roles_to_consult.md` is now empty (no more roles to consult), set MEMORY state to "synthesizing". Otherwise pick the FIRST remaining role and append another push (same shape as the previous Plan instruction's push block); do not change state.

## Instruction: Synthesize implementation plan
**Condition:** MEMORY state is "synthesizing"
**Action:** Read `./scoped/opinions.md` (all gathered role opinions) and `./scoped/current_feature.md` (the F# id) and `./scoped/feature_backlog.md` (look up the F#'s description). Read PROGRAM.md from `../../PROGRAM.md` for project context.

Now decide whether to consult the user. If the feature involves a design/product decision (look-and-feel, scope trade-off, content choice — anything where reasonable people would disagree based on taste rather than technique), append ONE pending question to `## Pending Questions` in MEMORY. **Do NOT set state to "waiting_for_user".** Phrase the question in the user's terms (game feel, player experience, visual style) — never about implementation details. Add the question non-blocking; the user's answer (if it arrives later in `## Answers`) will be visible to the next Synthesize cycle.

Synthesize a concrete implementation plan into `./scoped/implementation_plan.md` (wholesale `cat > ./scoped/implementation_plan.md << EOF` is fine — the plan is a single blob). The plan must be:
  - 3-8 concrete steps that a developer can execute
  - Headlessly verifiable (build succeeds, syntax checks pass, scripts run, a test outputs the expected value)
  - Honest about what cannot be verified headlessly (e.g. "the visual output looks correct" — flag this as needing a user check post-implementation, not as a blocker)

If `## Answers` has new user input relevant to this feature, fold it into the plan and remove the consumed answers from `## Answers` and the corresponding items from `## Pending Questions` via in-place edits to MEMORY.

Set MEMORY state to "implementing".

## Instruction: Push implementation
**Condition:** MEMORY state is "implementing"
**Action:** Read `./scoped/implementation_plan.md`. Look up the current feature's text in `./scoped/feature_backlog.md` (the F# id is in `./scoped/current_feature.md`). Surgically mark the backlog bullet as `implementing`:

    sed -i "0,/^- $(cat ./scoped/current_feature.md):.*discussing$/{s/discussing$/implementing/}" ./scoped/feature_backlog.md

Append to MEMORY a push of `implement-feature.md`:

    ## Push
    operators/implement-feature.md
    ## Push-Args
    feature: |
      <verbatim feature description from the backlog bullet, two-space indented>
    implementation_plan: |
      <verbatim contents of ./scoped/implementation_plan.md, every line indented two spaces>

Do not change state — the shell sets it to "empty" on push and "implementing_completed" on pop.

## Instruction: Absorb implementation outcome
**Condition:** MEMORY state is "implementing_completed" and `## Popped Return` is present in MEMORY with an `outcome` key
**Action:** Read the `outcome` value (literal `done` or `fail`) and `notes` value from inside `## Popped Return`.

    OUTCOME=$(awk '
      /^## Popped Return$/ { in_pr=1; next }
      in_pr && /^## / { exit }
      in_pr && /^outcome: / { sub(/^outcome: /, ""); print; exit }
    ' ./MEMORY.md | tr -d ' ')
    NOTES=$(awk '
      /^## Popped Return$/ { in_pr=1; next }
      in_pr && /^## / { exit }
      in_pr && /^notes: \|$/ { in_v=1; next }
      in_pr && in_v && /^[a-zA-Z_]/ { exit }
      in_pr && in_v { sub(/^  /, ""); print }
    ' ./MEMORY.md)
    FID=$(cat ./scoped/current_feature.md)
    TS=$(date -u +%FT%TZ 2>/dev/null || date)

If `OUTCOME` is `done`:
  - Surgically mark the backlog bullet for `${FID}` as `done`:
    `sed -i "0,/^- ${FID}:.*implementing$/{s/implementing$/done/}" ./scoped/feature_backlog.md`
  - Append to the completed log:
    `echo "- ${FID}: $(grep "^- ${FID}:" ./scoped/feature_backlog.md | sed 's/^- [^:]*: //' | sed 's/; done$//') (verified ${TS})" >> ./scoped/completed.md`
  - Set MEMORY state to "planning" (loop back to pick next feature).

If `OUTCOME` is `fail`:
  - Surgically mark the backlog bullet for `${FID}` back to `pending` so it can be retried, AND append a non-blocking note about the failure to `## Pending Questions` in MEMORY so the user can intervene if the loop spins:
    `sed -i "0,/^- ${FID}:.*implementing$/{s/implementing$/pending/}" ./scoped/feature_backlog.md`
  - Count failures: `grep -c "^- F[0-9]\+: ${FID} failed:" ./scoped/feature_backlog.md.failures 2>/dev/null || echo 0` then increment; if >= 3 attempts, drop the feature (mark `dropped` instead of `pending`) and log to `./scoped/completed.md` as a drop reason.
  - Set MEMORY state to "planning".

Prune the `## Popped Return` section from MEMORY:

    awk 'BEGIN{f=0} /^## Popped Return$/{f=1; next} /^## [A-Z]/ && f {f=0} !f' ./MEMORY.md > ./MEMORY.md.tmp && mv ./MEMORY.md.tmp ./MEMORY.md

## Instruction: Finish
**Condition:** MEMORY state is "finishing"
**Action:** All features have been resolved (done or dropped). Build the final summary from `./scoped/completed.md` and `./scoped/feature_backlog.md`. Write `./MEMORY.md` with the FULL done state in a SINGLE heredoc (the `## Return` block MUST be in the same heredoc as the state change — at depth>=1 the shell pops on state is "done" BEFORE any subsequent instruction runs):

    BACKLOG=$(cat ./scoped/feature_backlog.md)
    COMPLETED=$(cat ./scoped/completed.md)
    cat > ./MEMORY.md << FINEOF
    ## State
    done
    ## Matched Instruction
    Finish
    ## Last Action
    All features resolved; writing project summary to ## Return.
    ## Result
    Game development run complete.
    ## Return
    summary: |
      ## Final backlog
    $(echo "${BACKLOG}" | sed 's/^/      /')

      ## Completed log
    $(echo "${COMPLETED}" | sed 's/^/      /')

      Workspace under ../../workspace/ contains the built game artifacts.
    FINEOF
