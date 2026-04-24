# Design: visualizer layout

## Overview

Rework `visualizer.html` (single HTML file, raw HTML/CSS/SVG, no framework) into two URL-routed views: a home page (no `?instance=` param) listing every instance under `instances/` with its state/cycles/last-update, and an instance page that drops the existing 7-panel vertical stack in favour of a 3-column CSS-grid layout (Call Stack | Events | Frame Files) with a single-column fallback under 1100px. The Latest Log panel is removed (R16). The payload viewer becomes a modal popup (R23) and accepts both externalized tool payloads and inline LLM I/O text (R22). Event summaries gain an exhaustive switch with no raw-JSON fallback (R21). Implementation reuses every existing render function (`renderTimeline`, `renderStackGraph`, `renderFilePanel`, `renderEvents`, `renderEventTypeFilters`, `openPayload`/`closePayload`, `loadInstance`, `loadEvents`); the new code is a router shim, a home-page renderer, a CSS rewrite, and an `openInlinePayload(label, text)` sibling of `openPayload`.

## Requirement coverage

| R# | Summary | Addressed in |
| -- | ------- | ------------ |
| R1 | No `?instance` → home page | §Architecture (router), §Interfaces (`showHomePage`) |
| R2 | Home table columns: name/state/cycles/last-update | §Data model (`InstanceSummary`), §Interfaces (`loadHomeInstances`) |
| R3 | Click row → navigate to instance | §Interfaces (`renderHomeTable` row onclick) |
| R4 | Render rows progressively | §Architecture (per-instance fetch is fire-and-forget; row updates in place) |
| R5 | Legacy instances (no `.call-stack.json`) → `State: "(legacy)"` | §Error handling |
| R6 | `visualize.sh` (no arg) → opens home URL | §Interfaces (`visualize.sh` rewrite) |
| R7 | `visualize.sh <name>` → opens `?instance=...` | §Interfaces (preserved) |
| R8 | Top row: ← Home, name, state, cycles, auto-refresh, timeline | §Architecture (DOM layout) |
| R9 | Status bar fields absorbed into top row | §Architecture (DOM layout) |
| R10 | No standalone `<h1>` on instance view | §Architecture |
| R11 | 3-column grid above 1100px | §Architecture (CSS grid), §Interfaces (CSS) |
| R12 | Vertical call stack, active on top, returnState labels between frames | §Interfaces (`renderStackGraph` rewrite — vertical) |
| R13 | Columns bounded so grid fits one viewport; internal scroll | §Architecture (CSS height) |
| R14 | Single-column fallback below 1100px | §Architecture (CSS media query) |
| R15 | Timeline wraps if too narrow | §Architecture (CSS flex-wrap) |
| R16 | Remove Latest Log panel | §Architecture (DOM removal) |
| R17 | (struck through; superseded by R23) | — |
| R18 | Click frame node → events + files re-scope | §Interfaces (preserved from existing `renderStackGraph` onclick) |
| R19 | Click cycle dot → events re-scope | §Interfaces (preserved) |
| R20 | Auto-refresh re-fetches the visible page | §Interfaces (`refresh()` dispatches to home or instance) |
| R21 | Exhaustive event-summary switch, no raw-JSON | §Interfaces (`eventSummary`) |
| R22 | LLM events clickable; tool events use `payload_ref`; LLM events use inline text | §Interfaces (`openInlinePayload`, `renderEvents` click handler) |
| R23 | Payload viewer = modal popup with backdrop / Esc / X close | §Architecture (modal DOM), §Interfaces (`openPayload`, `closePayload`, key handler) |

## Architecture

```
URL: /visualizer.html?instance=...           URL: /visualizer.html
                │                                   │
                ▼                                   ▼
┌─────────────────────────────┐          ┌────────────────────────────┐
│  Instance page              │          │  Home page                 │
│  ┌──────────────────────┐   │          │  ┌──────────────────────┐  │
│  │ Top row              │   │          │  │ <h1> + tagline       │  │
│  │ ← Home | name | state│   │          │  │ <table id=instTable> │  │
│  │ cycles | depth | live│   │          │  │  Name | State |      │  │
│  │ auto-refresh | timeline│ │          │  │  Cycles | Updated    │  │
│  └──────────────────────┘   │          │  └──────────────────────┘  │
│  ┌─────┬────────┬────────┐  │          │                            │
│  │ Call│ Events │ Frame  │  │          │ rows fetched progressively │
│  │Stack│ panel  │ Files  │  │          │ via loadHomeInstances()    │
│  │vert.│ +filter│ picker │  │          │                            │
│  │ SVG │        │+content│  │          │ click row → navigate       │
│  └─────┴────────┴────────┘  │          └────────────────────────────┘
│   (1 column below 1100px)   │
└─────────────────────────────┘

           ┌───────────────────────────────────┐
           │ Payload modal (R22, R23)          │
           │ position: fixed, backdrop overlay │
           │ ┌─────────────────────────────┐  │
           │ │ Header: label + close ×     │  │
           │ │ Body: textContent (XSS-safe)│  │
           │ └─────────────────────────────┘  │
           │ closes on: backdrop click / Esc  │
           └───────────────────────────────────┘
```

