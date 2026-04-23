# Requirements: agent-workflows Phase 2b — isolated MEMORY per frame with declared returns

## Context

Follow-up to Phase 2 (`docs/specs/2026-04-21-agent-workflows-phase-2/`).
The Phase 2 live demos (`phase-2-notes.md` §d-cove live demo; the
20-person puzzle re-run after the state-machine tightening) surfaced
two independent drift classes not addressed by Phase 2:

1. **Cross-frame MEMORY obliteration.** When a child dynamic sets
   `state=done` and writes MEMORY via the canonical `cat > MEMORY.md`
   recipe, it overwrites the whole file — including sections the
   caller had written. `verify.md`'s `## Verifications` was
   reconstructed every push-pop cycle (8 bullets → 6 after the first
   pop) because `answer-independently.md` at depth 2 wiped it.
2. **Same-frame rewrite drift.** Every MEMORY write is a whole-file
   rewrite: the LLM has to re-emit every section it wants to keep. A
   growing list (verifications, lessons) loses entries silently when
   the LLM re-emits fewer bullets than it should — no tool error
   fires.

Phase 2b closes both by giving every frame its own directory with
its own `MEMORY.md` and `INSTRUCTIONS.md`, and having the shell set
cwd to the active frame's directory before each LLM cycle. Frames
are siblings under `instances/<name>/frames/`; `PROGRAM.md` and
`workspace/` stay at the instance root and are reached via the
invariant relative paths `../../PROGRAM.md` / `../../workspace/`
from any frame depth. Returns flow back to the caller via a declared
`## Return` block (symmetric with Phase 2's `## Push-Args`) whose
entries are spliced into the caller's on-disk `MEMORY.md` at pop
time. A system-prompt addendum makes surgical edits (`sed -i`,
`echo >>`) the convention for mutating files that contain structured
state. All four existing interpreters (a-self-refine,
b-evaluator-optimizer, c-reflexion, d-cove) migrate off
MEMORY-as-heap onto per-frame scoped files and declared returns.

## User stories

- **US1**: As an interpreter author, I want my caller-state to survive
  every push-pop cycle so that children at any depth cannot silently
  destroy it by writing MEMORY.
- **US2**: As an interpreter author, I want structured per-call
  outputs so that what flows back from a child dynamic is explicit
  rather than "whatever sections the child happened to leave in
  MEMORY".
- **US3**: As an interpreter author, I want each frame to own a
  namespaced directory for its large or structured state (drafts,
  lists, tables), so I can mutate that state surgically without
  forcing the LLM to re-type it on every cycle.
- **US4**: As a framework author, I want a single convention in the
  system prompt that prefers surgical file edits over whole-file
  rewrites, so that same-frame drift is a loud syntax error rather
  than silent data loss.
- **US5**: As a user of existing interpreters (a, b, c, d), I want
  them migrated to the new conventions so that Phase-1 behaviours
  (R11 lessons accumulation, R20 depth-2 invariant, etc.) continue
  to work without regression.
- **US6**: As a user running the `d-cove` demo against the 20-person
  knights-and-knaves puzzle, I want the `## Verifications` state to
  persist byte-for-byte across every push-pop cycle so that the
  verification loop covers every posed claim.
- **US7**: As an interpreter author, I want to write simple file
  paths (`./draft.md`, `../../PROGRAM.md`) that resolve the same way
  in every frame, so I don't need to read the shell's substituted
  variables or parse MEMORY to figure out where I am.

## Acceptance criteria (EARS)

> **Note on numbering.** R1–R36 are the original approved IDs from
> the first Phase 2b requirements pass. Requirements reworded under
> the chroot pivot keep their ID but have updated wording; requirements
> truly dropped by the pivot are struck through and annotated.
> New requirements introduced by the pivot start at R37.

### Shell infrastructure: per-frame directories and cwd

- **R1** (reworded): WHEN `applyPush` succeeds, THE SYSTEM SHALL
  keep the caller's `MEMORY.md` on disk at the caller's frame
  directory (no snapshot is taken; the file is simply not touched by
  the push). The new stack entry SHALL record the child's frame
  directory name; the caller's MEMORY is implicitly preserved by
  virtue of living in a different directory from the child's.
- **R2** (reworded): WHEN `applyPush` succeeds, THE SYSTEM SHALL
  write a fresh `MEMORY.md` at the child's frame directory
  (`instances/<name>/frames/f<NNN>-<slug>/MEMORY.md`) containing only
  `## State\nempty`. No caller-provided MEMORY sections SHALL appear
  in the child's MEMORY at any time.
- **R3** (reworded): WHEN `applyPop` processes a frame, THE SYSTEM
  SHALL splice the child's `## Return` entries directly into the
  caller's on-disk `MEMORY.md` at the caller's frame directory. No
  "restore" step is required; the caller's MEMORY has been on disk
  uninterrupted since the push.

### Shell infrastructure: frame-directory lifecycle

- **R4**: THE SYSTEM SHALL maintain a monotonically increasing frame
  counter per instance, persisted in `.call-stack.json` as
  `nextCounter`. The counter SHALL start at `1` for new instances
  (the root frame reserves `f000`) and increment once per successful
  push.
- **R5** (reworded): WHEN `applyPush` succeeds, THE SYSTEM SHALL
  create a new directory at `instances/<name>/frames/f<NNN>-<slug>/`
  where:
  - `<NNN>` is the current `nextCounter` value, zero-padded to three
    digits (wider for counts ≥ 1000, preserving lexical ordering).
  - `<slug>` is the basename of the push target with `.md` stripped
    and any character outside `[a-zA-Z0-9_-]` replaced by `_`
    (e.g. `dynamics/answer-independently.md` → `answer-independently`).
  The new frame directory SHALL contain: a fresh `MEMORY.md` (R2),
  an `INSTRUCTIONS.md` populated from the push target with
  `## Push-Args` substitutions applied (Phase 2 behaviour), and an
  empty `scoped/` subdirectory.
- **R6** (reworded): WHEN `applyPop` fires and the caller splice is
  complete, THE SYSTEM SHALL delete the popped frame's directory
  (including its `MEMORY.md`, `INSTRUCTIONS.md`, and `scoped/`
  subtree) via recursive removal.
- **R7** (reworded): `new-instance.sh` SHALL create
  `instances/<name>/frames/f000-strategy/` at instance creation
  time, populated with the interpreter's `INSTRUCTIONS.md` copied
  verbatim (no substitution), an initial `MEMORY.md` containing
  `## State\nempty`, and an empty `scoped/` subdirectory. The root
  frame directory SHALL persist for the instance's lifetime (it is
  never deleted by `applyPop` because the strategy is never popped).
