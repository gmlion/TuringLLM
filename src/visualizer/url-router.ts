export type Route =
  | { kind: "home" }
  | { kind: "graph"; instance: string; mode: "frame" | "cycle" }
  | { kind: "cycle"; instance: string; cycle: number; frame: string | null };

/** Parse a `window.location.search` string into a Route. */
export function parseRoute(search: string): Route {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const instance = params.get("instance");
  if (!instance) return { kind: "home" };
  const cycleStr = params.get("cycle");
  if (cycleStr !== null) {
    const cycle = parseInt(cycleStr, 10);
    const frame = params.get("frame");
    return { kind: "cycle", instance, cycle, frame: frame ?? null };
  }
  const mode = params.get("mode") === "cycle" ? "cycle" : "frame";
  return { kind: "graph", instance, mode };
}

/** Format a Route as the matching `window.location.search` string. */
export function formatRoute(r: Route): string {
  if (r.kind === "home") return "";
  const p = new URLSearchParams();
  p.set("instance", r.instance);
  if (r.kind === "cycle") {
    p.set("cycle", String(r.cycle));
    if (r.frame) p.set("frame", r.frame);
  } else if (r.mode === "cycle") {
    p.set("mode", "cycle");
  }
  // URLSearchParams.toString() encodes `/` as `%2F`, but instance/frame paths
  // are more readable with literal slashes. Decode `%2F` back so the URL
  // round-trips cleanly through parseRoute (URLSearchParams parses both forms
  // identically) and matches the expected display form.
  return "?" + p.toString().replace(/%2F/g, "/");
}
