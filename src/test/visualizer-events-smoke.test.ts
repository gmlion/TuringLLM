import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("visualizer.html events panel scaffold", () => {
  const html = readFileSync(resolve(process.cwd(), "visualizer.html"), "utf-8");

  test("declares an events panel container (R24)", () => {
    assert.match(html, /id=["']eventsPanel["']/);
  });

  test("loads events.jsonl from the instance dir (R28)", () => {
    assert.match(html, /events\.jsonl/);
  });

  test("renders events filtered by selectedCycleNum + selectedFrameDir (R24, R25)", () => {
    assert.match(html, /selectedCycleNum/);
    assert.match(html, /selectedFrameDir/);
    assert.match(html, /renderEvents/);
  });

  test("event-type filter UI present (R26)", () => {
    const html = readFileSync(resolve(process.cwd(), "visualizer.html"), "utf-8");
    assert.match(html, /id=["']eventTypeFilters["']/);
    assert.match(html, /enabledEventTypes/);
  });

  test("clicking a tool event fetches its payload_ref (R27)", () => {
    const html = readFileSync(resolve(process.cwd(), "visualizer.html"), "utf-8");
    assert.match(html, /openPayload|fetchPayload/);
    assert.match(html, /payload_ref/);
  });

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

  test("instance view top row consolidates controls + status + timeline (R8, R9)", () => {
    const html = readFileSync(resolve(process.cwd(), "visualizer.html"), "utf-8");
    // ← Home link
    assert.match(html, /←\s*Home/);
    // The standalone .status-bar div is gone (its fields moved into the top row).
    assert.equal(/<div class=["']status-bar["']/.test(html), false);
    // The timeline div ID is still present (it just moved into the top row).
    assert.match(html, /id=["']timeline["']/);
  });

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

  test("Latest Log (tail) panel removed (R16)", () => {
    const html = readFileSync(resolve(process.cwd(), "visualizer.html"), "utf-8");
    assert.equal(/Latest Log/.test(html), false);
    assert.equal(/id=["']logPanel["']/.test(html), false);
    assert.equal(/loadLatestLog/.test(html), false);
  });

  test("payload viewer is a modal popup (R23)", () => {
    const html = readFileSync(resolve(process.cwd(), "visualizer.html"), "utf-8");
    assert.match(html, /class=["']modal-backdrop["']/);
    assert.match(html, /class=["']modal["']/);
    // Esc handler
    assert.match(html, /Escape/);
    // Backdrop click handler
    assert.match(html, /modal-backdrop[^}]*onclick|onclick[^"]*closePayload/);
  });

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
});
