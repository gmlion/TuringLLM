# game-team — a small game-development team

A multi-role SDLC interpreter for building small games headlessly. Originally the first multi-role interpreter in this repo (deleted at commit `e7c599e` during Phase-3 cleanup); reconstructed here under the Phase-2b architecture with the `## Popped Return` contract.

## What it does

`team-lead.md` (the root operator) reads `PROGRAM.md` (the game brief), decomposes it into a feature backlog, and runs the following loop per feature:

1. **Planning** — picks the next pending feature; chooses which AI roles are relevant.
2. **Consulting** — pushes `consult-role.md` once per chosen role; each role reads its own persona file and writes an `opinion` via `## Return`. Opinions accumulate surgically into `./scoped/opinions.md`.
3. **Synthesizing** — combines opinions into `./scoped/implementation_plan.md`. May ask the user *one* design-level question via `## Pending Questions` (non-blocking).
4. **Implementing** — pushes `implement-feature.md` with the feature + plan; the operator runs each step against `../../workspace/`, verifies headlessly (syntax check, build, test, file integrity), and returns `outcome: done` or `outcome: fail`.
5. **Looping** — marks the feature done or retries on fail (up to 3 attempts before dropping).

When all features are resolved, the root frame writes a `summary` to `## Return`. The shell splays that into `OUTPUT.md`.

## Team

AI roles (under `roles/`):
- `architect.md` — technical structure, patterns, performance.
- `game-designer.md` — gameplay, balance, player experience.
- `developer.md` — implementation complexity, practical concerns.
- `artist-2d.md` — visual assets, art style, programmatic art creation.
- `ui-ux.md` — interface design, interaction patterns, feedback.

The user is the senior member: consulted only on design/product calls (game feel, scope trade-offs), never on internal implementation details.

## Operators

- `operators/team-lead.md` — root SDLC orchestrator. State machine: `empty → planning → consulting → synthesizing → implementing → planning → ... → finishing → done`.
- `operators/consult-role.md` — pushes a single AI role consultation. Push-args: `role`, `feature`, `brief_path`. Returns `role`, `opinion`.
- `operators/implement-feature.md` — runs a feature's implementation plan with headless verification per step. Push-args: `feature`, `implementation_plan`. Returns `outcome` (`done` or `fail`), `notes`.

## Headless verification — what you can and cannot check

The interpreter runs in a headless CLI with no browser and no GUI. `implement-feature.md` mandates verification per step:
- Source files → syntax check.
- Builds → run the build, capture exit code.
- Tests → actually run them.
- Generated assets (SVG, programmatic PNG) → file exists, non-empty, parseable.

What it **cannot** verify: "the visual output looks right", "the controls feel responsive". For those, the plan should flag them and the user is consulted via `## Pending Questions` post-implementation. Never claim a visual feature works without user confirmation.

## Running it

    ./new-instance.sh interpreters/game-team my-game
    # edit instances/my-game/PROGRAM.md to describe the game you want
    # edit instances/my-game/.env to pick provider/model
    instances/my-game/run.sh

Built artifacts will appear under `instances/my-game/workspace/` (its own git repo).