**Module boundaries:**

- `visualizer.html` (rewritten in place) — single file. Two top-level page containers (`#homePage`, `#instancePage`), toggled by URL params at load time; the modal `#payloadModal` is a third top-level container, hidden until shown.
- `visualize.sh` (modified) — drop the required-instance check; if no arg, open the home URL; if arg, open `?instance=instances/<name>` (existing behaviour).
- `src/server.ts` (unchanged) — already serves directory listings; the home page reuses the existing `listDir('instances/')` HTML-parsing pattern.

**CSS structure:**

```css
.grid-3col {
  display: grid;
  grid-template-columns: 260px 1fr 1fr;
  gap: 16px;
  height: calc(100vh - <topbar-height> - 32px);
}
.grid-3col > .panel { overflow-y: auto; }   /* internal scroll per column */

@media (max-width: 1099px) {
  .grid-3col { grid-template-columns: 1fr; height: auto; }
  /* panels stack; their internal max-height becomes per-panel rather than viewport-bound */
}

.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 100; ... }
.modal { background: #161b22; max-width: min(1000px, 92vw); max-height: 92vh; ... }
```

## Data model

The visualizer is plain JS embedded in `visualizer.html`, so there is no separate type declaration. Each home-page row is a plain object with the following shape, documented via a JSDoc comment on `loadHomeInstances()`:

```js
/**
 * @typedef {Object} InstanceSummary
 * @property {string} name           e.g. "p2b-d"  (R2)
 * @property {string|null} state     active frame's MEMORY state, "(legacy)" for pre-2b, "(loading)" while in flight (R2, R5)
 * @property {number|null} cycles    count of history/<NNNN>* dirs, null for legacy/loading (R2)
 * @property {string|null} lastUpdate ISO timestamp string of .call-stack.json mtime, or null (R2)
 */
```

Rendered into `<tr>` elements; mutated in place as fetches complete (R4 — progressive loading). The DOM (`<tr id="row-<name>">`) IS the persisted state for a row; `updateHomeRow(name, partial)` mutates the cells of the matching row directly.

**No new files, no new persisted state on disk.** The visualizer is purely a viewer; URL is the only routing state.

## Interfaces / API

**`visualize.sh`** (rewritten):

```bash
INSTANCE="${1:-}"
if [ -n "$INSTANCE" ]; then
  if [ ! -d "instances/$INSTANCE" ]; then
    echo "Error: instance 'instances/$INSTANCE' not found"; exit 1
  fi
  URL="http://localhost:${PORT}/visualizer.html?instance=instances/${INSTANCE}"
else
  URL="http://localhost:${PORT}/visualizer.html"   # satisfies: R6
fi
# ... existing browser-open + server-launch logic unchanged ...   // satisfies: R7
```

**`visualizer.html` JS additions** (the existing functions `loadInstance`, `renderTimeline`, `renderStackGraph`, `renderFilePanel`, `renderEvents`, `renderEventTypeFilters`, `openPayload`, `closePayload`, `loadEvents` stay; the rewrites/additions below — all plain JS, signatures shown for intent):