- **R8**: THE SYSTEM SHALL use Node's `mkdirSync(path, { recursive:
  true })` and `rmSync(path, { recursive: true, force: true })` for
  all frame directory creation and deletion (cross-platform; no
  shell-out).
- **R9**: WHEN `applyPush` fails for any reason (`missing-target` or
  `unresolved-placeholder`), THE SYSTEM SHALL NOT create a frame
  directory and SHALL NOT increment `nextCounter`.

### Shell infrastructure: cwd management

- ~~**R10** (dropped): {{scope_dir}} substitution in target
  INSTRUCTIONS is no longer needed. Paths inside a frame are implicit
  in the LLM's cwd; paths to shared instance resources are invariant
  (`../../PROGRAM.md`, `../../workspace/`). Superseded by R37, R38,
  R40.~~
- ~~**R11** (dropped): Bootstrap substitution of {{scope_dir}} in the
  strategy's INSTRUCTIONS is no longer needed. Superseded by R7
  (new-instance.sh populates the root frame directly).~~
- ~~**R12** (dropped): `## Scope` section in MEMORY is no longer
  needed. The frame's identity is implicit in cwd and in the stack
  entry. Superseded by R37.~~

### Shell infrastructure: `## Return` splicing

- **R13**: THE SYSTEM SHALL parse a `## Return` section at the top
  of the child's final `MEMORY.md` (the MEMORY as it stands when
  `state=done` triggers the pop). The parse grammar SHALL be
  identical to `## Push-Args` (R1 of Phase 2): `key: value`
  single-line entries plus `key: |` block scalars with two-space
  indentation.
