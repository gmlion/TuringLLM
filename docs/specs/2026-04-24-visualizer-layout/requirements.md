# Requirements: visualizer layout

## Context

After Phase 2b and the better-logging spec, `visualizer.html` stacks seven panels vertically (Cycle Timeline, Status bar, Call Stack, Frame Files, Events, Payload, Latest Log). On a typical monitor only 2–3 are visible at a time, so correlating stack ↔ events ↔ files requires constant scrolling. Additionally, the entry point requires choosing an instance up front via `visualize.sh <name>` even though the URL accepts any instance — there's no "home" page that lists what's available. This spec reworks the layout around a three-column instance view (call stack | events | frame files) and adds a home page for instance discovery.

## User stories

- **US1**: As a developer with multiple instances, I want a home page that lists them with state and cycle info so I can pick the interesting one without remembering names.
- **US2**: As a developer correlating stack frames with events and frame files, I want them visible simultaneously so I don't have to scroll between panels.
- **US3**: As a developer on a narrow window or smaller monitor, I want the layout to fall back to single-column so nothing overflows.
- **US4**: As an operator launching `visualize.sh`, I want to omit the instance argument and land on the home page.

## Acceptance criteria (EARS)

### Home page

- **R1**: WHEN no `?instance` query parameter is present in the URL, THE SYSTEM SHALL display a home page listing every instance directory under `instances/`.
- **R2**: THE SYSTEM SHALL show, for each instance, the columns: Instance name, State (current MEMORY state of the active frame), Cycle count (count of `history/<NNNN>` snapshot directories), Last update (timestamp of the most recent change to `.call-stack.json` or the latest history snapshot).
- **R3**: WHEN a user clicks an instance row on the home page, THE SYSTEM SHALL navigate to `?instance=instances/<name>` and load the instance view.
- **R4**: WHILE the home page is fetching instance metadata, THE SYSTEM SHALL render rows progressively (e.g. show name immediately, fill in state/cycle/last-update as fetches complete) so a slow instance does not block the rest of the table.
- **R5**: IF an instance directory lacks `.call-stack.json` (pre-Phase-2b layout) THEN THE SYSTEM SHALL still list that row with State="(legacy)" and Cycle count="—" rather than throwing or omitting the row.

### `visualize.sh` entry point

- **R6**: WHEN `visualize.sh` is invoked with no instance argument, THE SYSTEM SHALL open the browser to the home page URL (no `?instance` query parameter).
- **R7**: WHEN `visualize.sh` is invoked with an instance argument, THE SYSTEM SHALL preserve the existing behaviour and open directly to that instance's view (`?instance=instances/<name>`).

### Top row (instance view)

- **R8**: THE SYSTEM SHALL render a single horizontal top row on the instance view containing: a `← Home` link, the instance name, the current state, the cycle count, an Auto-refresh toggle, an interval selector, and the cycle timeline (the existing horizontal dot strip).
- **R9**: THE SYSTEM SHALL absorb the fields previously shown in the standalone status bar (Cycles, Cycle, State, Stack depth, Last update) into the top row, removing the status bar as a separate panel.
- **R10**: THE SYSTEM SHALL not render a standalone `<h1>Turing Machine Visualizer</h1>` block on the instance view; the page chrome lives in the top row.

### Three-column grid (instance view, wide viewport)

- **R11**: WHILE the viewport width is at least 1100px, THE SYSTEM SHALL render the instance view body as a three-column grid: column 1 = Call Stack, column 2 = Events, column 3 = Frame Files.
- **R12**: THE SYSTEM SHALL render the call stack vertically with the active frame at the top and the root frame at the bottom; the connector between adjacent frames carries the `returnState` label.
- **R13**: THE SYSTEM SHALL bound the column heights so the three-column grid fits within one viewport without forcing page scroll, and each column scrolls internally when its content exceeds that height.

### Responsive fallback

- **R14**: WHEN the viewport width is less than 1100px, THE SYSTEM SHALL fall back to a single-column layout where the panels stack vertically in the order: Call Stack, Events, Frame Files.
- **R15**: WHEN the timeline cannot fit on the same line as the top-row controls, THE SYSTEM SHALL wrap the timeline below the controls within the top row (rather than overflow horizontally).

### Removed / relocated panels

- **R16**: THE SYSTEM SHALL remove the "Latest Log (tail)" panel entirely (the underlying `logs/run-<ts>.log` file is no longer written after better-logging R23).
- ~~**R17**: THE SYSTEM SHALL keep the Payload detail panel (existing click-to-fetch behaviour from better-logging R27) but render it below the three-column grid when shown — full-width, spanning all three columns.~~ Superseded by R23.

### Selection semantics (preserved)

- **R18**: WHEN the user clicks a frame node in the Call Stack, THE SYSTEM SHALL update the Events panel scope and the Frame Files panel to that frame.
- **R19**: WHEN the user clicks a cycle dot in the timeline, THE SYSTEM SHALL update the Events panel scope to that cycle.

### Auto-refresh

- **R20**: WHILE auto-refresh is enabled, THE SYSTEM SHALL refresh the data of whichever page is currently visible (home → re-fetch the instance table; instance → re-fetch the loaded instance's snapshots and events) at the configured interval.

### Event summary completeness and payload viewer

- **R21**: THE SYSTEM SHALL provide a human-readable summary in the events panel for every event type emitted by `events.ts` (currently 14 types: `cycle_start`, `cycle_end`, `push`, `pop`, `splice`, `llm_request`, `llm_response`, `tool_call`, `tool_result`, `machine_git_commit`, `instructions_changed`, `retry`, `error`, `halt`). IF an unknown event type appears (R28 of better-logging — forward-compat) THEN THE SYSTEM SHALL show the type name with a short fallback rather than dumping the raw JSON envelope.
- **R22**: THE SYSTEM SHALL make `llm_request`, `llm_response`, `tool_call`, and `tool_result` events clickable. WHEN the user clicks an `llm_request` or `llm_response` event, THE SYSTEM SHALL open the payload viewer with the inline `prompt` or `output` content. WHEN the user clicks a `tool_call` or `tool_result` event with a `payload_ref`, THE SYSTEM SHALL open the payload viewer with the fetched file content (existing better-logging R27 behaviour).
- **R23**: THE SYSTEM SHALL render the payload viewer as a modal popup (centred overlay above the page content with a translucent backdrop), not as a fixed panel below the grid. WHEN the user clicks the backdrop, presses Escape, or clicks the explicit close control, THE SYSTEM SHALL close the popup.

## Out of scope

- Live push updates via SSE / WebSocket (auto-refresh polling stays).
- Multi-instance side-by-side compare.
- Home page search, filter, or sort controls.
- Drag-to-resize columns.
- Persisting column widths, selected event-type filters, or other UI prefs to localStorage.
- Mobile-specific layouts (single-column fallback covers narrow desktop windows; phones are not a target).

## Open questions

- (none)
