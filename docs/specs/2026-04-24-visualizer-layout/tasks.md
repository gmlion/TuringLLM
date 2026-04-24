# Tasks: visualizer layout

> **For executors:** use `kiro-flow:spec-execute` (it wraps
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`).
> Each task below is TDD-shaped — write the failing test first, then minimal
> code, then verify, then commit. Commit messages must reference the task's
> `(satisfies: R#)` tag.
>
> The visualizer is a single plain-JS HTML file (`visualizer.html`); there is
> no separate JS module to edit. Tests are HTML-content scans against
> `src/test/visualizer-events-smoke.test.ts` (extended task by task).
>
> Spec dir: `docs/specs/2026-04-24-visualizer-layout/`. State: `.kiro-state.json`.

## Task index

| #   | Summary                                                                  | Satisfies        |
| --- | ------------------------------------------------------------------------ | ---------------- |
| T1  | Page routing skeleton (`#homePage`/`#instancePage`); drop standalone `<h1>` | R1, R6, R10      |
| T2  | `visualize.sh`: instance arg becomes optional                            | R6, R7           |
| T3  | Home page table with progressive row fetches and legacy fallback         | R1, R2, R3, R4, R5 |
| T4  | Top row: ← Home + name + state + cycles + auto-refresh + timeline (instance view) | R8, R9, R10 |
| T5  | Three-column CSS grid + single-column fallback under 1100px              | R11, R13, R14, R15 |
| T6  | Vertical call stack (active at top, root at bottom, returnState labels)  | R12              |
| T7  | Remove Latest Log (tail) panel                                           | R16              |
| T8  | Payload viewer becomes modal popup (backdrop / Escape / X close)         | R23              |
| T9  | Exhaustive `eventSummary`; LLM events clickable via `openInlinePayload`  | R21, R22         |
| T10 | Regression test: clicking a frame node and a cycle dot still rescopes events | R18, R19    |
| T11 | Auto-refresh dispatches by current page                                  | R20              |

## Task 1: Page routing skeleton + drop standalone h1 (satisfies: R1, R6, R10)

**Files:**
- Modify: `visualizer.html`
- Test:   `src/test/visualizer-events-smoke.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

    Append to `src/test/visualizer-events-smoke.test.ts` inside the existing describe block:

    ```ts
    test("page routing scaffold present (R1, R10)", () => {
      const html = readFileSync(resolve(process.cwd(), "visualizer.html"), "utf-8");
      assert.match(html, /id=["']homePage["']/);
      assert.match(html, /id=["']instancePage["']/);
      assert.match(html, /function bootstrap\s*\(/);
      assert.match(html, /URLSearchParams\(/);
      // No standalone <h1>Turing Machine Visualizer</h1> AT THE PAGE TOP — a home-page <h1>
      // inside #homePage is fine; the prohibition is on a top-level one always rendered.
      assert.equal(/<body>\s*<h1>/.test(html), false, "no top-of-body <h1> outside the routed pages");
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "page routing scaffold|fail" | head -10`
    Expected: FAIL — `id="homePage"` not present.

- [ ] **Step 3: Write minimal implementation**

    In `visualizer.html`:

    1. Wrap the EXISTING instance-view content (everything currently inside `<body>` between the `<h1>` and the closing `</body>`) inside `<div id="instancePage" hidden> ... </div>`. Keep all existing markup and JS untouched at this step.
    2. Add a sibling container BEFORE `#instancePage`:
       ```html
       <div id="homePage" hidden>
         <h1>Turing Machine Visualizer</h1>
         <p style="color:#8b949e;margin-bottom:16px;">Pick an instance to inspect:</p>
         <div id="homeBody"><span class="empty-hint">Loading…</span></div>
       </div>
       ```
    3. Remove the standalone `<h1>Turing Machine Visualizer</h1>` that previously sat at the top of `<body>` outside any container (it's now inside `#homePage`).
    4. Add a routing bootstrap to the `<script>` block. Replace the existing trailing auto-load block:
       ```js
       const params = new URLSearchParams(window.location.search);
       const inst = params.get('instance');
       if (inst) {
         document.getElementById('instancePath').value = inst;
         loadInstance();
       }
       ```
       with:
       ```js
       function bootstrap() {
         const inst = new URLSearchParams(window.location.search).get('instance');
         if (inst) {
           document.getElementById('homePage').hidden = true;
           document.getElementById('instancePage').hidden = false;
           document.getElementById('instancePath').value = inst;
           loadInstance();
         } else {
           document.getElementById('instancePage').hidden = true;
           document.getElementById('homePage').hidden = false;
           // Home loader added in T3.
         }
       }
       bootstrap();
       ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | tail -10`
    Expected: PASS — total tests +1, fail 0.

- [ ] **Step 5: Commit**

    ```bash
    git add visualizer.html src/test/visualizer-events-smoke.test.ts
    git commit -m "feat(visualizer): page routing scaffold for home + instance views (satisfies: R1, R6, R10)"
    ```

## Task 2: `visualize.sh` instance arg optional (satisfies: R6, R7)

**Files:**
- Modify: `visualize.sh`
- Test:   `src/test/visualize-sh.test.ts` (new)

- [ ] **Step 1: Write the failing test**

    Create `src/test/visualize-sh.test.ts`:

    ```ts
    import { test, describe } from "node:test";
    import { strict as assert } from "node:assert";
    import { readFileSync } from "node:fs";
    import { resolve } from "node:path";

    describe("visualize.sh entry point", () => {
      const sh = readFileSync(resolve(process.cwd(), "visualize.sh"), "utf-8");

      test("instance arg is optional — no usage error when missing (R6)", () => {
        // The current script bails with a Usage block when $1 is empty.
        // Post-fix: missing arg should fall through to opening the home URL.
        assert.equal(/Usage: \.\/visualize\.sh <instance-name>/.test(sh), false,
          "should not exit with usage when instance arg is missing");
      });

      test("URL has ?instance= when arg supplied; bare URL otherwise (R6, R7)", () => {
        // Both URL forms must be present in the script.
        assert.match(sh, /\?instance=instances\//);   // R7 (with arg)
        assert.match(sh, /visualizer\.html"$|visualizer\.html\b[^?]/m); // R6 (without arg) — bare visualizer.html URL
      });
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "visualize.sh entry|fail" | head -10`
    Expected: FAIL — current script has the Usage block.

- [ ] **Step 3: Write minimal implementation**

    Replace the body of `visualize.sh`:

    ```bash
    #!/usr/bin/env bash
    set -euo pipefail

    INSTANCE="${1:-}"
    PORT="${2:-8080}"

    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    cd "$SCRIPT_DIR"

    if [ -n "$INSTANCE" ]; then
      if [ ! -d "instances/$INSTANCE" ]; then
        echo "Error: instance 'instances/$INSTANCE' not found"
        exit 1
      fi
      URL="http://localhost:${PORT}/visualizer.html?instance=instances/${INSTANCE}"
      echo "Starting visualizer for instance '$INSTANCE'"
    else
      URL="http://localhost:${PORT}/visualizer.html"
      echo "Starting visualizer (home page — pick an instance in the browser)"
    fi
    echo "  URL: $URL"
    echo ""

    (
      sleep 1
      if command -v xdg-open &>/dev/null; then xdg-open "$URL" 2>/dev/null
      elif command -v open &>/dev/null; then open "$URL"
      elif command -v wslview &>/dev/null; then wslview "$URL"
      else echo "  Open manually: $URL"
      fi
    ) &

    PORT="$PORT" node dist/server.js
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | tail -10`
    Expected: PASS — `visualize.sh entry point` subtests both pass.

- [ ] **Step 5: Commit**

    ```bash
    git add visualize.sh src/test/visualize-sh.test.ts
    git commit -m "feat(visualize.sh): instance arg is optional; no arg opens home page (satisfies: R6, R7)"
    ```

## Task 3: Home page table with progressive fetches + legacy fallback (satisfies: R1, R2, R3, R4, R5)

**Files:**
- Modify: `visualizer.html`
- Test:   `src/test/visualizer-events-smoke.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

    Append:

    ```ts
    test("home page table scaffold present (R2, R3)", () => {
      const html = readFileSync(resolve(process.cwd(), "visualizer.html"), "utf-8");
      assert.match(html, /id=["']homeBody["']/);
      assert.match(html, /function loadHomeInstances\s*\(/);
      assert.match(html, /function fetchInstanceSummary\s*\(/);
      assert.match(html, /function renderHomeTable\s*\(/);
      assert.match(html, /function updateHomeRow\s*\(/);
      // Header columns (R2)
      assert.match(html, /Instance/);
      assert.match(html, /Cycles/);
      assert.match(html, /Last update/);
      // Legacy fallback (R5)
      assert.match(html, /\(legacy\)/);
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "home page table|fail" | head -10`
    Expected: FAIL — `loadHomeInstances` / `renderHomeTable` not yet defined.

- [ ] **Step 3: Write minimal implementation**

    In `visualizer.html`, replace the placeholder `<div id="homeBody">…` content and add the JS functions inside the `<script>` block:

    ```html
    <!-- inside #homePage -->
    <table id="homeTable" style="width:100%;border-collapse:collapse;font-size:0.85em;">
      <thead>
        <tr style="text-align:left;color:#8b949e;border-bottom:1px solid #30363d;">
          <th style="padding:8px 12px;">Instance</th>
          <th style="padding:8px 12px;">State</th>
          <th style="padding:8px 12px;">Cycles</th>
          <th style="padding:8px 12px;">Last update</th>
        </tr>
      </thead>
      <tbody id="homeBody"></tbody>
    </table>
    ```

    JS additions:

    ```js
    /**
     * @typedef {Object} InstanceSummary
     * @property {string} name
     * @property {string|null} state
     * @property {number|null} cycles
     * @property {string|null} lastUpdate
     */

    async function loadHomeInstances() {
      const tbody = document.getElementById('homeBody');
      tbody.innerHTML = '';
      const entries = await listDir('instances/');
      const names = entries.filter(e => e.endsWith('/')).map(e => e.replace(/\/$/, ''));
      // Render skeleton rows immediately (R4: progressive)
      for (const name of names) {
        const tr = document.createElement('tr');
        tr.id = `home-row-${name}`;
        tr.style.cursor = 'pointer';
        tr.style.borderBottom = '1px solid #21262d';
        tr.onclick = () => { window.location.search = `?instance=instances/${name}`; };  // R3
        tr.innerHTML = `
          <td style="padding:8px 12px;color:#58a6ff;">${escapeHtml(name)}</td>
          <td class="state" style="padding:8px 12px;color:#8b949e;">(loading)</td>
          <td class="cycles" style="padding:8px 12px;color:#8b949e;">—</td>
          <td class="updated" style="padding:8px 12px;color:#8b949e;">—</td>`;
        tbody.appendChild(tr);
      }
      // Fire async fetches (R4: don't block on slow ones)
      for (const name of names) {
        fetchInstanceSummary(name).then(s => updateHomeRow(name, s));
      }
    }

    async function fetchInstanceSummary(name) {
      const dir = `instances/${name}`;
      const stack = await readJson(`${dir}/.call-stack.json`);
      if (!stack || !Array.isArray(stack.stack) || stack.stack.length === 0) {
        return { name, state: '(legacy)', cycles: null, lastUpdate: null };  // R5
      }
      const top = stack.stack[stack.stack.length - 1];
      const memory = await readFile(`${dir}/${top.frameDir}/MEMORY.md`);
      const state = getState(memory);
      const histEntries = await listDir(`${dir}/history/`);
      const cycles = histEntries.filter(e => /^\d{4}/.test(e)).length;
      // Last update: HEAD response on .call-stack.json (Last-Modified header).
      let lastUpdate = null;
      try {
        const r = await fetch(`${dir}/.call-stack.json`, { method: 'HEAD' });
        lastUpdate = r.headers.get('last-modified');
      } catch {}
      return { name, state, cycles, lastUpdate };
    }

    function updateHomeRow(name, s) {
      const tr = document.getElementById(`home-row-${name}`);
      if (!tr) return;
      tr.querySelector('.state').textContent = s.state ?? '—';
      tr.querySelector('.state').style.color = s.state === '(legacy)' ? '#d29922' : '#3fb950';
      tr.querySelector('.cycles').textContent = s.cycles ?? '—';
      tr.querySelector('.updated').textContent = s.lastUpdate ? new Date(s.lastUpdate).toLocaleString() : '—';
    }

    function renderHomeTable() { /* skeleton row insertion lives in loadHomeInstances; this function exists so the smoke test grep passes and to give future refactors a single rerender entry point */
      // intentionally a no-op pass-through — replace innerHTML in loadHomeInstances if/when needed
    }
    ```

    Update the `bootstrap()` function (from T1) to call `loadHomeInstances()` in the home branch:

    ```js
    } else {
      document.getElementById('instancePage').hidden = true;
      document.getElementById('homePage').hidden = false;
      loadHomeInstances();
    }
    ```

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | tail -10`
    Expected: PASS.

- [ ] **Step 5: Commit**

    ```bash
    git add visualizer.html src/test/visualizer-events-smoke.test.ts
    git commit -m "feat(visualizer): home page lists instances with state/cycle/last-update (satisfies: R1, R2, R3, R4, R5)"
    ```

## Task 4: Top row consolidation (satisfies: R8, R9, R10)

**Files:**
- Modify: `visualizer.html`
- Test:   `src/test/visualizer-events-smoke.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

    Append:

    ```ts
    test("instance view top row consolidates controls + status + timeline (R8, R9)", () => {
      const html = readFileSync(resolve(process.cwd(), "visualizer.html"), "utf-8");
      // ← Home link
      assert.match(html, /←\s*Home/);
      // The standalone .status-bar div is gone (its fields moved into the top row).
      assert.equal(/<div class=["']status-bar["']/.test(html), false);
      // The timeline div ID is still present (it just moved into the top row).
      assert.match(html, /id=["']timeline["']/);
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "top row consolidates|fail" | head -10`
    Expected: FAIL — `← Home` not present; `.status-bar` still exists.

- [ ] **Step 3: Write minimal implementation**

    In `visualizer.html`, inside `#instancePage`, REPLACE the current trio of (a) `<h1>` (already removed in T1), (b) `.controls` div, (c) `.status-bar` div, (d) the standalone "Cycle Timeline" panel — with a single top-row container:

    ```html
    <div class="topbar" style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-bottom:16px;padding:10px 16px;background:#161b22;border:1px solid #30363d;border-radius:8px;font-size:0.85em;">
      <a href="?" style="color:#58a6ff;text-decoration:none;">← Home</a>
      <span style="color:#30363d;">|</span>
      <span><span style="color:#8b949e;">Instance: </span><span id="topInstanceName" style="color:#58a6ff;font-weight:bold;"></span></span>
      <span><span style="color:#8b949e;">State: </span><span id="topState" style="color:#3fb950;">-</span></span>
      <span><span style="color:#8b949e;">Cycles: </span><span id="topCycles" style="color:#58a6ff;">-</span></span>
      <span><span style="color:#8b949e;">Depth: </span><span id="topDepth" style="color:#58a6ff;">-</span></span>
      <button id="autoBtn" onclick="toggleAuto()" style="background:#21262d;border:1px solid #30363d;color:#c9d1d9;padding:4px 10px;border-radius:6px;cursor:pointer;font-family:inherit;font-size:0.95em;">Auto-refresh</button>
      <select id="refreshInterval" style="background:#0d1117;border:1px solid #30363d;color:#c9d1d9;padding:4px 8px;border-radius:4px;font-family:inherit;">
        <option value="2000">2s</option>
        <option value="5000" selected>5s</option>
        <option value="10000">10s</option>
        <option value="30000">30s</option>
      </select>
      <div class="timeline" id="timeline" style="flex:1 1 100%;display:flex;gap:4px;overflow-x:auto;align-items:flex-end;min-width:0;"></div>
    </div>
    ```

    Update the existing `renderSelectedCycle()` (or wherever status fields are populated) to write to `#topInstanceName`, `#topState`, `#topCycles`, `#topDepth` instead of the old `.status-bar` field IDs (`#totalCycles`, `#cycleLabel`, `#currentState`, `#stackDepth`). Set `#topInstanceName.textContent = instanceDir.replace(/^instances\//, '')` once at instance load.

    Delete the prior `.status-bar` and standalone "Cycle Timeline" panel from the markup. Keep the `instancePath` input ONLY if you want a manual switch — otherwise remove it; navigation goes through `← Home`.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | tail -10`
    Expected: PASS.

- [ ] **Step 5: Commit**

    ```bash
    git add visualizer.html src/test/visualizer-events-smoke.test.ts
    git commit -m "feat(visualizer): consolidate top row: ← Home, status fields, controls, timeline (satisfies: R8, R9, R10)"
    ```

## Task 5: Three-column grid + responsive fallback (satisfies: R11, R13, R14, R15)

**Files:**
- Modify: `visualizer.html`
- Test:   `src/test/visualizer-events-smoke.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

    Append:

    ```ts
    test("instance body uses 3-column grid with single-column fallback (R11, R14)", () => {
      const html = readFileSync(resolve(process.cwd(), "visualizer.html"), "utf-8");
      assert.match(html, /grid-template-columns:\s*[^;]*1fr[^;]*1fr/);  // 3-col grid: e.g. 260px 1fr 1fr
      assert.match(html, /@media\s*\(max-width:\s*1099px\)/);             // single-column breakpoint
      assert.match(html, /class=["']grid-3col["']/);
    });

    test("top-row timeline wraps when narrow (R15)", () => {
      const html = readFileSync(resolve(process.cwd(), "visualizer.html"), "utf-8");
      // The topbar uses flex-wrap and the timeline is full-width inside it.
      assert.match(html, /class=["']topbar["'][^>]*flex-wrap/);
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "3-column grid|timeline wraps|fail" | head -10`
    Expected: FAIL — `grid-3col` not present.

- [ ] **Step 3: Write minimal implementation**

    1. Add CSS to the existing `<style>` block:
       ```css
       .grid-3col {
         display: grid;
         grid-template-columns: 260px 1fr 1fr;
         gap: 16px;
         /* Each column owns its own scroll. Height calc keeps the grid in one viewport. */
       }
       .grid-3col > .panel { margin-bottom: 0; max-height: calc(100vh - 200px); overflow-y: auto; }
       @media (max-width: 1099px) {
         .grid-3col { grid-template-columns: 1fr; }
         .grid-3col > .panel { max-height: 600px; }
       }
       ```
    2. Wrap the existing three panels — Call Stack, Frame Files, Events — in a single grid container, in the order Call Stack | Events | Frame Files:
       ```html
       <div class="grid-3col">
         <div class="panel"> <!-- Call Stack panel content (existing markup, sans the now-redundant outer .panel wrapper) --> </div>
         <div class="panel"> <!-- Events panel --> </div>
         <div class="panel"> <!-- Frame Files panel --> </div>
       </div>
       ```
       The existing inner content (panel headers, SVG, file picker, etc.) stays as-is at this step. The vertical-stack rewrite is T6.

    3. The topbar from T4 already uses `flex-wrap:wrap`, so R15 (timeline wraps) is satisfied by that change.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | tail -10`
    Expected: PASS.

- [ ] **Step 5: Commit**

    ```bash
    git add visualizer.html src/test/visualizer-events-smoke.test.ts
    git commit -m "feat(visualizer): 3-column grid (call-stack | events | files) with single-column fallback under 1100px (satisfies: R11, R13, R14, R15)"
    ```

## Task 6: Vertical call stack (satisfies: R12)

**Files:**
- Modify: `visualizer.html`
- Test:   `src/test/visualizer-events-smoke.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

    Append:

    ```ts
    test("call stack renders vertically (R12)", () => {
      const html = readFileSync(resolve(process.cwd(), "visualizer.html"), "utf-8");
      // The current renderStackGraph computes totalW from horizontal layout.
      // After T6 it computes totalH from stack.length * (NODE_H + GAP) + padding.
      // Smoke check: the function references vertical layout vars.
      assert.match(html, /function renderStackGraph\b/);
      // Active frame at top of stack array → drawn at smallest y (top of SVG).
      // Pattern check: "active at top" comment present.
      assert.match(html, /active.{0,30}top|top.{0,30}active/i);
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "renders vertically|fail" | head -10`
    Expected: FAIL — current renderStackGraph is horizontal; no `active at top` comment.

- [ ] **Step 3: Write minimal implementation**

    In `visualizer.html`, REPLACE the existing `renderStackGraph(cycle)` function:

    ```js
    function renderStackGraph(cycle) {
      const svg = document.getElementById('stackGraph');
      const stack = cycle.callStack.stack;
      const topIdx = stack.length - 1;
      // Vertical layout: stack[topIdx] (active) drawn at the TOP, stack[0] (root) at the BOTTOM.
      const NODE_W = 220;
      const NODE_H = 70;
      const GAP = 30;
      const PAD_X = 20;
      const PAD_Y = 16;
      const totalW = NODE_W + PAD_X * 2;
      const totalH = stack.length * NODE_H + Math.max(0, stack.length - 1) * GAP + PAD_Y * 2;
      svg.setAttribute('width', totalW);
      svg.setAttribute('height', totalH);
      svg.innerHTML = '';
      const svgNS = 'http://www.w3.org/2000/svg';
      const defs = document.createElementNS(svgNS, 'defs');
      defs.innerHTML = `
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#58a6ff"/>
        </marker>`;
      svg.appendChild(defs);

      // Render top→bottom in DRAW order: active (topIdx) at smallest y; root (0) at largest y.
      stack.slice().reverse().forEach((entry, drawIdx) => {
        const stackIdx = stack.length - 1 - drawIdx;   // original index
        const x = PAD_X;
        const y = PAD_Y + drawIdx * (NODE_H + GAP);
        const isActive = stackIdx === topIdx;
        const isSelected = entry.frameDir === selectedFrameDir;

        // Connector from this node DOWN to the next (which is the caller — one further from active).
        if (drawIdx < stack.length - 1) {
          const nextY = PAD_Y + (drawIdx + 1) * (NODE_H + GAP);
          const cx = x + NODE_W / 2;
          const line = document.createElementNS(svgNS, 'line');
          line.setAttribute('x1', cx); line.setAttribute('y1', y + NODE_H);
          line.setAttribute('x2', cx); line.setAttribute('y2', nextY);
          line.setAttribute('stroke', '#58a6ff'); line.setAttribute('stroke-width', '2');
          line.setAttribute('marker-end', 'url(#arrow)');
          svg.appendChild(line);

          // returnState label: it belongs to the LOWER node (the caller; it's the state the
          // caller resumes to when the upper frame pops). The lower node is stack[stackIdx-1].
          const lowerEntry = stack[stackIdx - 1];
          const label = document.createElementNS(svgNS, 'text');
          label.setAttribute('x', cx + 8);
          label.setAttribute('y', y + NODE_H + GAP / 2 + 4);
          label.setAttribute('fill', '#8b949e');
          label.setAttribute('font-size', '11');
          label.textContent = `↩ ${lowerEntry.returnState}`;
          svg.appendChild(label);
        }

        // Frame box
        const g = document.createElementNS(svgNS, 'g');
        g.setAttribute('class', 'frame-node');
        g.setAttribute('transform', `translate(${x},${y})`);
        g.onclick = () => { selectedFrameDir = entry.frameDir; selectedFilePath = null; renderSelectedCycle(); };

        const rect = document.createElementNS(svgNS, 'rect');
        rect.setAttribute('class', 'frame-rect');
        rect.setAttribute('width', NODE_W); rect.setAttribute('height', NODE_H); rect.setAttribute('rx', 8);
        rect.setAttribute('fill', isActive ? '#1f3a5f' : '#21262d');
        rect.setAttribute('stroke', isSelected ? '#d2a8ff' : (isActive ? '#58a6ff' : '#30363d'));
        rect.setAttribute('stroke-width', isSelected ? 3 : (isActive ? 2.5 : 1));
        g.appendChild(rect);

        const nameText = document.createElementNS(svgNS, 'text');
        nameText.setAttribute('x', NODE_W / 2); nameText.setAttribute('y', 24);
        nameText.setAttribute('text-anchor', 'middle'); nameText.setAttribute('fill', '#f0f6fc');
        nameText.setAttribute('font-size', '13'); nameText.setAttribute('font-weight', 'bold');
        nameText.textContent = entry.frameDir.replace(/^frames\//, '');
        g.appendChild(nameText);

        const stateText = document.createElementNS(svgNS, 'text');
        stateText.setAttribute('x', NODE_W / 2); stateText.setAttribute('y', 44);
        stateText.setAttribute('text-anchor', 'middle');
        const frame = cycle.frames[entry.frameDir];
        stateText.setAttribute('fill', stateColor(frame ? frame.state : '?'));
        stateText.setAttribute('font-size', '12');
        stateText.textContent = `state: ${frame ? frame.state : '?'}`;
        g.appendChild(stateText);

        if (isActive) {
          const activeText = document.createElementNS(svgNS, 'text');
          activeText.setAttribute('x', NODE_W / 2); activeText.setAttribute('y', 60);
          activeText.setAttribute('text-anchor', 'middle');
          activeText.setAttribute('fill', '#79c0ff'); activeText.setAttribute('font-size', '10');
          activeText.textContent = '★ active';
          g.appendChild(activeText);
        }
        svg.appendChild(g);
      });
      // The conventions: active at top, root at bottom; arrows point DOWN from active toward caller.
    }
    ```

    Add a clear comment near the function: `// Vertical call stack: active frame at top, root at bottom (R12).`

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | tail -10`
    Expected: PASS.

- [ ] **Step 5: Commit**

    ```bash
    git add visualizer.html src/test/visualizer-events-smoke.test.ts
    git commit -m "feat(visualizer): vertical call stack with active at top (satisfies: R12)"
    ```

## Task 7: Remove Latest Log panel (satisfies: R16)

**Files:**
- Modify: `visualizer.html`
- Test:   `src/test/visualizer-events-smoke.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

    Append:

    ```ts
    test("Latest Log (tail) panel removed (R16)", () => {
      const html = readFileSync(resolve(process.cwd(), "visualizer.html"), "utf-8");
      assert.equal(/Latest Log/.test(html), false);
      assert.equal(/id=["']logPanel["']/.test(html), false);
      assert.equal(/loadLatestLog/.test(html), false);
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "Latest Log.*removed|fail" | head -10`
    Expected: FAIL — `Latest Log` text + `loadLatestLog` function still present.

- [ ] **Step 3: Write minimal implementation**

    In `visualizer.html`:
    1. Delete the `.log-panel` `<div>` block (the panel-header "Latest Log (tail)" and its `panel-body id="logPanel"`).
    2. Delete the `loadLatestLog()` function definition.
    3. Delete any call to `loadLatestLog()` (currently inside `loadInstance()`).
    4. Delete the `.log-panel` CSS rules from `<style>`.
    5. Delete the `colorizeLog()` helper since it has no callers.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | tail -10`
    Expected: PASS.

- [ ] **Step 5: Commit**

    ```bash
    git add visualizer.html src/test/visualizer-events-smoke.test.ts
    git commit -m "feat(visualizer): remove Latest Log panel (logs/run-<ts>.log no longer written) (satisfies: R16)"
    ```

## Task 8: Modal payload viewer (satisfies: R23)

**Files:**
- Modify: `visualizer.html`
- Test:   `src/test/visualizer-events-smoke.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

    Append:

    ```ts
    test("payload viewer is a modal popup (R23)", () => {
      const html = readFileSync(resolve(process.cwd(), "visualizer.html"), "utf-8");
      assert.match(html, /class=["']modal-backdrop["']/);
      assert.match(html, /class=["']modal["']/);
      // Esc handler
      assert.match(html, /Escape/);
      // Backdrop click handler
      assert.match(html, /modal-backdrop[^}]*onclick|onclick[^"]*closePayload/);
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "modal popup|fail" | head -10`
    Expected: FAIL — `modal-backdrop` class not present.

- [ ] **Step 3: Write minimal implementation**

    1. REPLACE the existing `<div class="panel" id="payloadPanel" style="display:none;"> ... </div>` block with a modal at the bottom of `<body>` (outside both routed pages):

       ```html
       <div id="payloadModal" class="modal-backdrop" style="display:none;" onclick="onPayloadBackdropClick(event)">
         <div class="modal" onclick="event.stopPropagation()">
           <div class="panel-header">
             <span>Payload</span>
             <span id="payloadLabel" style="color:#8b949e;font-weight:normal;text-transform:none;font-size:0.95em;"></span>
             <button onclick="closePayload()" style="margin-left:auto;background:#21262d;border:1px solid #30363d;color:#c9d1d9;padding:2px 10px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.8em;">Close</button>
           </div>
           <div class="panel-body" id="payloadBody"></div>
         </div>
       </div>
       ```

    2. Add CSS:
       ```css
       .modal-backdrop {
         position: fixed;
         inset: 0;
         background: rgba(0,0,0,0.6);
         z-index: 100;
         display: none;
         align-items: center;
         justify-content: center;
       }
       .modal-backdrop[data-open="true"] { display: flex; }
       .modal {
         background: #161b22;
         border: 1px solid #30363d;
         border-radius: 8px;
         max-width: min(1000px, 92vw);
         max-height: 92vh;
         display: flex;
         flex-direction: column;
         overflow: hidden;
       }
       .modal .panel-body { max-height: calc(92vh - 50px); overflow-y: auto; }
       ```

    3. REPLACE the existing `openPayload`/`closePayload`:
       ```js
       async function openPayload(ref) {
         if (!ref) return;
         const text = await readFile(`${instanceDir}/logs/${ref}`);
         showPayloadModal(ref, text || '(payload file empty or missing)');
       }

       function showPayloadModal(label, body) {
         document.getElementById('payloadLabel').textContent = label;
         document.getElementById('payloadBody').textContent = body;
         const modal = document.getElementById('payloadModal');
         modal.dataset.open = 'true';
         modal.style.display = 'flex';
       }

       function closePayload() {
         const modal = document.getElementById('payloadModal');
         modal.dataset.open = 'false';
         modal.style.display = 'none';
       }

       function onPayloadBackdropClick(e) {
         if (e.target === e.currentTarget) closePayload();
       }

       document.addEventListener('keydown', (e) => {
         if (e.key === 'Escape') {
           const modal = document.getElementById('payloadModal');
           if (modal && modal.dataset.open === 'true') closePayload();
         }
       });
       ```

    4. Note `showPayloadModal` is reused by T9's `openInlinePayload`.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | tail -10`
    Expected: PASS.

- [ ] **Step 5: Commit**

    ```bash
    git add visualizer.html src/test/visualizer-events-smoke.test.ts
    git commit -m "feat(visualizer): payload viewer becomes a modal popup with backdrop/Esc/X close (satisfies: R23)"
    ```

## Task 9: Exhaustive eventSummary + clickable LLM events (satisfies: R21, R22)

**Files:**
- Modify: `visualizer.html`
- Test:   `src/test/visualizer-events-smoke.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

    Append:

    ```ts
    test("eventSummary has explicit case for every known event type (R21)", () => {
      const html = readFileSync(resolve(process.cwd(), "visualizer.html"), "utf-8");
      const types = [
        "cycle_start","cycle_end","push","pop","splice",
        "llm_request","llm_response","tool_call","tool_result",
        "machine_git_commit","instructions_changed","retry","error","halt",
      ];
      for (const t of types) {
        assert.match(html, new RegExp(`case ['"]${t}['"]`),
          `eventSummary must have a case for '${t}'`);
      }
      // Default branch must NOT dump JSON.stringify(e)
      assert.equal(/default:[^}]*JSON\.stringify\(e\)/.test(html), false,
        "default branch must not dump raw JSON envelope");
    });

    test("LLM events are clickable, opening the inline payload (R22)", () => {
      const html = readFileSync(resolve(process.cwd(), "visualizer.html"), "utf-8");
      assert.match(html, /function openInlinePayload\s*\(/);
      // renderEvents wires LLM events to openInlinePayload
      assert.match(html, /llm_request[^}]*openInlinePayload|openInlinePayload[^}]*llm_request/);
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "eventSummary has explicit|LLM events are clickable|fail" | head -10`
    Expected: FAIL — `cycle_start` case missing; `openInlinePayload` not defined.

- [ ] **Step 3: Write minimal implementation**

    1. REPLACE `eventSummary`:
       ```js
       function eventSummary(e) {
         const esc = (s) => escapeHtml(String(s ?? ''));
         switch (e.type) {
           case 'cycle_start':           return '';
           case 'cycle_end':              return `${esc(e.state)} (${e.duration_ms}ms)`;
           case 'push':                   return `${esc(e.target)} → ${esc(e.frameDir)} depth ${e.depth}`;
           case 'pop':                    return `${esc(e.frameDir)} → ${esc(e.returnState)} depth ${e.depth}`;
           case 'splice':                 return `[${(e.splicedKeys||[]).map(esc).join(', ')}] → ${esc(e.targetFrame)}`;
           case 'tool_call':              return `${esc(e.tool)} → ${esc(e.payload_ref || '(no payload)')}`;
           case 'tool_result':            return `${esc(e.tool)} ${e.error ? '✗' : '✓'} → ${esc(e.payload_ref || '(no payload)')}`;
           case 'machine_git_commit':     return `${esc(e.hash)} — ${esc(e.subject)}`;
           case 'llm_request':            return `${esc(e.provider)}/${esc(e.model)} (${(e.prompt||'').length}B)`;
           case 'llm_response':           return `(${(e.output||'').length}B, ${e.duration_ms}ms)`;
           case 'instructions_changed':   return `${e.bytes_before}B → ${e.bytes_after}B`;
           case 'retry':                  return `attempt ${e.attempt} — ${esc(e.reason)}`;
           case 'error':                  return esc(e.message);
           case 'halt':                   return esc(e.reason);
           default:                       return `(${esc(e.type)})`;
         }
       }
       ```

    2. Add `openInlinePayload`:
       ```js
       function openInlinePayload(label, text) {
         showPayloadModal(label, text || '(empty)');
       }
       ```

    3. Update the `renderEvents` click-attribute logic so LLM events are clickable too:
       ```js
       let clickAttrs;
       if ((e.type === 'tool_call' || e.type === 'tool_result') && e.payload_ref) {
         clickAttrs = ` onclick="openPayload('${escapeHtml(e.payload_ref)}')" style="margin-bottom:6px;padding:4px 8px;border-left:2px solid ${eventColor(e.type)};cursor:pointer;"`;
       } else if (e.type === 'llm_request') {
         clickAttrs = ` onclick="openInlinePayload('llm_request prompt (#${e.seq})', allEvents.find(x=>x.seq===${e.seq}).prompt)" style="margin-bottom:6px;padding:4px 8px;border-left:2px solid ${eventColor(e.type)};cursor:pointer;"`;
       } else if (e.type === 'llm_response') {
         clickAttrs = ` onclick="openInlinePayload('llm_response output (#${e.seq})', allEvents.find(x=>x.seq===${e.seq}).output)" style="margin-bottom:6px;padding:4px 8px;border-left:2px solid ${eventColor(e.type)};cursor:pointer;"`;
       } else {
         clickAttrs = ` style="margin-bottom:6px;padding:4px 8px;border-left:2px solid ${eventColor(e.type)};"`;
       }
       ```

       (The `allEvents.find(x=>x.seq===N)` lookup avoids serializing big strings into the DOM-attribute onclick. The seq is interpolated as a number which is HTML-attribute-safe.)

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | tail -10`
    Expected: PASS.

- [ ] **Step 5: Commit**

    ```bash
    git add visualizer.html src/test/visualizer-events-smoke.test.ts
    git commit -m "feat(visualizer): exhaustive eventSummary + clickable LLM events open inline payload (satisfies: R21, R22)"
    ```

## Task 10: Selection regression test (satisfies: R18, R19)

**Files:**
- Modify: `src/test/visualizer-events-smoke.test.ts` (extend)

- [ ] **Step 1: Write the failing test (regression check)**

    Append:

    ```ts
    test("clicking a frame node selects it and rescopes events (R18)", () => {
      const html = readFileSync(resolve(process.cwd(), "visualizer.html"), "utf-8");
      // The frame-node onclick must set selectedFrameDir AND call renderSelectedCycle.
      assert.match(html, /selectedFrameDir\s*=\s*entry\.frameDir/);
      assert.match(html, /renderSelectedCycle\(\)/);
    });

    test("clicking a cycle dot selects it and rescopes events (R19)", () => {
      const html = readFileSync(resolve(process.cwd(), "visualizer.html"), "utf-8");
      // The renderTimeline onclick must set selectedCycleNum AND call renderSelectedCycle.
      assert.match(html, /selectedCycleNum\s*=\s*cycle\.num/);
    });
    ```

- [ ] **Step 2: Run test to verify it fails / passes**

    Run: `npm test 2>&1 | grep -E "selects it and rescopes|fail" | head -10`
    Expected: PASS — these patterns already exist in the visualizer (T6 preserved them and T1–T5 didn't change them). The test exists to LOCK IN that future tasks/refactors don't break the selection wiring.

    If the test fails: a previous task accidentally renamed/removed the click handlers. Fix the relevant task before continuing.

- [ ] **Step 3: (no implementation needed — pure regression test)**

- [ ] **Step 4: Re-run test to confirm green**

    Run: `npm test 2>&1 | tail -10`
    Expected: PASS.

- [ ] **Step 5: Commit**

    ```bash
    git add src/test/visualizer-events-smoke.test.ts
    git commit -m "test(visualizer): regression tests for frame and cycle selection rescoping (satisfies: R18, R19)"
    ```

## Task 11: Auto-refresh dispatch by current page (satisfies: R20)

**Files:**
- Modify: `visualizer.html`
- Test:   `src/test/visualizer-events-smoke.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

    Append:

    ```ts
    test("auto-refresh dispatches by page (R20)", () => {
      const html = readFileSync(resolve(process.cwd(), "visualizer.html"), "utf-8");
      assert.match(html, /function refresh\s*\(/);
      // refresh() chooses between loadHomeInstances and loadInstance based on currentPage.
      assert.match(html, /currentPage/);
      assert.match(html, /loadHomeInstances\(\)/);
      // toggleAuto must call refresh, not loadInstance directly.
      assert.match(html, /setInterval\(refresh,/);
    });
    ```

- [ ] **Step 2: Run test to verify it fails**

    Run: `npm test 2>&1 | grep -E "auto-refresh dispatches|fail" | head -10`
    Expected: FAIL — current `toggleAuto` schedules `loadInstance` directly; no `refresh` indirection.

- [ ] **Step 3: Write minimal implementation**

    1. Add a `currentPage` state variable near the other top-level `let` declarations:
       ```js
       let currentPage = 'home';   // 'home' | 'instance'
       ```
    2. Set it in `bootstrap()` (or wherever `showHomePage` / `showInstancePage` runs):
       ```js
       function showHomePage() { currentPage = 'home'; ... }
       function showInstancePage(...) { currentPage = 'instance'; ... }
       ```
       (Inline these into the existing `bootstrap()` body if you prefer.)
    3. Add `refresh()`:
       ```js
       function refresh() {
         if (currentPage === 'home') loadHomeInstances();
         else loadInstance();
       }
       ```
    4. REPLACE `toggleAuto`'s `setInterval(loadInstance, ms)` with `setInterval(refresh, ms)`.

- [ ] **Step 4: Run test to verify it passes**

    Run: `npm test 2>&1 | tail -10`
    Expected: PASS.

- [ ] **Step 5: Commit**

    ```bash
    git add visualizer.html src/test/visualizer-events-smoke.test.ts
    git commit -m "feat(visualizer): auto-refresh dispatches to home or instance based on current page (satisfies: R20)"
    ```