- **R14** (reworded): WHEN `applyPop` processes a frame and the
  child's `MEMORY.md` contains a `## Return` section, THE SYSTEM
  SHALL splice each entry into the caller's on-disk `MEMORY.md` as
  a separate section named `## <Key>`, where `<Key>` is the entry's
  key with its first character uppercased (e.g. `answer: ...` →
  `## Answer\n...`). If the resulting section already exists in the
  caller's `MEMORY.md`, the spliced value SHALL REPLACE the existing
  section's content.
- **R15**: IF a child sets `state=done` without writing a `## Return`
  section, THEN THE SYSTEM SHALL pop without splicing any sections,
  log `[pop] <target>: no ## Return section`, and continue. Missing
  returns are NOT a failure.
- **R16**: IF `## Return` is present but contains malformed entries
  (unparseable by R13 grammar), THEN THE SYSTEM SHALL skip each
  malformed entry individually, log `[pop] <target>: malformed
  return entry <line>`, splice the valid entries normally, and
  continue. Malformed returns are NOT a failure.

### Shell infrastructure: `.call-stack.json` shape

- **R17** (reworded): THE `.call-stack.json` file SHALL persist as
  an object with shape `{ "nextCounter": <int>, "stack": [<frame-dir-name>, ...] }`.
  The stack is an ordered list of relative frame directory names
  (e.g. `"frames/f001-verify"`), root-frame-first. No `StackEntry`
  object holds `memory` or `instructions` fields — those live on
  disk in the frame's directory. The stack entry only needs the
  `returnState` (to compute `<returnState>_completed` on pop) and
  the `frameDir` (to locate files and to remove on pop).
- ~~**R18** (dropped): backward-compatibility loading of pre-Phase-2b
  `.call-stack.json` (a bare JSON array of `{returnState, instructions}`
  frames) is not supported under the chroot model because the
  associated instance has no `frames/` layout. Pre-Phase-2b paused
  instances cannot resume under Phase 2b; this is a documented
  breaking change. See R43 for the known-limitation statement.~~

### System prompt: cwd context, surgical-edit convention, relative paths

- **R19**: THE SYSTEM SHALL update the system prompt
  (`src/prompt.ts`) to include a new subsection on mutating files
  that contain structured state. The subsection SHALL:
  - State that `MEMORY.md` continues to use the canonical
    `cat > MEMORY.md << MEMEOF` recipe.
  - Instruct the LLM to use in-place edits (`sed -i`, `awk`,
    `echo >>`) for all other files — especially scoped files that
    accumulate structured state.
  - Warn explicitly that wholesale rewrites of structured files are a
    silent drift source (the LLM may emit fewer entries than
    present without any tool error).
  - Include at least three concrete examples (replace a bullet,
    append to a list, read a single entry).
- **R20**: THE surgical-edit convention SHALL NOT apply to
  `MEMORY.md`, `INSTRUCTIONS.md`, or `PROGRAM.md`. These remain
  wholesale-written files as today.

### Interpreter retrofits

- **R21** (reworded): THE SYSTEM SHALL migrate `a-self-refine` to
  use `./scoped/draft.md` (heap, relative to the strategy's frame
  directory) and declared returns:
  - `self-critique.md` consumes `{{draft}}` via push-args (unchanged
    from Phase 2).
  - `self-critique.md` returns `critique: <text>` and
    `refined: <text>` via `## Return`, in place of writing
    `## Critique` and `## Refined` directly to MEMORY.
  - The strategy's Request-critique instruction reads the current
    `./scoped/draft.md` contents and emits them as the `draft`
    push-arg.
  - The strategy's Evaluate-refinement instruction reads `## Critique`
    and `## Refined` from the caller's `MEMORY.md` (spliced by the
    shell on pop) and either accepts (state=done) or rewrites
    `./scoped/draft.md` wholesale (a draft is a single blob, not a
    list).
