# Requirements: instance-graph-visualization

## Context

The current per-instance visualizer (`visualizer.html`) shows one cycle at a
time across a three-column layout (Call Stack / Events / Frame Files). It
gives good per-cycle introspection but no high-level view of how the call
stack evolves across the run. For multi-phase interpreters like ChatDev —
which fan out into many `dialogue` and `evaluate` frames across dozens of
cycles — a user has to step cycle-by-cycle to understand the shape. This
feature adds a graph view of the full instance: every frame, every cycle,
laid out as a swimlane DAG. The graph view becomes the new default
content of the instance page; the existing three-column layout becomes a
drill-down opened by clicking a node.

## User stories

- **US1**: As a user opening an instance, I want to see the run's full
  frame structure at a glance so I can understand the call shape without
  stepping through cycles.
- **US2**: As a user inspecting a graph node, I want one click to drill
  into the existing per-cycle/per-frame view at the right starting point
  so I can see the underlying memory and events.
- **US3**: As a user, I want to switch between a sparse "per-frame"
  graph and a dense "per-cycle" graph so I can pick the right level of
  detail for the question I'm asking.
- **US4**: As a user drilled into the per-cycle view, I want a clear
  one-click way back to the graph so I don't lose my place.

## Acceptance criteria (EARS)

- **R1**: WHEN the user opens an instance via `?instance=<path>` with
  no additional drill-down parameters, THE SYSTEM SHALL render the new
  graph view as the default content of the instance page.

- **R2**: THE SYSTEM SHALL render the graph as a directed graph that
  the user can pan, zoom, and hover for inspection.

- **R3**: THE SYSTEM SHALL provide exactly two graph view modes:
  a sparse "per-frame" mode and a dense "per-cycle" mode.

- **R4**: WHEN the instance page first loads, THE SYSTEM SHALL display
  the graph in per-frame mode by default.

- **R5**: WHILE in per-frame mode, THE SYSTEM SHALL render exactly
  one node per pushed frame instance over the course of the run
  (the root frame counts as one such instance).

- **R6**: WHILE in per-cycle mode, THE SYSTEM SHALL render exactly
  one node per (frame, cycle) pair that the instance produced.

- **R7**: THE SYSTEM SHALL lay out the graph with frame slugs on
  horizontal rows — one row per distinct slug — and time progression
  flowing left-to-right within each row.

- **R8**: WHILE in per-frame mode, THE SYSTEM SHALL draw a directed
  edge from the caller frame node to the child frame node for every
  push, and from the child frame node back to the caller frame node
  for every pop.

- **R9**: WHILE in per-cycle mode, THE SYSTEM SHALL draw push and pop
  edges as in per-frame mode AND additionally draw a within-row
  continuity edge from each cycle node to the next cycle of the same
  frame instance.

- **R10**: THE SYSTEM SHALL label every per-frame node with
  `<slug> (<first-cycle>–<last-cycle>)` and every per-cycle node with
  `<slug> #<cycle-number>`.

- **R11**: THE SYSTEM SHALL NOT apply status, verdict, or
  final-state color coding to graph nodes; node visuals are limited
  to the slug + cycle range/number label and the layout position.

- **R12**: WHEN the user clicks a per-frame node, THE SYSTEM SHALL
  navigate to the existing per-cycle drill-down view focused on that
  frame at its first (push) cycle.

- **R13**: WHEN the user clicks a per-cycle node, THE SYSTEM SHALL
  navigate to the existing per-cycle drill-down view focused on that
  frame at exactly that cycle.

- **R14**: THE SYSTEM SHALL retain the existing instance-page header
  bar (instance name, current state, total cycles, current stack
  depth, Auto-refresh button, refresh-interval picker, PROGRAM.md
  popup button, Interpreter README popup button) when the graph view
  is active.

- **R15**: THE SYSTEM SHALL add a mode-toggle control to the
  instance-page header that switches the graph between per-frame and
  per-cycle modes.

- **R16**: THE SYSTEM SHALL NOT render the existing per-cycle
  timeline (the row of cycle dots above the body) when the graph
  view is active; the graph subsumes it.

- **R17**: WHILE Auto-refresh is enabled and the graph view is
  active, THE SYSTEM SHALL re-fetch the instance state and redraw
  the graph at the user-chosen refresh interval.

- **R18**: WHEN the user is in the per-cycle drill-down view, THE
  SYSTEM SHALL render a back link labelled "← Graph" that returns
  to the graph view for the same instance (i.e. `?instance=<path>`
  with no drill-down parameters).

- **R19**: THE SYSTEM SHALL encode the per-cycle drill-down state in
  URL query parameters (the specific parameter names are a design
  decision) so that deep links to a specific cycle and frame are
  shareable.

- **R20**: IF the instance has no cycles yet (freshly created),
  THEN THE SYSTEM SHALL render an empty graph with a placeholder
  message rather than erroring.

- **R21**: WHEN a frame is currently active (i.e. the live cycle is
  inside that frame and no pop has happened), THE SYSTEM SHALL
  treat its "last cycle" as the current cycle for labelling
  purposes (so the per-frame label reads as `<slug>
  (<push-cycle>–<current-cycle>)`).

## Out of scope

- A third "hyper-collapsed" view that merges all frames sharing a
  slug into a single super-node (initially considered, then dropped
  in favour of per-frame as the sparse mode).
- Status/verdict/state color coding on nodes.
- Editing or otherwise interacting with the instance from the graph
  view (the graph is strictly read-only).
- Mobile or tablet layouts; the visualizer remains a desktop tool.
- Persisting the chosen graph mode across sessions or instances; the
  default on every page load is per-frame.
- Filtering, searching, or hiding nodes by slug, status, or any
  other criterion.
- Comparing multiple instances side-by-side in one graph.
- Changing the home page (instance list); only the per-instance
  page changes.

## Open questions

- **OQ1**: Library / layout-algorithm choice (design phase).
  The user referenced "like the one in Obsidian" for interaction
  feel; combined with the left-to-right swimlane requirement (R7),
  candidate libraries include Cytoscape.js with a dagre layout,
  React Flow, or D3 with a custom DAG layout. To be picked in design.
- **OQ2**: Behaviour at very large scale (e.g. instances with
  hundreds or thousands of cycles). No target scale was specified;
  design should establish a reasonable upper bound and decide
  whether to add virtualization, viewport culling, or graceful
  degradation.
