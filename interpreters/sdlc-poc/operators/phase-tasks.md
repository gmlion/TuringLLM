# Operator: Phase — Tasks

IMPORTANT: This operator file is the canonical phase shim. Do not modify it via update_instructions; it is only loaded at push-time.

Receives push-args: none. Reads PROGRAM.md plus 01, 02, 03 directly.

Produces: `## State done` + `## Return` with key `artefact` (`../../workspace/04-tasks.md`).

This shim runs Phase 4. Per-story orchestration:

1. Parse story IDs from `../../workspace/03-backlog.md` into `./scoped/story-queue.md`.
2. **For each story (loop):**
   - Push `tackle.md` (engineer role, story body as goal) → emits task block as `## Answer`.
   - Push `dialogue.md` with `engineer,qa`, `acceptance: true` → refines that block; consensus body written to `../../workspace/.sdlc/current-story-tasks.md`.
   - Append the consensus body to `./scoped/all-tasks.md`.
3. After all stories: assemble `./scoped/all-tasks.md` into `../../workspace/04-tasks.md`, push `cove.md` for cross-cut verification (no orphan T#, every Test-matrix row expanded, dependency claims plausible).
4. Write the revised body and finish.

Scoped files:
- `./scoped/story-queue.md` — rows `<story-id>|<status>` (pending|done). Surgical sed updates after creation.
- `./scoped/current-story.md` — id of the story currently being processed.
- `./scoped/all-tasks.md` — accumulated task blocks across stories.

## Instruction: Initialize — parse story queue
**Condition:** MEMORY state is "empty"
**Action:** Parse all `##### E1.F1.S1: ...` headers from the backlog. The S# regex is `^##### E[0-9]+\.F[0-9]+\.S[0-9]+:` — capture just the ID (the token after the five hashes and before the colon).

    mkdir -p ./scoped
    : > ./scoped/all-tasks.md
    awk '
      /^##### E[0-9]+\.F[0-9]+\.S[0-9]+:/ {
        # Strip the leading "##### " and trailing ": <title>..."
        sub(/^##### /, "")
        sub(/:.*$/, "")
        printf "%s|pending\n", $0
      }
    ' ../../workspace/03-backlog.md > ./scoped/story-queue.md

If the queue is empty (no stories parsed), the backlog must be malformed; fail loud by setting state to a diagnostic. Otherwise transition to `story_iterating`.

    if [ ! -s ./scoped/story-queue.md ]; then
      cat > ./MEMORY.md << 'ERREOF'
    ## State
    done
    ## Matched Instruction
    Initialize — parse story queue
    ## Last Action
    No story IDs found in ../../workspace/03-backlog.md; cannot produce tasks.
    ## Result
    Tasks phase aborted: empty story queue.
    ## Return
    artefact: |
      (no tasks file produced — backlog had no S# headers)
    verdict: fail
    feedback: |
      The backlog at ../../workspace/03-backlog.md contains no `##### E#.F#.S#:` headers. The backlog phase must produce at least one story before tasks can run.
    ERREOF
    else
      cat > ./MEMORY.md << 'MEM_EOF'
    ## State
    story_iterating
    ## Matched Instruction
    Initialize — parse story queue
    ## Last Action
    Parsed story queue from backlog.
    ## Result
    Story queue staged at ./scoped/story-queue.md.
    MEM_EOF
    fi

## Instruction: Iterate stories — push next tackle or finalize
**Condition:** MEMORY state is "story_iterating"
**Action:** Find the first `pending` row in the queue. If one exists, stage it and push `tackle.md`. If none, assemble the accumulated tasks into the workspace artefact and advance to CoVe.

    NEXT=$(grep '|pending$' ./scoped/story-queue.md | head -n 1 || true)
    if [ -n "$NEXT" ]; then
      STORY_ID=$(echo "$NEXT" | cut -d'|' -f1)
      echo "$STORY_ID" > ./scoped/current-story.md
      cat > ./MEMORY.md << MEM_EOF
    ## State
    tackling
    ## Matched Instruction
    Iterate stories — push tackle
    ## Last Action
    Pushed tackle.md to decompose story ${STORY_ID} into tasks.
    ## Result
    Tackling ${STORY_ID}.
    ## Push
    operators/tackle.md
    ## Push-Args
    goal: |
      Produce a TDD-shaped task block for story ${STORY_ID} from ../../workspace/03-backlog.md.

      INPUTS — read at the start:
        - ../../workspace/03-backlog.md (find the section starting "##### ${STORY_ID}:" and read its Given/When/Then AC + Satisfies R#)
        - ../../workspace/02-design.md (architecture + Test matrix; identify the matrix rows that map to this story's R#)
        - ../../workspace/01-requirements.md (R# bodies)
        - ../../PROGRAM.md (POC name + constraints, especially the tech stack)
        - ../../workspace/.sdlc/tasks-refinement-note.md (if NON-EMPTY, apply it)

      OUTPUT — emit a markdown block that begins with a story header and lists one or more tasks. Tasks within a story are numbered locally (T1, T2, ...); they will be renumbered globally by the consensus dialogue. Schema:

          <!-- BEGIN STORY ${STORY_ID} -->

          ### Story ${STORY_ID} — <story title>

          #### T1: <task title>
          - **Story:** ${STORY_ID}
          - **Satisfies:** R#
          - **Property anchored:** P# (if applicable)
          - **Files:**
            - Create: <paths>
            - Modify: <paths>
            - Test: <paths>

          ##### 1.1 Write the failing test
          - [ ] Step 1: Write the failing test
            - Test category: Unit | Integration | Property-based
            - Correctness property: P# (if applicable)
            - Expected failure: <exact assertion or message>
          - [ ] Step 2: Run test to verify it fails
            - Command: <exact command>
            - Expected output: <expected failure output>

          ##### 1.2 Commit the failing test (red)
          - [ ] Step 3: Commit
            - Message: \`test(T1): <subject>\`
            - The commit must include the new/modified test file(s) only, not implementation.

          ##### 1.3 Implement
          - [ ] Step 4: Write minimal implementation
          - [ ] Step 5: Run test to verify it passes
            - Command: <exact command>
            - Expected output: <expected passing output>

          ##### 1.4 Commit the passing implementation (green)
          - [ ] Step 6: Commit
            - Message: \`feat(T1): <subject>\`

          #### T2: ...

          <!-- END STORY ${STORY_ID} -->

      RULES:
        - Every task produces exactly one red commit and one green commit, in that order.
        - Red commit contains only test files; green commit contains only implementation.
        - Every file path and every command must be real and consistent with the design.
        - At least one task per Test-matrix row that maps to this story's R#.
        - No "TODO" / "see prior task" / vague guidance.

      Your ## Answer must be the FULL story block, verbatim, between the BEGIN/END markers.
    original_goal: |
      Produce a complete tasks artefact for the POC.
    parent_chain: |
      (this is one story of the backlog; siblings will be tackled by sibling pushes)
    role: |
      an engineer producing TDD-shaped task blocks from a user story
    MEM_EOF
    else
      # All stories tackled — assemble accumulated tasks and push CoVe
      POC_NAME=$(awk '/^# POC: /{sub(/^# POC: /, ""); print; exit}' ../../PROGRAM.md)
      mkdir -p ../../workspace
      {
        echo "# Tasks: ${POC_NAME}"
        echo ""
        echo "## Index"
        echo "(populated by the consensus pass — global T# numbering)"
        echo ""
        cat ./scoped/all-tasks.md
      } > ../../workspace/04-tasks.md

      DRAFT_BODY=$(sed 's/^/  /' ../../workspace/04-tasks.md)
      cat > ./MEMORY.md << MEM_EOF
    ## State
    cove_verifying
    ## Matched Instruction
    Iterate stories — finalize and push CoVe
    ## Last Action
    All stories tackled; pushed cove.md for cross-cut verification of the assembled tasks file.
    ## Result
    CoVe verification initiated.
    ## Push
    operators/cove.md
    ## Push-Args
    task: |
      Verify and finalize the assembled tasks artefact.

      The draft (prior_answer) is the assembled task blocks across all stories, with locally-numbered T#s.

      The revised output MUST:
        1. Renumber every task globally as T1, T2, T3, ... (in encounter order). Update every reference (Story line, Index, commit messages).
        2. Verify every Test-matrix row in ../../workspace/02-design.md that traces to a story's R# is expanded into at least one explicit task in the file.
        3. Verify every task has exactly one red commit (test file only) and exactly one green commit (implementation only), in that order.
        4. Verify every file path named exists in the design's component layout (or is clearly being created by the task).
        5. Build the "## Index" table at the top: one row per task with columns T#, Title, Story, Satisfies, Files.

      Verification questions decomposed by cove.md should target individual T# entries — does this task's Story id exist in 03-backlog.md? Does its R# exist in 01-requirements.md? Are the commands plausible given the design?

      Each independent answerer reads 01, 02, 03 via bash. The answerer does not see the tasks draft.
    prior_answer: |
${DRAFT_BODY}
    MEM_EOF
    fi

## Instruction: Tackle done — append and loop
**Condition:** MEMORY state is "tackling_completed" and `## Answer` is present
**Action:** Append the story's task block to `./scoped/all-tasks.md`, prune the splice, mark the story done, and return to iteration.

    STORY_ID=$(cat ./scoped/current-story.md)
    awk '/^## Answer$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md >> ./scoped/all-tasks.md
    echo "" >> ./scoped/all-tasks.md
    awk -v sid="$STORY_ID" -F '|' 'BEGIN{OFS="|"} $1==sid {$2="done"} {print}' ./scoped/story-queue.md > ./scoped/story-queue.md.tmp && mv ./scoped/story-queue.md.tmp ./scoped/story-queue.md
    awk 'BEGIN{f=0} /^## (Answer|Refined|Revised|Result)$/{f=1; next} /^## [A-Z]/ && f {f=0} !f' ./MEMORY.md > ./MEMORY.md.tmp && mv ./MEMORY.md.tmp ./MEMORY.md
    sed -i 's/^tackling_completed$/story_iterating/' ./MEMORY.md

## Instruction: Finish
**Condition:** MEMORY state is "cove_verifying_completed" and `## Answer` is present
**Action:** The CoVe operator returned the renumbered + verified tasks via `## Return answer:`. Write it to `../../workspace/04-tasks.md` and return.

    awk '/^## Answer$/{f=1; next} /^## [A-Z]/ && f {exit} f' ./MEMORY.md > ../../workspace/04-tasks.md

    cat > ./MEMORY.md << 'FINEOF'
    ## State
    done
    ## Matched Instruction
    Finish
    ## Last Action
    Wrote verified tasks artefact to ../../workspace/04-tasks.md.
    ## Result
    Phase Tasks complete.
    ## Return
    artefact: |
      ../../workspace/04-tasks.md
    FINEOF

# Sub-instructions

(none — this operator needs none.)