- **R22** (reworded): THE SYSTEM SHALL migrate `b-evaluator-optimizer`
  to use `./scoped/attempt.md` and `./scoped/criterion.md`:
  - `evaluate.md` consumes `{{attempt}}` and `{{criterion}}` via
    push-args (unchanged from Phase 2).
  - `evaluate.md` returns `verdict: <pass|fail>` and
    `feedback: <text>` via `## Return`.
  - The strategy's Handle-verdict instruction rewrites
    `./scoped/attempt.md` wholesale on fail (same rationale as a's
    draft.md: single blob).
- **R23** (reworded): THE SYSTEM SHALL migrate `c-reflexion` to use
  `./scoped/attempt.md`, `./scoped/criterion.md`, and
  `./scoped/lessons.md`:
  - `evaluate.md` (byte-equal with b's per R25) returns `verdict` +
    `feedback` as in R22.
  - `reflect.md` consumes `{{attempt}}`, `{{verdict}}`, `{{feedback}}`
    via push-args and returns `lesson: <text>` via `## Return`.
  - The strategy's Accumulate-lesson instruction SHALL append the
    new lesson to `./scoped/lessons.md` surgically
    (`echo "- L<N>: <text>" >> ./scoped/lessons.md`). WHOLE-FILE
    rewrites of `./scoped/lessons.md` SHALL be forbidden by the
    strategy's Action text.
  - The strategy's Attempt instruction reads both `./scoped/criterion.md`
    and `./scoped/lessons.md` before producing the new attempt.
- **R24** (reworded): THE SYSTEM SHALL migrate `d-cove` to use
  `./scoped/draft.md` (at strategy scope) and `./scoped/verifications.md`
  (at verify.md scope — i.e. inside verify's own frame directory):
  - `verify.md` consumes `{{draft}}` via push-args (unchanged from
    Phase 2).
  - `verify.md` writes `./scoped/verifications.md` inside its own
    frame directory (not the strategy's), using a list-of-bullets
    format.
  - `verify.md`'s Record-answer instruction SHALL use surgical
    `sed -i` to replace the first `pending` marker with
    `answered: <text>` in `./scoped/verifications.md`. WHOLE-FILE
    rewrites SHALL be forbidden by verify.md's Action text.
  - `answer-independently.md` consumes `{{question}}` via push-args
    (unchanged) and returns `answer: <text>` via `## Return`.
  - `verify.md`'s Build-revised instruction returns `revised: <text>`
    via `## Return` and does not write a `## Revised` section to
    MEMORY directly.
  - The strategy's Finalize instruction reads `## Revised` from its
    own `MEMORY.md` (spliced by the shell on pop).

### Preservation invariants

- **R25**: THE SYSTEM SHALL preserve byte-equality between
  `interpreters/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md`
  and `interpreters/1-iterative-refinement/c-reflexion/dynamics/evaluate.md`
  after the migration. `src/test/phase-1-dynamics-identity.test.ts`
  SHALL continue to pass unmodified.
- **R26**: THE SYSTEM SHALL preserve the Phase-1 R11 invariant: the
  Reflexion live demo (or its scripted integration equivalent)
  SHALL accumulate at least two lessons before halting at `done`.
- **R27** (reworded): THE SYSTEM SHALL preserve the Phase-2 R20
  invariant: mid-verify, `.call-stack.json`'s `stack` length SHALL
  equal 2 (strategy frame + verify frame) or 3 (plus an active
  `answer-independently` child). Scripted tests SHALL assert this
  under the new stack shape.

### Documentation

- **R28** (reworded): `CLAUDE.md` SHALL be updated to document: the
  per-frame directory layout (`instances/<name>/frames/f<NNN>-<slug>/`),
  the canonical per-frame MEMORY schema (State, Push, Push-Args,
  Return — no Scope section), the frame-directory naming rule, the
  cwd-based access model with invariant `../../PROGRAM.md` and
  `../../workspace/`, the surgical-edit rule, and the breaking-change
  note for pre-Phase-2b paused instances.
- **R29**: `interpreters/1-iterative-refinement/README.md` SHALL be
  updated to describe how each of a/b/c/d uses its frame's
  `./scoped/` subdirectory.
- **R30**: `docs/agent-workflows/requirements.md` SHALL be updated
  to reference the Phase 2b additions where relevant (§Phase 2's
  reuse note; the shared-dynamics section).
- **R31**: THE SYSTEM SHALL add
  `docs/agent-workflows/phase-2b-notes.md` summarising anything
  surprising during implementation; if nothing was surprising, the
  file SHALL state that explicitly in one line (per the phase-notes
  convention).

### Validation and regression

- **R32**: WHEN `npm test` runs after Phase 2b, every pre-existing
  test SHALL pass after any necessary updates to reflect the new
  per-frame layout and push/pop payload shapes. Test updates MAY
  include new assertions (presence of `## Return`, frame-directory
  creation, caller `MEMORY.md` preservation across a push) but SHALL
  NOT weaken any existing invariant.
- **R33** (reworded): THE SYSTEM SHALL add new unit tests under
  `src/test/` covering at minimum: frame-directory creation and
  deletion lifecycle, counter monotonicity across push/pop,
  `## Return` parsing (single-line + block scalar + malformed),
  splicing behaviour (new section, overwriting existing), caller
  `MEMORY.md` preservation on disk across a child's push-pop cycle,
  cwd handoff semantics in the cycle loop, missing-return and
  malformed-return failure paths.
- **R34**: WHEN the `d-cove` live demo is re-run end-to-end against
  the 20-person knights-and-knaves puzzle
  (`interpreters/1-iterative-refinement/d-cove/PROGRAM.md`), THE
  SYSTEM SHALL halt at `state=done` with a `## Revised` section in
  the strategy's `MEMORY.md`, and the cycle history SHALL confirm
  that `verifications.md` in verify.md's frame directory is mutated
  only by surgical edits (never wholesale overwritten) and that
  every bullet posed in the initial `Pose questions` instruction is
  answered (no reconstruction drift).
- **R35**: WHEN the live demos for `a-self-refine`,
  `b-evaluator-optimizer`, and `c-reflexion` are re-run end-to-end
  after migration, each SHALL halt at `state=done` with the same
  observable outputs as Phase 2 (`## Refined`, `## Attempt`, and
  `## Attempt + lessons.md` respectively). Test suite additions
  MAY assert scoped-file presence during the run.
- **R36**: IF any Phase-2b demo run exhausts the shell's retry
  budget without advancing state, THEN THE SYSTEM SHALL exit via
  the existing retry-exhaustion code path (no new error surface
  introduced), per Phase-1 R22 and Phase-2 R27.

### NEW: Shell cwd handoff and relative-path convention

- **R37**: BEFORE each LLM cycle, THE SYSTEM SHALL set the active
  working directory to the current top-of-stack frame's directory
  (`instances/<name>/frames/f<NNN>-<slug>/`). All LLM-side file
  reads and writes SHALL resolve relative to this cwd unless the
  LLM uses an explicit relative prefix (e.g. `../../` for shared
  instance resources) or an absolute path.
- **R38**: THE system prompt SHALL document that the LLM runs inside
  a frame-specific directory and that:
  - `./MEMORY.md` is the frame's own MEMORY (written by the canonical
    `cat > MEMORY.md << MEMEOF` recipe).
  - `./INSTRUCTIONS.md` is the frame's own program.
  - `./scoped/` is the frame's scratch directory for structured
    state (drafts, lists, tables).
  - `../../PROGRAM.md` is the shared user program (read-only to the
    machine).
  - `../../workspace/` is the shared project artifacts directory
    (with its own git repo; the `git` tool operates there).
- **R39**: `new-instance.sh` SHALL create
  `instances/<name>/frames/f000-strategy/INSTRUCTIONS.md`,
  `.../MEMORY.md`, and `.../scoped/` at instance creation time. The
  legacy `instances/<name>/INSTRUCTIONS.md` and `.../MEMORY.md` at
  the instance root SHALL NOT be created.
- **R40**: `PROGRAM.md` and `workspace/` SHALL remain at the
  instance root (`instances/<name>/PROGRAM.md`,
  `instances/<name>/workspace/`). They SHALL NOT be duplicated into
  frame directories. The invariant relative paths from any frame
  dir (`../../PROGRAM.md`, `../../workspace/`) resolve uniformly
  regardless of stack depth because all frames are siblings under
  `instances/<name>/frames/`.
- **R41**: THE SYSTEM SHALL update the auto-commit / history
  snapshot mechanism (`src/git.ts`, `src/main.ts` post-cycle hooks)
  to capture the entire `frames/` subtree in each `history/NNNN-<hash>/`
  directory, not just a single `MEMORY.md` / `INSTRUCTIONS.md` pair.
- **R42**: THE SYSTEM SHALL replace every fixed-path reference to
  `MEMORY.md` or `INSTRUCTIONS.md` in `src/config.ts`, `src/main.ts`,
  and each provider (`src/providers/*.ts`) with a frame-aware
  resolution that returns the path relative to the current
  top-of-stack frame. Provider implementations that today read from
  a static `MEMORY_PATH` / `INSTRUCTIONS_PATH` SHALL be updated to
  receive the active frame directory as a parameter or to read it
  from a shell-owned accessor.

### NEW: Breaking change and active cleanup

- **R43**: THE documentation for Phase 2b SHALL explicitly state
  that pre-Phase-2b instances (with `INSTRUCTIONS.md` and
  `MEMORY.md` at the instance root rather than inside
  `frames/f000-strategy/`) CANNOT be resumed under Phase 2b. No
  automatic migration SHALL be attempted. No backward-compatibility
  code path SHALL be preserved in the shell, `new-instance.sh`, the
  visualizer, `src/config.ts`, or any provider.
- **R44**: AS part of Phase 2b implementation, THE SYSTEM SHALL
  delete every existing directory under `instances/` (including
  `demo-1a`, `demo-1b`, `demo-1b-b`, `demo-1c`, `p2-cove`, `p2-cove-20`,
  and any others present at the time of implementation). Cleanup
  SHALL be performed via `rm -rf instances/<name>/` per directory.
  No backup, no archive, no partial preservation of history or
  workspace. The `instances/` directory itself SHALL remain (empty)
  after cleanup — it is gitignored, so no git tracking is affected.
  This cleanup SHALL happen in the same commit as R39's
  `new-instance.sh` rewrite, so the repository never carries a
  mixed state of old + new instances simultaneously.

## Out of scope

- **Closured / read-only parent scope access.** Children do not get
  explicit visibility into ancestor frames' directories. While the
  filesystem makes `../f<PARENT>-<slug>/` physically reachable with
  `..` traversal, the prompt contract never directs children to do
  so. The Phase-2 philosophy — child sees only what it was explicitly
  given — is preserved. A future Phase 2c may add declared parent
  access if a real consumer appears.
- **OS-level write protection on frame directories.** Structural
  isolation in Phase 2b is "the child is never told the path to the
  parent's frame dir"; it is not enforced by filesystem ACLs. A
  misbehaving LLM that explicitly traverses with `..` is not
  prevented by the shell.
- **Shell-managed state primitives.** No JSON list/table types in
  the shell. State in scoped files is free-form text; surgical edits
  are a convention, not an enforced typing discipline. A separate
  phase could introduce typed state primitives if warranted.
- **Renaming existing directories or interpreters.** Phase 2b is
  orthogonal to the directory-layout convention established in
  Phase 1 (interpreter tree layout at `interpreters/<group>/<variant>/`
  is unchanged).
- **Changes to PROGRAM.md semantics or the strategy-section
  preservation rule.** Strategies continue to copy their strategy
  section verbatim on every `update_instructions` call.
- **Preservation of pre-Phase-2b instances in any form.** Per R43
  and R44, the breaking change is accepted and existing instance
  directories are deleted outright. No `migrate.sh`, no archive
  directory, no read-only preservation of history/ snapshots.

## Open questions

(none — brainstorming resolved frame-directory naming and lifecycle,
return declaration mechanism, cwd-based access model, invariant
relative paths, and surgical-edit convention placement. Any remaining
ambiguities are design-level, not requirements-level, and will be
settled in Phase 2b's design document.)
