import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { parseRoute, formatRoute, type Route } from "../visualizer/url-router.js";

describe("url-router", () => {
  test("`?instance=X` → graph view, per-frame mode (R1, R4)", () => {
    const r = parseRoute("?instance=instances/demo4b");
    assert.deepEqual(r, { kind: "graph", instance: "instances/demo4b", mode: "frame" });
  });

  test("`?instance=X&mode=cycle` → graph view, per-cycle mode", () => {
    const r = parseRoute("?instance=instances/demo4b&mode=cycle");
    assert.deepEqual(r, { kind: "graph", instance: "instances/demo4b", mode: "cycle" });
  });

  test("`?instance=X&cycle=N` → cycle drill-down view (R13, R19)", () => {
    const r = parseRoute("?instance=instances/demo4b&cycle=42");
    assert.deepEqual(r, { kind: "cycle", instance: "instances/demo4b", cycle: 42, frame: null });
  });

  test("`?instance=X&cycle=N&frame=F` → cycle view with explicit frame (R12, R19)", () => {
    const r = parseRoute("?instance=instances/demo4b&cycle=12&frame=frames/f001-dialogue");
    assert.deepEqual(r, { kind: "cycle", instance: "instances/demo4b", cycle: 12, frame: "frames/f001-dialogue" });
  });

  test("`?` (no instance) → home", () => {
    const r = parseRoute("");
    assert.deepEqual(r, { kind: "home" });
  });

  test("formatRoute round-trips (R19)", () => {
    const cases: Route[] = [
      { kind: "home" },
      { kind: "graph", instance: "instances/demo4b", mode: "frame" },
      { kind: "graph", instance: "instances/demo4b", mode: "cycle" },
      { kind: "cycle", instance: "instances/demo4b", cycle: 7, frame: null },
      { kind: "cycle", instance: "instances/demo4b", cycle: 7, frame: "frames/f001-dialogue" },
    ];
    for (const r of cases) {
      assert.deepEqual(parseRoute(formatRoute(r)), r);
    }
  });

  test("backToGraph strips cycle/frame (R18)", () => {
    const cycleRoute: Route = { kind: "cycle", instance: "instances/demo4b", cycle: 7, frame: "frames/f001-dialogue" };
    const formatted = formatRoute({ kind: "graph", instance: cycleRoute.instance, mode: "frame" });
    assert.equal(formatted, "?instance=instances/demo4b");
  });
});
