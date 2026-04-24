import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";

describe("web_search (custom, non-CC)", () => {
  let origFetch: typeof globalThis.fetch;
  let origBackend: string | undefined;
  let origTimeout: string | undefined;

  beforeEach(() => {
    origFetch = globalThis.fetch;
    origBackend = process.env.WEB_SEARCH_BACKEND;
    origTimeout = process.env.WEB_TIMEOUT;
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
    if (origBackend === undefined) delete process.env.WEB_SEARCH_BACKEND;
    else process.env.WEB_SEARCH_BACKEND = origBackend;
    if (origTimeout === undefined) delete process.env.WEB_TIMEOUT;
    else process.env.WEB_TIMEOUT = origTimeout;
  });

  test("happy path: DuckDuckGo HTML returns parsed results", async () => {
    delete process.env.WEB_SEARCH_BACKEND;
    globalThis.fetch = (async () => new Response(
      `<html><body>
       <div class="result">
         <h2 class="result__title"><a href="https://example.com/a">Result A</a></h2>
         <a class="result__url" href="https://example.com/a">example.com/a</a>
         <div class="result__snippet">Snippet A body.</div>
       </div>
       <div class="result">
         <h2 class="result__title"><a href="https://example.com/b">Result B</a></h2>
         <a class="result__url" href="https://example.com/b">example.com/b</a>
         <div class="result__snippet">Snippet B body.</div>
       </div>
       </body></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    )) as unknown as typeof globalThis.fetch;

    const { webSearch } = await import("../web-tools.js");
    const out = await webSearch("consensus protocols");
    assert.ok("results" in out);
    assert.equal(out.results.length, 2);
    assert.equal(out.results[0].title, "Result A");
    assert.ok(out.results[0].url.includes("example.com/a"));
    assert.match(out.results[0].snippet, /Snippet A/);
  });

  test("empty query returns diagnostic, no fetch", async () => {
    let called = false;
    globalThis.fetch = (async () => { called = true; return new Response(""); }) as unknown as typeof globalThis.fetch;
    const { webSearch } = await import("../web-tools.js");
    const out = await webSearch("");
    assert.deepEqual(out.results, []);
    assert.ok(out.note && out.note.length > 0);
    assert.equal(called, false);
  });

  test("non-200 backend returns diagnostic shape", async () => {
    globalThis.fetch = (async () => new Response("boom", { status: 503 })) as unknown as typeof globalThis.fetch;
    const { webSearch } = await import("../web-tools.js");
    const out = await webSearch("anything");
    assert.deepEqual(out.results, []);
    assert.match(out.note ?? "", /503|http/i);
  });

  test("empty-result HTML returns 'no results' diagnostic", async () => {
    globalThis.fetch = (async () => new Response(
      `<html><body><p>No matches.</p></body></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    )) as unknown as typeof globalThis.fetch;
    const { webSearch } = await import("../web-tools.js");
    const out = await webSearch("anything");
    assert.deepEqual(out.results, []);
    assert.match(out.note ?? "", /no results/i);
  });

  test("abort / timeout returns diagnostic shape", async () => {
    process.env.WEB_TIMEOUT = "0";
    globalThis.fetch = ((_url: string, init?: RequestInit) => new Promise((_, rej) => {
      init?.signal?.addEventListener("abort", () => rej(new Error("aborted")));
    })) as unknown as typeof globalThis.fetch;
    const { webSearch } = await import("../web-tools.js");
    const out = await webSearch("anything");
    assert.deepEqual(out.results, []);
    assert.match(out.note ?? "", /error|abort|timeout/i);
  });

  test("unknown backend env var returns diagnostic shape", async () => {
    process.env.WEB_SEARCH_BACKEND = "nonesuch";
    const { webSearch } = await import("../web-tools.js");
    const out = await webSearch("anything");
    assert.deepEqual(out.results, []);
    assert.match(out.note ?? "", /unknown backend|nonesuch/i);
  });
});
