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
});