```js
// ---- Page routing ----
async function bootstrap()                              // satisfies: R1, R6, R7
// Reads URLSearchParams('instance'); calls showInstancePage(inst) or showHomePage().

function showHomePage()                                 // satisfies: R1, R10
function showInstancePage(instanceDir)                  // hides #homePage, shows #instancePage, calls loadInstance(instanceDir)

// ---- Home page ----
async function loadHomeInstances()                      // satisfies: R1, R2, R4, R5
//   1. List instances/ via the existing listDir helper.
//   2. For each name: insert a row {state:'(loading)', cycles:null, lastUpdate:null}.
//   3. Fire-and-forget fetchInstanceSummary(name) per row; on resolve, updateHomeRow(name, summary).

async function fetchInstanceSummary(name)               // satisfies: R2, R5
//   Fetches `${instanceDir}/.call-stack.json` (404 → "(legacy)"),
//   `${activeFrameDir}/MEMORY.md` for the state,
//   listDir(history/) for cycle count, mtime for lastUpdate.
//   Returns an InstanceSummary-shaped plain object (see §Data model JSDoc).

function renderHomeTable(rows)                          // satisfies: R3 (row click → navigate)
function updateHomeRow(name, partial)                   // satisfies: R4 (in-place row mutation)

// ---- Vertical stack rendering (rewrite of existing renderStackGraph) ----
function renderStackGraph(cycle)                        // satisfies: R12
// Layout: SVG height = stack.length * (NODE_H + GAP) + padding
//         stack[stack.length - 1] at the top (active, blue + ★)
//         stack[0] at the bottom (root)
//         arrows between adjacent frames carry the upper frame's returnState

// ---- Event summary (rewrite to be exhaustive) ----
function eventSummary(e)                                // satisfies: R21
// Switch covers all 14 known types; fallback for unknown is `(<type>)` not JSON.stringify.

// ---- Payload viewer (rewrite to modal) ----
async function openPayload(ref)                         // satisfies: R22, R23 (file fetch path)
function openInlinePayload(label, text)                 // satisfies: R22 (LLM I/O path)
function closePayload()                                 // satisfies: R23
// Backdrop click handler + global keydown(Escape) registered once at bootstrap.

// ---- renderEvents click handlers (rewrite) ----
// tool_call/tool_result with payload_ref → openPayload(ref)
// llm_request                            → openInlinePayload('llm_request prompt', e.prompt)
// llm_response                           → openInlinePayload('llm_response output', e.output)
// satisfies: R22

// ---- Auto-refresh dispatch ----
function refresh()                                      // satisfies: R20
// if currentPage === 'home': loadHomeInstances()
// else:                       loadInstance()
```

**No new HTTP endpoints.** All directory listings already work via the existing static-file server.

## Error handling

Per the unwanted triggers (`IF` clauses) in requirements:

- **R5 (legacy instance, no `.call-stack.json`):** `fetchInstanceSummary` catches the 404, returns `{ name, state: "(legacy)", cycles: null, lastUpdate: null }`. Row renders with greyed-out state column.
- **Home table fetch race:** rows are added immediately with `state: "(loading)"`; later fetches `await`-then-`updateHomeRow(name, ...)` mutate the existing row by id. Out-of-order completions are fine.
- **Modal Escape handler:** registered once at bootstrap; calls `closePayload()` only when the modal is currently shown (no-op otherwise).
- **Modal backdrop click:** the backdrop and the modal-content listen for `click`; the backdrop's handler closes; the content's handler calls `e.stopPropagation()` so clicks inside don't dismiss.
- **Unknown event type (R21 / R28-better-logging):** `eventSummary` default branch returns `'(' + esc(e.type) + ')'` — readable, no JSON dump.

## Test strategy

**Unit / smoke tests** (`src/test/visualizer-events-smoke.test.ts` — extend existing):

- Add a test asserting the rewritten `visualizer.html` contains markers for the new features:
  - `id="homePage"` and `id="instancePage"` (R1 routing)
  - `id="payloadModal"` and class `modal-backdrop` (R23)
  - `grid-template-columns` and `@media (max-width: 1099px)` (R11, R14)
  - `loadHomeInstances`, `renderHomeTable`, `openInlinePayload` (function names — R2, R22)
  - No `Latest Log` text (R16)
  - No standalone `<h1>Turing Machine Visualizer</h1>` outside the home page (R10)

- Add a JSDOM-style or string-pattern test confirming `eventSummary`'s switch has a `case` for each of the 14 known event types (R21). Without JSDOM, this can be an HTML-content scan: `assert.match(html, /case 'cycle_start':/)` etc.

**Manual / visual** (covered by existing demo instances `instances/bl-{a,b,c,d}`):

- Open `./visualize.sh` with no arg → home page renders, lists `bl-{a,b,c,d}` with state=`done`, cycle counts (8, 4, 5, 25), last-update timestamps. Click `bl-d` → instance page loads (R1, R2, R3, R6).
- Open instance page on a wide window (≥1100px) → 3 columns side by side; resize to <1100px → single column (R11, R14).
- In bl-d's instance view, click any LLM response event → modal opens with the full output text inline (R22). Click Escape → modal closes (R23).
- In bl-d's instance view, no `tool_call`/`tool_result` events exist (CC provider) — manually craft a `tool_call` event in `events.jsonl` to verify the file-fetch path still works, OR run a test instance with the `api` provider.
- Verify Latest Log panel is absent (R16) and the standalone `<h1>` is absent on the instance page (R10).

**No new test files** — the visualizer is rendered HTML/JS and the HTML-content-scan style from T10/T11/T12 of better-logging is sufficient. Behavioural verification is manual against the demo instances.

## Open questions

- (none)
