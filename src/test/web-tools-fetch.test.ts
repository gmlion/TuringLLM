import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";

describe("web_fetch (custom, non-CC)", () => {
  let origFetch: typeof globalThis.fetch;
  let origTimeout: string | undefined;
  beforeEach(() => {
    origFetch = globalThis.fetch;
    origTimeout = process.env.WEB_TIMEOUT;
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
    if (origTimeout === undefined) delete process.env.WEB_TIMEOUT;
    else process.env.WEB_TIMEOUT = origTimeout;
  });

  test("happy path: HTML page returns text stripped of scripts/styles", async () => {
    globalThis.fetch = (async () => new Response(
      `<html><head><style>.x{}</style><script>var x=1;</script></head>
       <body><h1>Hello</h1><p>World.</p><noscript>skip</noscript></body></html>`,
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    )) as unknown as typeof globalThis.fetch;

    const { webFetch } = await import("../web-tools.js");
    const out = await webFetch("https://example.com/");
    assert.ok("text" in out);
    if ("text" in out) {
      assert.match(out.text, /Hello/);
      assert.match(out.text, /World\./);
      assert.doesNotMatch(out.text, /var x=1/);
      assert.doesNotMatch(out.text, /\.x\{\}/);
      assert.doesNotMatch(out.text, /skip/);
    }
  });

  test("empty URL returns diagnostic, no fetch", async () => {
    let called = false;
    globalThis.fetch = (async () => { called = true; return new Response(""); }) as unknown as typeof globalThis.fetch;
    const { webFetch } = await import("../web-tools.js");
    const out = await webFetch("");
    assert.ok("error" in out);
    assert.equal(called, false);
  });

  test("non-2xx HTTP returns error diagnostic", async () => {
    globalThis.fetch = (async () => new Response("x", { status: 404, headers: { "content-type": "text/html" } })) as unknown as typeof globalThis.fetch;
    const { webFetch } = await import("../web-tools.js");
    const out = await webFetch("https://example.com/missing");
    assert.ok("error" in out);
    if ("error" in out) assert.match(out.error, /404|http/i);
  });

  test("non-HTML content-type returns diagnostic (no binary passthrough)", async () => {
    globalThis.fetch = (async () => new Response("%PDF-1.4", { status: 200, headers: { "content-type": "application/pdf" } })) as unknown as typeof globalThis.fetch;
    const { webFetch } = await import("../web-tools.js");
    const out = await webFetch("https://example.com/doc.pdf");
    assert.ok("error" in out);
    if ("error" in out) assert.match(out.error, /non-html|pdf/i);
  });

  test("timeout returns error diagnostic", async () => {
    process.env.WEB_TIMEOUT = "0";
    globalThis.fetch = ((_url: string, init?: RequestInit) => new Promise((_, rej) => {
      init?.signal?.addEventListener("abort", () => rej(new Error("aborted")));
    })) as unknown as typeof globalThis.fetch;
    const { webFetch } = await import("../web-tools.js");
    const out = await webFetch("https://example.com/slow");
    assert.ok("error" in out);
  });
});
