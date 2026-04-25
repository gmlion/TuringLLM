# b-chatdev

*ChatDev (Qian et al., 2023). See
`docs/agent-workflows/patterns.md` §Group 5.*

This interpreter implements ChatDev's **phase-dialogue** SOP:
four fixed phases — design, coding, testing, documenting — each
phase a dialogue between a role pair (CEO↔CTO for design,
specialist↔reviewer for the rest). The dialogue is the contract
between phases, not a document hand-off.

## State machine

```
empty ─(push dialogue: ceo+cto, design, acceptance=false)─► empty_completed & ## Dialogue Output
                                                                                        │ (rename to ## Design Doc)
                                        ─(push dialogue: coder+reviewer, coding, acceptance=true)─► empty_completed
                                                                                        │ (rename to ## Code)
                                        ─(push dialogue: tester+reviewer, testing, acceptance=true)─► empty_completed
                                                                                        │ (rename to ## Test Report)
                                        ─(push dialogue: writer+reviewer, documenting, acceptance=true)─► empty_completed
                                                                                        │ (rename to ## Documentation)
                                                                                      done
```

Five strategy instructions: `Initialize`, `Design done — enter
coding`, `Coding done — enter testing`, `Testing done — enter
documenting`, `Finish`.

## Dynamics

| File                 | Consumes                                                                 | Produces           | Stack depth                |
| -------------------- | ------------------------------------------------------------------------ | ------------------ | -------------------------- |
| `dynamics/dialogue.md` | `{{participants}}`, `{{topic}}`, `{{input}}` (opt.), `{{acceptance}}` (opt.) | `dialogue_output`  | 1 (2 when acceptance=true) |
| `dynamics/evaluate.md` | `{{attempt}}`, `{{criterion}}`                                           | `verdict`, `feedback` | leaf (byte-equal to Phase 1b) |

Role descriptions under `./roles/` — `ceo.md`, `cto.md`,
`coder.md`, `reviewer.md`, `tester.md`, `writer.md` — are read
by `dialogue.md` via `bash cat`.

## Demo `PROGRAM.md`

Build `wc-plus` — same task as `../a-metagpt/PROGRAM.md`
(byte-equal, required by R22). Running both interpreters on the
same PROGRAM.md is the comparison the phase exists for.

## Run it

```bash
./new-instance.sh my-chatdev interpreters/5-fixed-sop-teams/b-chatdev
instances/my-chatdev/run.sh
```

## Known behaviour

- Dialogue turn limit: 6. Prevents runaway loops; convergence is
  usually reached by turn 4.
- Reviewer-paired phases (coding, testing, documenting) push
  `evaluate.md` and only return after a verdict; design phase
  does not.
- `## Dialogue Output` is renamed to the phase-specific section
  (`## Design Doc`, `## Code`, `## Test Report`,
  `## Documentation`) by the strategy after each dialogue
  returns.
