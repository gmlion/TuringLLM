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
});
