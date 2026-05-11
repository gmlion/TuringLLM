# Tasks: agent-workflows-phase-5

> **For executors:** use `kiro-flow:spec-execute` (it wraps
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`).
> Each task below is TDD-shaped — write the failing test first, then minimal
> code, then verify, then commit. Commit messages must reference the task's
> `(satisfies: R#)` tag.
>
> **Test file:** all tests live in `src/test/phase-5-debate.test.ts` (new file
> in T1). Tests are file-shape (regex / structural), not LLM-driven, because
> the existing test suite has no mocked-LLM provider and adding one is out of
> scope (per `design.md` § Test strategy).
>
> **Run command for the phase-5 tests only:** `npm run build && node --test
> dist/test/phase-5-debate.test.js`. The full suite (`npm test`) is slower —
> use it only at the end.

## Task index

| #   | Summary                                                   | Satisfies                          |
| --- | --------------------------------------------------------- | ---------------------------------- |
| T1  | Scaffold `opine.md` dynamic + the test file               | R14, R15, R16, R20                 |
| T2  | Demo `PROGRAM.md` with the Postgres-vs-SQLite question    | R17                                |
| T3  | Strategy preamble + `Initialize` instruction              | R1, R2, R3, R4, R19                |
| T4  | `Stage` instruction (round-isolated transcript builder)   | R5, R6                             |
| T5  | `Push` instruction (static-template MEMORY rewrite)       | R8, R14                            |
| T6  | `Absorb` instruction (transcript append + counter route)  | R7, R9, R11                        |
| T7  | `Round transition` instruction                            | R10, R11                           |
| T8  | `Conclude` instruction (synthesis to `## Final Position`) | R12, R13                           |
| T9  | README + final integration smoke test                     | R10, R18, R20 (sweep-coverage)     |

Every R# (R1–R20 from `requirements.md`) appears in at least one task.

---

## Task 1: Scaffold `opine.md` dynamic + test file   (satisfies: R14, R15, R16, R20)

**Files:**
- Create: `interpreters/mas-papers/4-peer-collaboration/a-debate/operators/opine.md`
- Create: `src/test/phase-5-debate.test.ts`

- [ ] **Step 1: Write the failing test**

    Create `src/test/phase-5-debate.test.ts` with:

    ```ts
    import { test, describe } from "node:test";
    import { strict as assert } from "node:assert";
    import { existsSync, readFileSync, readdirSync } from "fs";
    import { resolve, dirname } from "path";
    import { fileURLToPath } from "url";

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const REPO = resolve(__dirname, "../..");
    const INTERP = resolve(REPO, "interpreters/mas-papers/4-peer-collaboration/a-debate");

    function escapeRegExp(s: string) {
      return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function extractInstructionBody(src: string, name: string): string {
      const startRe = new RegExp(`^## Instruction:\\s*${escapeRegExp(name)}\\b`, "m");
      const m = src.match(startRe);
      if (!m) return "";
      const start = m.index! + m[0].length;
      const rest = src.slice(start);
      const endRe = /^(## Instruction:|# Sub-instructions)/m;
      const e = rest.match(endRe);
      return e ? rest.slice(0, e.index!) : rest;
    }

    describe("phase-5 a-debate: opine.md dynamic (R14, R15, R16)", () => {
      test("operators/opine.md exists", () => {
        assert.ok(existsSync(resolve(INTERP, "operators/opine.md")), "opine.md missing");
      });

      test("opine.md declares all five push-arg placeholders (R14)", () => {
        const s = readFileSync(resolve(INTERP, "operators/opine.md"), "utf-8");
        for (const ph of ["{{round}}", "{{persona_name}}", "{{persona_description}}", "{{question}}", "{{transcript}}"]) {
          assert.match(s, new RegExp(escapeRegExp(ph)), `opine.md missing placeholder ${ph}`);
        }
      });

      test("opine.md is single-cycle empty -> done (R15)", () => {
        const s = readFileSync(resolve(INTERP, "operators/opine.md"), "utf-8");
        const headers = (s.match(/^## Instruction:/gm) || []);
        assert.equal(headers.length, 1, "opine.md must have exactly one instruction");
        assert.match(s, /MEMORY state is "empty"/);
        assert.match(s, /## State\s*\n\s*done/);
      });

      test("opine.md returns one key 'opinion' via ## Return (R15)", () => {
        const s = readFileSync(resolve(INTERP, "operators/opine.md"), "utf-8");
        assert.match(s, /## Return\s*\n\s*opinion:\s*\|/);
      });

      test("opine.md does not push further dynamics (R16)", () => {
        const s = readFileSync(resolve(INTERP, "operators/opine.md"), "utf-8");
        assert.doesNotMatch(s, /^## Push\s*\ndynamics\//m);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm run build && node --test dist/test/phase-5-debate.test.js`
    Expected: FAIL with "opine.md missing"

- [ ] **Step 3: Write minimal implementation**

    Create the directory and write `interpreters/mas-papers/4-peer-collaboration/a-debate/operators/opine.md`:

    ````markdown
    # Dynamic: Opine

    Receives push-args: `{{round}}`, `{{persona_name}}`, `{{persona_description}}`, `{{question}}`, `{{transcript}}`.
    Produces: `## State done` + `## Return` block with key `opinion`.

    This dynamic is invoked by the debate strategy once per (round, agent) pair. Each invocation produces ONE persona's contribution to ONE round, in isolation from siblings in the same round. The `transcript` push-arg contains opinions from rounds 1..(round−1) only — never siblings in the current round.

    ## Instruction: Speak as persona
    **Condition:** MEMORY state is "empty"
    **Action:** You ARE `{{persona_name}}` for this turn. Read your characterisation, the question, and the prior-rounds transcript below. Then form an opinion (2–5 sentences) responding to the question from your persona's perspective, addressing what other personas said in earlier rounds where present.

    Constraints:
    - Speak in `{{persona_name}}`'s voice. Do not impersonate another persona.
    - If the transcript is `(none — round 1)`, this is the first round — produce a fresh opinion without referencing prior content.
    - Otherwise, address one or more points from the prior-rounds transcript explicitly. Disagree, refine, or extend; do not merely restate.

    Write `./MEMORY.md` with this EXACT single-heredoc shape (the `## Return` block MUST be in the same heredoc as the state change — without it the shell pops with no return value, breaking the caller):

    ```
    cat > ./MEMORY.md << 'MEMEOF'
    ## State
    done
    ## Matched Instruction
    Speak as persona
    ## Last Action
    Composed opinion for {{persona_name}} in round {{round}}; popping back to coordinator.
    ## Result
    Opinion produced.
    ## Return
    opinion: |
      <your 2–5 sentence opinion in {{persona_name}}'s voice, every line indented two spaces>
    MEMEOF
    ```

    You are: `{{persona_name}}`.

    Your characterisation:
    {{persona_description}}

    The question:
    {{question}}

    Round number: `{{round}}`.

    Prior rounds (your siblings in THIS round are deliberately not visible — strict round isolation):
    {{transcript}}
    ````

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm run build && node --test dist/test/phase-5-debate.test.js`
    Expected: PASS — 5 tests under "phase-5 a-debate: opine.md dynamic"

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/4-peer-collaboration/a-debate/operators/opine.md src/test/phase-5-debate.test.ts
    git commit -m "feat(debate): scaffold opine.md dynamic and test file (satisfies: R14, R15, R16, R20)"
    ```

---

## Task 2: Demo `PROGRAM.md`   (satisfies: R17)

**Files:**
- Create: `interpreters/mas-papers/4-peer-collaboration/a-debate/PROGRAM.md`
- Modify: `src/test/phase-5-debate.test.ts`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-5-debate.test.ts`:

    ```ts
    describe("phase-5 a-debate: demo PROGRAM.md (R17)", () => {
      test("PROGRAM.md exists", () => {
        assert.ok(existsSync(resolve(INTERP, "PROGRAM.md")), "PROGRAM.md missing");
      });

      test("PROGRAM.md mentions the canonical Postgres-vs-SQLite question (R17)", () => {
        const s = readFileSync(resolve(INTERP, "PROGRAM.md"), "utf-8");
        assert.match(s, /Postgres or SQLite/i);
      });

      test("PROGRAM.md names exactly three persona blocks (R17)", () => {
        const s = readFileSync(resolve(INTERP, "PROGRAM.md"), "utf-8");
        const personaHeaders = (s.match(/^### \w/gm) || []);
        assert.equal(personaHeaders.length, 3, `expected 3 persona ### headers, found ${personaHeaders.length}`);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm run build && node --test dist/test/phase-5-debate.test.js`
    Expected: FAIL with "PROGRAM.md missing"

- [ ] **Step 3: Write minimal implementation**

    Create `interpreters/mas-papers/4-peer-collaboration/a-debate/PROGRAM.md`:

    ```markdown
    # Goal

    A small team needs a database for a CLI tool used by ~50 internal engineers to track incidents. Single-user-at-a-time access; data is mostly read-only after creation; the total dataset will not exceed 50 MB; deployed via brew/npm.

    **Question for the debate:** Postgres or SQLite for use case U?

    ## Personas

    Three experts will debate this question.

    ### DBA
    A database administrator. Cares about durability, backup procedures, monitoring, scaling characteristics, and the operational complexity of running the database in production. Has experience with both Postgres and SQLite in different settings; tends to favour solutions where operational mistakes are recoverable.

    ### App Dev
    An application developer. Cares about ergonomics for the people writing the CLI: ORM compatibility, schema-migration friction, deployment friction (does the user need to install anything?), and how fast the dev-loop is. Typically prefers solutions that don't add deployment steps for end users.

    ### SRE
    A site reliability engineer. Cares about cost, infrastructure footprint, on-call burden, and what happens when the database itself fails. Skeptical of any answer that assumes someone is watching the system 24/7.
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm run build && node --test dist/test/phase-5-debate.test.js`
    Expected: PASS — 3 new tests under "phase-5 a-debate: demo PROGRAM.md"

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/4-peer-collaboration/a-debate/PROGRAM.md src/test/phase-5-debate.test.ts
    git commit -m "feat(debate): demo PROGRAM.md with Postgres-vs-SQLite + 3 personas (satisfies: R17)"
    ```

---

## Task 3: Strategy preamble + `Initialize` instruction   (satisfies: R1, R2, R3, R4, R19)

**Files:**
- Create: `interpreters/mas-papers/4-peer-collaboration/a-debate/INSTRUCTIONS.md`
- Modify: `src/test/phase-5-debate.test.ts`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-5-debate.test.ts`:

    ```ts
    describe("phase-5 a-debate: strategy preamble + Initialize (R1-R4, R19)", () => {
      test("INSTRUCTIONS.md exists", () => {
        assert.ok(existsSync(resolve(INTERP, "INSTRUCTIONS.md")), "INSTRUCTIONS.md missing");
      });

      test("strategy is bounded by # Strategy / # Sub-instructions and is verbatim-required", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        assert.match(s, /^# Strategy/m);
        assert.match(s, /^# Sub-instructions/m);
        assert.match(s, /VERBATIM into every update_instructions call/);
      });

      test("strategy does not reference reflect.md (R19)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        assert.doesNotMatch(s, /reflect\.md/);
      });

      test("Initialize references PROGRAM.md and writes the four scoped files (R1, R4)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const init = extractInstructionBody(s, "Initialize");
        assert.match(init, /PROGRAM\.md/);
        assert.match(init, /scoped\/personas\.md/);
        assert.match(init, /scoped\/rounds\.md/);
        assert.match(init, /scoped\/question\.md/);
      });

      test("Initialize defaults R to 3 when unspecified (R2)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const init = extractInstructionBody(s, "Initialize");
        assert.match(init, /default[^.]*3/i);
      });

      test("Initialize handles fewer than two personas via Pending Questions + waiting_for_user (R3)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const init = extractInstructionBody(s, "Initialize");
        assert.match(init, /## Pending Questions/);
        assert.match(init, /waiting_for_user/);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm run build && node --test dist/test/phase-5-debate.test.js`
    Expected: FAIL with "INSTRUCTIONS.md missing"

- [ ] **Step 3: Write minimal implementation**

    Create `interpreters/mas-papers/4-peer-collaboration/a-debate/INSTRUCTIONS.md`:

    ````markdown
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
    ````

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm run build && node --test dist/test/phase-5-debate.test.js`
    Expected: PASS — 6 new tests under "phase-5 a-debate: strategy preamble + Initialize"

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/4-peer-collaboration/a-debate/INSTRUCTIONS.md src/test/phase-5-debate.test.ts
    git commit -m "feat(debate): strategy preamble + Initialize instruction (satisfies: R1, R2, R3, R4, R19)"
    ```

---

## Task 4: `Stage` instruction   (satisfies: R5, R6)

**Files:**
- Modify: `interpreters/mas-papers/4-peer-collaboration/a-debate/INSTRUCTIONS.md`
- Modify: `src/test/phase-5-debate.test.ts`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-5-debate.test.ts`:

    ```ts
    describe("phase-5 a-debate: Stage instruction (R5, R6)", () => {
      test("Stage is matched on dispatch_stage state", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const stage = extractInstructionBody(s, "Stage");
        assert.ok(stage.length > 0, "Stage instruction missing");
      });

      test("Stage uses round-1 sentinel when round == 1 (R6)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const stage = extractInstructionBody(s, "Stage");
        assert.match(stage, /\(none — round 1\)/);
      });

      test("Stage concatenates only prior-round files (R5)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const stage = extractInstructionBody(s, "Stage");
        // The loop that builds the transcript goes over rounds 1..r-1; reference to round-$i.md is required
        assert.match(stage, /round-\$i\.md|round-\${i}\.md/);
        // The loop bound is "less than r", not "less than or equal to r"
        assert.match(stage, /\[\s*"\$i"\s*-lt\s*"\$r"\s*\]|\[\s*\$i\s*-lt\s*\$r\s*\]/);
      });

      test("Stage transitions to dispatch_push", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const stage = extractInstructionBody(s, "Stage");
        assert.match(stage, /## State\s*\n\s*dispatch_push/);
      });

      test("Stage writes all five staged push-arg files", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const stage = extractInstructionBody(s, "Stage");
        for (const fname of ["round.md", "persona_name.md", "persona_description.md", "question.md", "transcript.md"]) {
          assert.match(stage, new RegExp(`scoped/staged/${escapeRegExp(fname)}`), `Stage missing staged/${fname}`);
        }
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm run build && node --test dist/test/phase-5-debate.test.js`
    Expected: FAIL with "Stage instruction missing"

- [ ] **Step 3: Write minimal implementation**

    In `INSTRUCTIONS.md`, insert the following block AFTER the `Initialize` instruction's action body and BEFORE the `# Sub-instructions` heading:

    ````markdown
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

    ````

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm run build && node --test dist/test/phase-5-debate.test.js`
    Expected: PASS — 5 new tests under "phase-5 a-debate: Stage instruction"

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/4-peer-collaboration/a-debate/INSTRUCTIONS.md src/test/phase-5-debate.test.ts
    git commit -m "feat(debate): Stage instruction with strict round isolation (satisfies: R5, R6)"
    ```

---

## Task 5: `Push` instruction   (satisfies: R8, R14)

**Files:**
- Modify: `interpreters/mas-papers/4-peer-collaboration/a-debate/INSTRUCTIONS.md`
- Modify: `src/test/phase-5-debate.test.ts`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-5-debate.test.ts`:

    ```ts
    describe("phase-5 a-debate: Push instruction (R8, R14)", () => {
      test("Push is matched on dispatch_push state", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const push = extractInstructionBody(s, "Push");
        assert.ok(push.length > 0, "Push instruction missing");
      });

      test("Push emits ## Push opine.md and ## Push-Args (R8)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const push = extractInstructionBody(s, "Push");
        assert.match(push, /## Push\s*\ndynamics\/opine\.md/);
        assert.match(push, /## Push-Args/);
      });

      test("Push declares all five push-args (R8, R14)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const push = extractInstructionBody(s, "Push");
        for (const k of ["round:", "persona_name:", "persona_description:", "question:", "transcript:"]) {
          assert.match(push, new RegExp(`^\\s*${escapeRegExp(k)}`, "m"), `Push missing arg ${k}`);
        }
      });

      test("Push sets state to dispatching (so post-pop is dispatching_completed)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const push = extractInstructionBody(s, "Push");
        assert.match(push, /## State\s*\n\s*dispatching\b/);
      });

      test("Push reads from scoped/staged/ files (the stage/push split)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const push = extractInstructionBody(s, "Push");
        assert.match(push, /scoped\/staged\/round\.md/);
        assert.match(push, /scoped\/staged\/persona_name\.md/);
        assert.match(push, /scoped\/staged\/persona_description\.md/);
        assert.match(push, /scoped\/staged\/question\.md/);
        assert.match(push, /scoped\/staged\/transcript\.md/);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm run build && node --test dist/test/phase-5-debate.test.js`
    Expected: FAIL with "Push instruction missing"

- [ ] **Step 3: Write minimal implementation**

    In `INSTRUCTIONS.md`, insert the following block AFTER the `Stage` instruction and BEFORE `# Sub-instructions`:

    ````markdown
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
        operators/opine.md
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

    ````

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm run build && node --test dist/test/phase-5-debate.test.js`
    Expected: PASS — 5 new tests under "phase-5 a-debate: Push instruction"

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/4-peer-collaboration/a-debate/INSTRUCTIONS.md src/test/phase-5-debate.test.ts
    git commit -m "feat(debate): Push instruction with static MEMORY template (satisfies: R8, R14)"
    ```

---

## Task 6: `Absorb` instruction   (satisfies: R7, R9, R11)

**Files:**
- Modify: `interpreters/mas-papers/4-peer-collaboration/a-debate/INSTRUCTIONS.md`
- Modify: `src/test/phase-5-debate.test.ts`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-5-debate.test.ts`:

    ```ts
    describe("phase-5 a-debate: Absorb instruction (R7, R9, R11)", () => {
      test("Absorb is matched on dispatching_completed with ## Opinion", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const absorb = extractInstructionBody(s, "Absorb");
        assert.ok(absorb.length > 0, "Absorb instruction missing");
        assert.match(absorb, /dispatching_completed/);
        assert.match(absorb, /## Opinion/);
      });

      test("Absorb appends to both transcript.md and round-$r.md (R7, R9)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const absorb = extractInstructionBody(s, "Absorb");
        assert.match(absorb, />>\s*\.\/scoped\/transcript\.md/);
        assert.match(absorb, />>\s*\.\/scoped\/round-\$r\.md/);
      });

      test("Absorb labels each opinion with round and persona name (R9)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const absorb = extractInstructionBody(s, "Absorb");
        assert.match(absorb, /### Round \$r — \$name/);
      });

      test("Absorb routes to round_transition when agent counter hits N (R11)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const absorb = extractInstructionBody(s, "Absorb");
        assert.match(absorb, /round_transition/);
        // The branch condition is "new_k -lt N" → dispatch_stage; else round_transition
        assert.match(absorb, /new_k.*-lt.*N|N.*-le.*new_k/);
      });

      test("Absorb increments scoped/agent.md", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const absorb = extractInstructionBody(s, "Absorb");
        assert.match(absorb, /echo\s+"?\$new_k"?\s+>\s+\.\/scoped\/agent\.md/);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm run build && node --test dist/test/phase-5-debate.test.js`
    Expected: FAIL with "Absorb instruction missing"

- [ ] **Step 3: Write minimal implementation**

    In `INSTRUCTIONS.md`, insert the following block AFTER the `Push` instruction and BEFORE `# Sub-instructions`:

    ````markdown
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

    ````

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm run build && node --test dist/test/phase-5-debate.test.js`
    Expected: PASS — 5 new tests under "phase-5 a-debate: Absorb instruction"

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/4-peer-collaboration/a-debate/INSTRUCTIONS.md src/test/phase-5-debate.test.ts
    git commit -m "feat(debate): Absorb instruction with per-round snapshot (satisfies: R7, R9, R11)"
    ```

---

## Task 7: `Round transition` instruction   (satisfies: R10, R11)

**Files:**
- Modify: `interpreters/mas-papers/4-peer-collaboration/a-debate/INSTRUCTIONS.md`
- Modify: `src/test/phase-5-debate.test.ts`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-5-debate.test.ts`:

    ```ts
    describe("phase-5 a-debate: Round transition instruction (R10, R11)", () => {
      test("Round transition is matched on round_transition state", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const rt = extractInstructionBody(s, "Round transition");
        assert.ok(rt.length > 0, "Round transition instruction missing");
        assert.match(rt, /MEMORY state is "round_transition"/);
      });

      test("Round transition increments round.md and resets agent.md to 0 (R11)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const rt = extractInstructionBody(s, "Round transition");
        assert.match(rt, /new_r=\$\(\(\s*r\s*\+\s*1\s*\)\)/);
        assert.match(rt, /echo\s+"?\$new_r"?\s+>\s+\.\/scoped\/round\.md/);
        assert.match(rt, /echo\s+0\s+>\s+\.\/scoped\/agent\.md/);
      });

      test("Round transition routes to concluding when new_r > R (R10)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const rt = extractInstructionBody(s, "Round transition");
        assert.match(rt, /concluding/);
        // The branch is "new_r -le R" → dispatch_stage; else concluding
        assert.match(rt, /new_r.*-le.*R|R.*-lt.*new_r/);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm run build && node --test dist/test/phase-5-debate.test.js`
    Expected: FAIL with "Round transition instruction missing"

- [ ] **Step 3: Write minimal implementation**

    In `INSTRUCTIONS.md`, insert the following block AFTER the `Absorb` instruction and BEFORE `# Sub-instructions`:

    ````markdown
    ## Instruction: Round transition
    **Condition:** MEMORY state is "round_transition"
    **Action:** Increment the round counter, reset the agent counter to 0, then route based on whether more rounds remain. This is its own cycle (one focused action) so the LLM does not have to combine "absorb the last agent's opinion" with "finalize this round and advance" in a single emission.

        r=$(cat ./scoped/round.md)
        R=$(cat ./scoped/rounds.md)
        new_r=$((r + 1))
        echo "$new_r" > ./scoped/round.md
        echo 0 > ./scoped/agent.md

        if [ "$new_r" -le "$R" ]; then
          NEXT_STATE=dispatch_stage
        else
          NEXT_STATE=concluding
        fi

        cat > ./MEMORY.md << ROUND_EOF
        ## State
        $NEXT_STATE
        ## Matched Instruction
        Round transition
        ## Last Action
        Round $r complete; advanced to round $new_r of $R; routing to $NEXT_STATE.
        ## Result
        Round transition complete.
        ROUND_EOF

    ````

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm run build && node --test dist/test/phase-5-debate.test.js`
    Expected: PASS — 3 new tests under "phase-5 a-debate: Round transition instruction"

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/4-peer-collaboration/a-debate/INSTRUCTIONS.md src/test/phase-5-debate.test.ts
    git commit -m "feat(debate): Round transition instruction (satisfies: R10, R11)"
    ```

---

## Task 8: `Conclude` instruction   (satisfies: R12, R13)

**Files:**
- Modify: `interpreters/mas-papers/4-peer-collaboration/a-debate/INSTRUCTIONS.md`
- Modify: `src/test/phase-5-debate.test.ts`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-5-debate.test.ts`:

    ```ts
    describe("phase-5 a-debate: Conclude instruction (R12, R13)", () => {
      test("Conclude is matched on concluding state", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const conc = extractInstructionBody(s, "Conclude");
        assert.ok(conc.length > 0, "Conclude instruction missing");
        assert.match(conc, /MEMORY state is "concluding"/);
      });

      test("Conclude reads scoped/transcript.md (R12)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const conc = extractInstructionBody(s, "Conclude");
        assert.match(conc, /scoped\/transcript\.md/);
      });

      test("Conclude writes ## Final Position in MEMORY (R12)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const conc = extractInstructionBody(s, "Conclude");
        assert.match(conc, /## Final Position/);
      });

      test("Conclude does not push any further dynamic (R20 still holds)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const conc = extractInstructionBody(s, "Conclude");
        assert.doesNotMatch(conc, /^\s*## Push\s*\n\s*dynamics\//m);
      });

      test("Conclude sets state to done (R13)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const conc = extractInstructionBody(s, "Conclude");
        assert.match(conc, /## State\s*\n\s*done/);
      });

      test("Conclude requires neutral coordinator voice (no persona impersonation)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const conc = extractInstructionBody(s, "Conclude");
        assert.match(conc, /neutral|coordinator|NOT impersonating/i);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm run build && node --test dist/test/phase-5-debate.test.js`
    Expected: FAIL with "Conclude instruction missing"

- [ ] **Step 3: Write minimal implementation**

    In `INSTRUCTIONS.md`, insert the following block AFTER the `Round transition` instruction and BEFORE `# Sub-instructions`:

    ````markdown
    ## Instruction: Conclude
    **Condition:** MEMORY state is "concluding"
    **Action:** Read the full debate transcript and the question, then synthesise a neutral final position. **The strategy speaks here, NOT impersonating any persona.** Summarise where personas converged and name remaining disagreements explicitly.

    Read the inputs:

        bash cat ./scoped/question.md
        bash cat ./scoped/transcript.md

    Compose 4–8 sentences of synthesis in a coordinator voice. Do NOT use any persona's name as the speaker; do NOT mark this output with `<SOLUTION>`. Then wholesale-rewrite MEMORY:

        cat > ./MEMORY.md << CONCLUDE_EOF
        ## State
        done
        ## Matched Instruction
        Conclude
        ## Last Action
        Synthesised final position from full transcript; halting.
        ## Result
        Debate complete.
        ## Final Position
        <your 4–8-sentence synthesis here, in neutral coordinator voice — no persona attribution>
        CONCLUDE_EOF

    The shell intercepts state `done` at stack depth 1 and halts.

    ````

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm run build && node --test dist/test/phase-5-debate.test.js`
    Expected: PASS — 6 new tests under "phase-5 a-debate: Conclude instruction"

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/4-peer-collaboration/a-debate/INSTRUCTIONS.md src/test/phase-5-debate.test.ts
    git commit -m "feat(debate): Conclude instruction with neutral synthesis (satisfies: R12, R13)"
    ```

---

## Task 9: README + final integration sweep   (satisfies: R10, R18, R20)

**Files:**
- Create: `interpreters/mas-papers/4-peer-collaboration/a-debate/README.md`
- Modify: `src/test/phase-5-debate.test.ts`

- [ ] **Step 1: Write the failing test**

    Append to `src/test/phase-5-debate.test.ts`:

    ```ts
    describe("phase-5 a-debate: README + interpreter integrity (R18, R20)", () => {
      test("README.md exists and references Du et al. 2023", () => {
        assert.ok(existsSync(resolve(INTERP, "README.md")), "README.md missing");
        const s = readFileSync(resolve(INTERP, "README.md"), "utf-8");
        assert.match(s, /Du et al\.,?\s*2023/);
        assert.match(s, /Multi-Agent Debate/);
      });

      test("operators/ contains exactly opine.md (R20)", () => {
        const dyns = readdirSync(resolve(INTERP, "dynamics"));
        assert.deepEqual(dyns.sort(), ["opine.md"], `expected only opine.md, found ${dyns.join(", ")}`);
      });

      test("interpreter has all six core strategy instructions (Initialize, Stage, Push, Absorb, Round transition, Conclude)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        for (const inst of ["Initialize", "Stage", "Push", "Absorb", "Round transition", "Conclude"]) {
          assert.match(s, new RegExp(`^## Instruction:\\s*${escapeRegExp(inst)}\\b`, "m"), `missing instruction: ${inst}`);
        }
      });

      test("Sub-instructions section is empty (this interpreter needs none)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        const idx = s.search(/^# Sub-instructions/m);
        assert.ok(idx >= 0, "# Sub-instructions section missing");
        const sub = s.slice(idx).replace(/^# Sub-instructions\s*\n/, "").trim();
        assert.match(sub, /\(none/, `sub-instructions section should declare "(none …)", got: ${sub.slice(0, 80)}`);
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm run build && node --test dist/test/phase-5-debate.test.js`
    Expected: FAIL with "README.md missing"

- [ ] **Step 3: Write minimal implementation**

    Create `interpreters/mas-papers/4-peer-collaboration/a-debate/README.md`:

    ```markdown
    # Multi-Agent Debate

    Implements **Multi-Agent Debate** (Du et al., 2023; arXiv:2305.14325) — `patterns.md` Group 4, Peer Collaboration. N agents with distinct personas independently produce opinions in round 1; in subsequent rounds, each agent reads only the previous round's batch (never same-round siblings) and updates its position. After R rounds, the strategy synthesises a neutral final position from the full transcript.

    ## Mechanism

    - **Round coordinator strategy** at `INSTRUCTIONS.md`. State machine: `empty` → `dispatch_stage` → `dispatch_push` → `dispatching_completed` → (`dispatch_stage` | `round_transition`) → … → `concluding` → `done`.
    - **One dynamic** at `operators/opine.md`, depth 1. Receives one persona's worth of context plus the prior-rounds transcript; returns one opinion via `## Return opinion: |`.
    - **Strict round isolation** is enforced by the strategy: at stage time, the `transcript` push-arg is built by concatenating only completed prior-round snapshot files (`scoped/round-1.md` … `scoped/round-{R-1}.md`). The in-progress current round is excluded.
    - **No `reflect.md` reuse.** Inter-round nudging is deferred (`reflect.md`'s contract requires a `verdict` that debate has no analogue for). See `docs/specs/2026-04-28-agent-workflows-phase-5/`.
    - **No aggregator dynamic.** Synthesis is the strategy's own inline cycle, not a pushed dynamic — keeps Phase 5 inside Group 4 and prevents drift toward Phase 5b's MoA aggregator.

    ## Demo PROGRAM.md

    A "Postgres or SQLite for use case U?" question with three personas (DBA, App Dev, SRE). Default R=3 applies, so a complete run produces 9 opinions and one final position.

    ## Run

    ```
    ./new-instance.sh debate-demo interpreters/mas-papers/4-peer-collaboration/a-debate
    instances/debate-demo/run.sh
    ```

    Inspect `instances/debate-demo/frames/f000-strategy/scoped/transcript.md` for the full debate, and the final cycle's `MEMORY.md` for the synthesised `## Final Position`.

    ## Phase 5b (MoA) is deferred

    Mixture of Agents — the second Group-4 pattern — is deferred pending per-prompt model selection in the harness. Phase 5b's `propose.md` dynamic is intentionally distinct from this `opine.md` (different access pattern: opine sees prior-round transcripts; propose sees nothing).

    ## References

    - Du, Yilun et al. *Improving Factuality and Reasoning in Language Models through Multiagent Debate*. arXiv:2305.14325. 2023.
    - `docs/agent-workflows/patterns.md` § Group 4 — Peer Collaboration.
    - `docs/agent-workflows/requirements.md` § Phase 5.
    - `docs/specs/2026-04-28-agent-workflows-phase-5/` — full spec (requirements, design, tasks).
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm run build && node --test dist/test/phase-5-debate.test.js`
    Expected: PASS — 4 new tests under "phase-5 a-debate: README + interpreter integrity"; total of ~37 phase-5 tests passing.

    Then run the full suite to confirm no regressions:

    Run: `npm test`
    Expected: PASS — entire suite green.

- [ ] **Step 5: Commit**

    ```bash
    git add interpreters/mas-papers/4-peer-collaboration/a-debate/README.md src/test/phase-5-debate.test.ts
    git commit -m "feat(debate): README + integrity sweep (satisfies: R10, R18, R20)"
    ```

---

## Coverage check

| R# | Task(s) |
| --- | --- |
| R1 | T3 |
| R2 | T3 |
| R3 | T3 |
| R4 | T3 |
| R5 | T4 |
| R6 | T4 |
| R7 | T6 |
| R8 | T5 |
| R9 | T6 |
| R10 | T7, T9 |
| R11 | T6, T7 |
| R12 | T8 |
| R13 | T8 |
| R14 | T1, T5 |
| R15 | T1 |
| R16 | T1 |
| R17 | T2 |
| R18 | T9 (smoke; R18(a)/(b) full validation is the manual demo run noted in `design.md` § Test strategy) |
| R19 | T3 |
| R20 | T1, T9 |

R18(a) "exactly nine opinions" and R18(b) "## Final Position present" require a real LLM run and are validated by the demo run (manual / observation-driven), not by automated tests in this phase. The automated tests verify the structural preconditions (R20 only-opine.md; R12 ## Final Position is what Conclude writes); the actual cycle execution is exercised by `./new-instance.sh debate-demo …` and inspecting `transcript.md` per the README.
