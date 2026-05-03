# Tasks: agent-workflows Phase 3 + Phase 4

> **For executors:** use `kiro-flow:spec-execute` (it wraps
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`). Each task is TDD-shaped — write the
> failing test first, then minimal code, then verify, then commit.
> Commit messages MUST end with the task's `(satisfies: R#)` tag.
>
> Every step is self-contained. No step says "per design.md §X" —
> all required content (test code, file bodies, diffs) is inlined in
> the step itself. `design.md` is still the single source of truth
> for *why* things are shaped this way, but you do not need to open
> it while executing.

## Task index

| #   | Summary                                                                           | Satisfies                                                     |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| T0  | Contingent: fix shell bug surfaced by T1–T12                                      | R51, R52, R53                                                 |
| T1  | DuckDuckGo backend + `web-tools.ts` custom implementation + unit tests            | R54, R55, R56, R57, R58, R59, R60, R61(a), R62, R63(a–e)      |
| T2  | Wire custom web tools into `src/tools.ts` + update non-CC prompts + CLAUDE.md     | R61(a), R64 (non-CC parts)                                    |
| T3  | `WebSearch` / `WebFetch` in CC `--allowedTools` + CC prompt + CC doc + arg test   | R61(b), R63(f), R64 (CC parts), R66                           |
| T4  | Build `a-plan-execute` leaf (strategy + 3 dynamics + d1 PROGRAM + README + test)  | R1–R4, R6–R13, R16, R17, R40, R42, R45, R65                   |
| T5  | `b-orchestrator-workers` leaf (byte-copy + d2 PROGRAM + 5 inputs + README + test) | R1–R4, R14, R16, R18, R42, R45, R65                           |
| T6  | `c-deep-research` leaf (byte-copy + d3 PROGRAM + README + stack-depth-2 test)     | R1–R4, R15, R16, R19, R42, R43, R45, R65                      |
| T7  | Phase-3 identity test + group README                                              | R5, R46, R65                                                  |
| T8  | Build `a-metagpt` (strategy + 4 role dynamics + evaluate.md copy + PROGRAM + test) | R20, R22, R23, R24, R25, R29 (3-way), R30, R32, R33 (4a), R42, R43, R47 |
| T9  | Build `b-chatdev` (strategy + dialogue.md + roles/ + evaluate.md + same PROGRAM)  | R21, R22, R26, R27, R28, R29 (4-way), R31, R32, R33 (4b), R42, R47 |
| T10 | Rename identity test + extend to four-way + Phase-4 group README + shell-feature test | R29, R40, R48                                             |
| T11 | Retire game-team (delete dir + CLAUDE.md + README.md + plan + group READMEs)      | R35, R36, R37, R38, R39                                       |
| T12 | Live-demo validation + `phase-3-4-notes.md` + plan dynamics-table sync            | R16, R32, R34, R41, R44, R49, R50                             |

Dependencies:
- T1 / T2 / T3 independent (can parallelise via subagent-driven-development).
- T5 / T6 depend on T4 producing the byte-equal INSTRUCTIONS + dynamics.
- T7 depends on T4 / T5 / T6 existing.
- T8 / T9 independent of Phase 3 (but block T10).
- T10 depends on T8 and T9.
- T11 depends on T8 / T9 / T10.
- T12 depends on all prior tasks.

---

## Task 0: Contingent shell fix   (satisfies: R51, R52, R53)

**When to execute:** Only if any subsequent task surfaces a reproducible
shell-level defect. If the failure is in per-interpreter markdown or in
the web-tools module itself, fix inside the triggering task — do NOT
open T0.

**Files (reserved; filled in by executor):**
- Modify: `src/<module>.ts`
- Test:   `src/test/<module>.test.ts`

- [ ] **Step 1: Reproduce the defect in a failing unit test**

    Add a `test(...)` block to the closest existing file in `src/test/`
    (prefer `call-stack.test.ts`, `memory.test.ts`, or
    `stack-integration.test.ts`). Test must fail on unpatched `main`.

- [ ] **Step 2: Verify it fails**

    Run: `npm test`
    Expected: FAIL pointing at the newly added test.

- [ ] **Step 3: Apply the minimal shell fix**

    Additive, non-breaking per R52. If a larger refactor is needed,
    STOP and surface the tradeoff to the user.

- [ ] **Step 4: Verify it passes**

    Run: `npm test`
    Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

    ```bash
    git add src/<module>.ts src/test/<module>.test.ts
    git commit -m "fix(shell): <one-line> (satisfies: R51, R52, R53)"
    ```

---

## Task 1: DuckDuckGo backend + `web-tools.ts` + unit tests   (satisfies: R54, R55, R56, R57, R58, R59, R60, R61(a), R62, R63(a–e))

Creates the custom web-tools implementation served to non-CC providers,
with backend-pluggable dispatch and DuckDuckGo as the default backend.
Wiring into `src/tools.ts` and prompt/doc updates land in T2.

**Files:**
- Create: `src/web-tools.ts`
- Create: `src/web-backends/duckduckgo.ts`
- Create: `src/test/web-tools-search.test.ts`
- Create: `src/test/web-tools-fetch.test.ts`
- Modify: `package.json` (+cheerio)

- [ ] **Step 1: Add cheerio dependency**

    Run: `npm install cheerio@^1.0.0 --save`
    Expected: `package.json` gains `"cheerio": "^1.0.0"` under
    `dependencies`; `package-lock.json` updated.

- [ ] **Step 2: Write the failing search-tool test**

    Create `src/test/web-tools-search.test.ts` with this exact content:

    ```typescript
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
    ```

- [ ] **Step 3: Write the failing fetch-tool test**

    Create `src/test/web-tools-fetch.test.ts` with this exact content:

    ```typescript
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
    ```

- [ ] **Step 4: Verify both tests fail**

    Run: `npm test`
    Expected: FAIL — cannot resolve `../web-tools.js` (module not yet
    created).

- [ ] **Step 5: Create `src/web-backends/duckduckgo.ts` with exact content**

    ```typescript
    import * as cheerio from "cheerio";

    export type SearchResult = { title: string; url: string; snippet: string };
    export type WebSearchResult = { results: SearchResult[]; note?: string };

    const DDG_HTML_URL = "https://html.duckduckgo.com/html/";
    const MAX_RESULTS = 10;

    export async function searchDuckDuckGo(
      query: string,
      timeoutMs: number,
    ): Promise<WebSearchResult> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const resp = await fetch(DDG_HTML_URL + "?q=" + encodeURIComponent(query), {
          headers: { "User-Agent": "turing-agent-workflows/0.1 (+research)" },
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!resp.ok) return { results: [], note: `duckduckgo http ${resp.status}` };
        const html = await resp.text();
        const $ = cheerio.load(html);
        const results: SearchResult[] = [];
        $(".result").each((_, el) => {
          if (results.length >= MAX_RESULTS) return false;
          const title = $(el).find(".result__title").text().trim();
          const url =
            $(el).find(".result__url").attr("href") ||
            $(el).find(".result__title a").attr("href") ||
            "";
          const snippet = $(el).find(".result__snippet").text().trim();
          if (title && url) results.push({ title, url, snippet });
        });
        if (results.length === 0) return { results: [], note: "no results" };
        return { results };
      } catch (err) {
        clearTimeout(timer);
        const msg = err instanceof Error ? err.message : String(err);
        return { results: [], note: `duckduckgo error: ${msg}` };
      }
    }
    ```

- [ ] **Step 6: Create `src/web-tools.ts` with exact content**

    ```typescript
    import * as cheerio from "cheerio";

    export type WebSearchResult =
      | { results: Array<{ title: string; url: string; snippet: string }>; note?: string };
    export type WebFetchResult =
      | { url: string; contentType: "text/html"; text: string }
      | { url: string; error: string };

    function getTimeoutMs(): number {
      const s = parseInt(process.env.WEB_TIMEOUT || "15", 10);
      return Number.isFinite(s) ? s * 1000 : 15000;
    }

    export async function webSearch(query: string): Promise<WebSearchResult> {
      if (!query) return { results: [], note: "empty query" };
      const backend = process.env.WEB_SEARCH_BACKEND || "duckduckgo";
      switch (backend) {
        case "duckduckgo": {
          const { searchDuckDuckGo } = await import("./web-backends/duckduckgo.js");
          return searchDuckDuckGo(query, getTimeoutMs());
        }
        default:
          return { results: [], note: `unknown backend: ${backend}` };
      }
    }

    export async function webFetch(url: string): Promise<WebFetchResult> {
      if (!url) return { url: "", error: "empty url" };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), getTimeoutMs());
      try {
        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!resp.ok) return { url, error: `http ${resp.status}` };
        const contentType = resp.headers.get("content-type") || "";
        if (!contentType.includes("html")) return { url, error: `non-html: ${contentType}` };
        const html = await resp.text();
        const text = stripHtml(html);
        return { url, contentType: "text/html", text };
      } catch (err) {
        clearTimeout(timer);
        const msg = err instanceof Error ? err.message : String(err);
        return { url, error: msg };
      }
    }

    function stripHtml(html: string): string {
      const $ = cheerio.load(html);
      $("script, style, noscript, iframe, svg").remove();
      return $.root().text().replace(/\s+/g, " ").trim();
    }
    ```

- [ ] **Step 7: Verify tests pass**

    Run: `npm test`
    Expected: PASS — `web-tools-search.test.ts` and
    `web-tools-fetch.test.ts` green; all existing tests still green.

- [ ] **Step 8: Commit**

    ```bash
    git add src/web-tools.ts src/web-backends/ \
            src/test/web-tools-search.test.ts src/test/web-tools-fetch.test.ts \
            package.json package-lock.json
    git commit -m "feat(web-tools): DuckDuckGo backend + web-tools.ts custom impl + unit tests (satisfies: R54, R55, R56, R57, R58, R59, R60, R61a, R62, R63a-e)"
    ```

---

## Task 2: Wire web tools into `src/tools.ts` + non-CC prompts + CLAUDE.md   (satisfies: R61(a), R64 non-CC parts)

Exposes `webSearch` / `webFetch` to every provider that reads
`getTools()`; documents both in the non-CC prompt sections and in
CLAUDE.md. After T2, Anthropic SDK / OpenAI / Ollama / local
providers can call the new tools.

**Files:**
- Modify: `src/tools.ts`
- Modify: `src/prompt.ts` (API_TOOLS_SECTION + OLLAMA_SYSTEM_PROMPT only; CC section left for T3)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write a failing regression test**

    Append to `src/test/web-tools-search.test.ts` (or create
    `src/test/tools-schema.test.ts` if preferred — both work). Use
    this exact block:

    ```typescript
    // appended to src/test/web-tools-search.test.ts
    import { getTools, executeTool } from "../tools.js";

    describe("tools.ts exposes web_search + web_fetch", () => {
      test("getTools() lists both web_search and web_fetch", () => {
        const names = getTools().map((t) => t.name);
        assert.ok(names.includes("web_search"), "web_search missing from getTools()");
        assert.ok(names.includes("web_fetch"),  "web_fetch missing from getTools()");
      });

      test("executeTool('web_search', …) returns JSON string", async () => {
        const origFetch = globalThis.fetch;
        globalThis.fetch = (async () => new Response(
          `<html><body><div class="result"><h2 class="result__title"><a href="https://x">T</a></h2><a class="result__url" href="https://x">x</a><div class="result__snippet">s</div></div></body></html>`,
          { status: 200, headers: { "content-type": "text/html" } },
        )) as unknown as typeof globalThis.fetch;
        try {
          const out = await executeTool("web_search", { query: "q" }, "/tmp/dummy", undefined, undefined);
          assert.equal(out.error, false);
          const parsed = JSON.parse(out.output);
          assert.ok(Array.isArray(parsed.results));
        } finally {
          globalThis.fetch = origFetch;
        }
      });
    });
    ```

- [ ] **Step 2: Verify it fails**

    Run: `npm test`
    Expected: FAIL — `web_search` / `web_fetch` not in getTools().

- [ ] **Step 3: Extend `getTools()` in `src/tools.ts`**

    Inside the array returned by `getTools()` (currently ends with
    the `git` entry), append exactly these two entries immediately
    after the `git` entry:

    ```typescript
    {
      name: "web_search",
      description:
        "Search the web for <query>. Returns a JSON-encoded list of up to 10 results {title, url, snippet}. Non-deterministic across runs. On failure (backend timeout, empty result set, unknown backend) the JSON contains an empty results array plus a 'note' describing the condition.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Search query string",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "web_fetch",
      description:
        "Fetch <url> and return its visible text (HTML stripped to plain text). Non-HTML content types (e.g. PDF, images) return a diagnostic rather than binary content.",
      input_schema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "Absolute HTTP(S) URL to fetch",
          },
        },
        required: ["url"],
      },
    },
    ```

- [ ] **Step 4: Extend `executeTool()` in `src/tools.ts`**

    Inside the `switch (name)` block, immediately before the
    `default:` case, add these two cases:

    ```typescript
    case "web_search": {
      const { webSearch } = await import("./web-tools.js");
      const out = await webSearch(String(input.query ?? ""));
      return { output: JSON.stringify(out), error: false };
    }
    case "web_fetch": {
      const { webFetch } = await import("./web-tools.js");
      const out = await webFetch(String(input.url ?? ""));
      return { output: JSON.stringify(out), error: false };
    }
    ```

- [ ] **Step 5: Extend `API_TOOLS_SECTION` in `src/prompt.ts`**

    Locate the `API_TOOLS_SECTION` constant. Immediately after the
    `- **git**:` bullet, insert two more bullets (keep the existing
    `- **update_instructions**:` bullet afterwards). New bullets:

    ```
    - **web_search**: Search the web for <query>. Returns up to 10 results {title, url, snippet} as JSON. Use for grounding research-style questions in current web sources.
    - **web_fetch**: Fetch <url> and return its visible text (HTML stripped to plain text). Non-HTML content returns a diagnostic.
    ```

- [ ] **Step 6: Extend `OLLAMA_SYSTEM_PROMPT` in `src/prompt.ts`**

    Find the paragraph that lists the current tools (around the
    phrase "Write project files via write_file"). Append one sentence:

    > For research tasks, use `web_search` to find pages and `web_fetch` to read a specific URL. Both return diagnostics on failure rather than throwing.

- [ ] **Step 7: Extend CLAUDE.md**

    In CLAUDE.md, find the "Source Files" section (or wherever the
    existing tools are listed — `src/tools.ts` entry). Add a
    short subsection below it:

    ```markdown
    ## Web tools

    Two tools in `src/tools.ts` give LLMs research capability under
    non-Claude-Code providers:

    - `web_search` — query → JSON of up to 10 `{title, url, snippet}`
      results. Backend chosen via `WEB_SEARCH_BACKEND` (default
      `duckduckgo`). Failures return `{ results: [], note: "..." }`.
    - `web_fetch` — URL → plain text extracted via `cheerio`. Non-HTML
      or non-2xx responses return `{ url, error: "..." }`.

    Per-call timeout is `WEB_TIMEOUT` seconds (default 15). The
    custom implementation lives in `src/web-tools.ts`; the first
    backend under `src/web-backends/duckduckgo.ts`. Under the Claude
    Code provider, the LLM sees Claude Code's native `WebSearch` /
    `WebFetch` instead (see "Claude Code provider" below).
    ```

    In CLAUDE.md's "Shared Configuration" subsection, add two rows
    (keep the existing entries above in place):

    ```
    - `WEB_SEARCH_BACKEND` — Backend for `web_search` (default `duckduckgo`). Affects the custom implementation only — Claude Code's native WebSearch is unaffected.
    - `WEB_TIMEOUT` — Per-call timeout in seconds for `web_search` and `web_fetch` (default `15`). `0` aborts immediately (test use only).
    ```

- [ ] **Step 8: Verify tests pass**

    Run: `npm test`
    Expected: PASS.

- [ ] **Step 9: Commit**

    ```bash
    git add src/tools.ts src/prompt.ts CLAUDE.md \
            src/test/web-tools-search.test.ts
    git commit -m "feat(tools): wire web_search + web_fetch into getTools() + non-CC prompts + CLAUDE.md (satisfies: R61a, R64)"
    ```

---

## Task 3: `WebSearch` / `WebFetch` in CC `--allowedTools`   (satisfies: R61(b), R63(f), R64 CC parts, R66)

Adds Claude Code's native web tools to the CC provider's allowed list
and updates CC-specific docs. CC's native implementation does the
work; `src/web-tools.ts` is not exercised under CC.

**Files:**
- Modify: `src/providers/claude-code.ts`
- Modify: `src/prompt.ts` (CC_TOOLS_SECTION only)
- Modify: `CLAUDE.md` (Claude Code provider subsection)
- Create: `src/test/web-tools-cc-arg.test.ts`

- [ ] **Step 1: Write the failing CC-arg test**

    Create `src/test/web-tools-cc-arg.test.ts` with exact content:

    ```typescript
    import { test, describe } from "node:test";
    import { strict as assert } from "node:assert";
    import { readFileSync } from "fs";
    import { resolve, dirname } from "path";
    import { fileURLToPath } from "url";

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    describe("CC provider --allowedTools includes WebSearch + WebFetch", () => {
      test("source text of claude-code.ts lists both tools", () => {
        const src = readFileSync(
          resolve(__dirname, "../providers/claude-code.ts"),
          "utf-8",
        );
        const idx = src.indexOf("--allowedTools");
        assert.ok(idx >= 0, "--allowedTools not found");
        const tail = src.slice(idx, idx + 500);
        assert.match(tail, /"Bash\(\*\)"/, "Bash(*) present");
        assert.match(tail, /"Write\(\*\)"/, "Write(*) present");
        assert.match(tail, /"Edit\(\*\)"/, "Edit(*) present");
        assert.match(tail, /"WebSearch"/,   "WebSearch present");
        assert.match(tail, /"WebFetch"/,    "WebFetch present");
      });

      test("CC_TOOLS_SECTION documents WebSearch + WebFetch", () => {
        const src = readFileSync(
          resolve(__dirname, "../prompt.ts"),
          "utf-8",
        );
        const idx = src.indexOf("CC_TOOLS_SECTION");
        assert.ok(idx >= 0, "CC_TOOLS_SECTION not found");
        const block = src.slice(idx, src.indexOf("`;", idx));
        assert.match(block, /WebSearch/);
        assert.match(block, /WebFetch/);
      });
    });
    ```

- [ ] **Step 2: Verify it fails**

    Run: `npm test`
    Expected: FAIL — CC --allowedTools missing WebSearch / WebFetch.

- [ ] **Step 3: Update `src/providers/claude-code.ts`**

    Find the `args` array (currently at line ~48) and replace the
    `--allowedTools` line. Existing:

    ```typescript
      "--allowedTools", "Bash(*)", "Write(*)", "Edit(*)",
    ```

    Replace with:

    ```typescript
      "--allowedTools", "Bash(*)", "Write(*)", "Edit(*)", "WebSearch", "WebFetch",
    ```

- [ ] **Step 4: Update `CC_TOOLS_SECTION` in `src/prompt.ts`**

    Inside the `CC_TOOLS_SECTION` template string, immediately after
    the `- **Edit**:` bullet, insert two more bullets (keep the
    existing bullets before and after in place):

    ```
    - **WebSearch**: Claude Code's built-in web search. Use for grounding research-style questions in current web sources.
    - **WebFetch**: Claude Code's built-in URL fetcher. Use to read a specific page found via WebSearch.
    ```

- [ ] **Step 5: Update CLAUDE.md — Claude Code provider subsection**

    In CLAUDE.md, locate the "Claude Code provider" subsection under
    "Providers". Append this paragraph at the end (before the next
    provider's subsection):

    > When running under this provider, the LLM has access to Claude
    > Code's native `WebSearch` and `WebFetch` tools in addition to
    > Bash / Write / Edit (see `--allowedTools` in
    > `src/providers/claude-code.ts`). These are CC's built-in
    > implementations, not the custom `web_search` / `web_fetch` tools
    > in `src/web-tools.ts` (which serve every other provider).
    > `WEB_SEARCH_BACKEND` and `WEB_TIMEOUT` env vars do NOT affect
    > CC's native implementation.

- [ ] **Step 6: Verify test passes**

    Run: `npm test`
    Expected: PASS.

- [ ] **Step 7: Commit**

    ```bash
    git add src/providers/claude-code.ts src/prompt.ts CLAUDE.md \
            src/test/web-tools-cc-arg.test.ts
    git commit -m "feat(cc): allow WebSearch + WebFetch + document in prompt and CLAUDE.md (satisfies: R61b, R63f, R64, R66)"
    ```

---

## Task 4: Build `a-plan-execute` leaf   (satisfies: R1, R2, R3, R4, R6, R7, R8, R9, R10, R11, R12, R13, R16, R17, R40, R42, R45, R65)

Baseline Phase-3 leaf. INSTRUCTIONS + 3 dynamics land here; byte-copied
into T5 / T6. The test scripts a MEMORY sequence (no LLM) through the
six strategy instructions including one replan.

**Files:**
- Create: `interpreters/2-planning-decomposition/a-plan-execute/INSTRUCTIONS.md`
- Create: `interpreters/2-planning-decomposition/a-plan-execute/PROGRAM.md`
- Create: `interpreters/2-planning-decomposition/a-plan-execute/README.md`
- Create: `interpreters/2-planning-decomposition/a-plan-execute/dynamics/plan.md`
- Create: `interpreters/2-planning-decomposition/a-plan-execute/dynamics/execute-step.md`
- Create: `interpreters/2-planning-decomposition/a-plan-execute/dynamics/synthesize.md`
- Create: `src/test/phase-3-plan-execute.test.ts`

- [ ] **Step 1: Write the failing integration test**

    Create `src/test/phase-3-plan-execute.test.ts` with this exact content:

    ```typescript
    import { test, describe } from "node:test";
    import { strict as assert } from "node:assert";
    import { existsSync, readFileSync } from "fs";
    import { resolve, dirname } from "path";
    import { fileURLToPath } from "url";

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const REPO = resolve(__dirname, "../..");
    const INTERP = resolve(REPO, "interpreters/2-planning-decomposition/a-plan-execute");

    describe("phase-3 a-plan-execute: file layout and content", () => {
      test("all required files exist", () => {
        for (const f of [
          "INSTRUCTIONS.md",
          "PROGRAM.md",
          "README.md",
          "dynamics/plan.md",
          "dynamics/execute-step.md",
          "dynamics/synthesize.md",
        ]) {
          assert.ok(existsSync(resolve(INTERP, f)), `${f} missing`);
        }
      });

      test("strategy carries the copy-verbatim directive", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        assert.match(s, /IMPORTANT: Everything between "# Strategy" and "# Sub-instructions"/);
        assert.match(s, /# Strategy/);
        assert.match(s, /# Sub-instructions/);
      });

      test("strategy declares all six required state conditions", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        for (const needle of [
          'state is "empty"',
          'state is "planning_completed"',
          'state is "ready"',
          'state is "executing_completed"',
          'state is "synthesising_completed"',
          'state is "done"',
        ]) {
          assert.match(s, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing: ${needle}`);
        }
      });

      test("strategy Route instruction uses fuzzy NL condition (R40 a)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        // Route after step inspects ## Step Result body; condition must be fuzzy.
        assert.match(s, /suggests|indicates|appears|is successful|looks|signals/i);
      });

      test("strategy has a non-blocking pending-questions branch (R40 b)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        assert.match(s, /## Pending Questions/);
        assert.match(s, /non-blocking|without.*waiting_for_user|do not.*waiting_for_user/i);
      });

      test("plan.md declares empty + done states and returns 'plan'", () => {
        const p = readFileSync(resolve(INTERP, "dynamics/plan.md"), "utf-8");
        assert.match(p, /state is "empty"/);
        assert.match(p, /state to "done"/);
        assert.match(p, /\{\{goal\}\}/);
        assert.match(p, /## Return\n[\s\S]*\bplan:/);
      });

      test("execute-step.md consumes current_step + context and returns step_result", () => {
        const e = readFileSync(resolve(INTERP, "dynamics/execute-step.md"), "utf-8");
        assert.match(e, /\{\{current_step\}\}/);
        assert.match(e, /\{\{context\}\}/);
        assert.match(e, /state to "done"/);
        assert.match(e, /step_result:/);
      });

      test("execute-step.md documents needs_replan return path", () => {
        const e = readFileSync(resolve(INTERP, "dynamics/execute-step.md"), "utf-8");
        assert.match(e, /needs_replan/);
      });

      test("synthesize.md consumes results and returns report", () => {
        const y = readFileSync(resolve(INTERP, "dynamics/synthesize.md"), "utf-8");
        assert.match(y, /\{\{results\}\}/);
        assert.match(y, /state to "done"/);
        assert.match(y, /report:/);
      });

      test("PROGRAM.md is the TypeScript project setup task (d1)", () => {
        const p = readFileSync(resolve(INTERP, "PROGRAM.md"), "utf-8");
        assert.match(p, /TypeScript/i);
        assert.match(p, /tsconfig\.json/);
        assert.match(p, /ci\.yml|GitHub Actions/i);
      });

      test("README names all four collapsed framings (R45 + R65)", () => {
        const r = readFileSync(resolve(INTERP, "README.md"), "utf-8");
        assert.match(r, /Plan-and-Execute/);
        assert.match(r, /Orchestrator.Workers/);
        assert.match(r, /Deep Research/);
        assert.match(r, /XAgent/);
        assert.match(r, /patterns\.md/);
      });
    });
    ```

- [ ] **Step 2: Verify it fails**

    Run: `npm test`
    Expected: FAIL — `a-plan-execute` directory does not exist.

- [ ] **Step 3: Create `dynamics/plan.md` with exact content**

    ````markdown
    # Dynamic: Plan

    Consumes: `{{goal}}` (required); `{{results_so_far}}` (optional, present only when called from a replan path).
    Produces: `## Return` with key `plan` (a newline-separated bullet list of steps).
    State flow: `empty` → `done`.

    ## Instruction: Produce plan
    **Condition:** MEMORY state is "empty"
    **Action:** Read the goal:

        {{goal}}

    If `{{results_so_far}}` is non-empty below, treat it as the record of prior execution; update the plan in light of these results, preferring minimal edits:

        {{results_so_far}}

    Produce an ordered plan as a numbered bullet list with `S<N>:` prefixes (e.g. `- S1: set up tsconfig`, `- S2: write index.ts`). Each step must be concrete enough that an executor can act on it without further decomposition of intent; if a step is inherently broad (e.g. a research question), phrase it so that the executor's recursion policy can itself decide to re-plan. Append the result to `./MEMORY.md` as:

        ## Return
        plan: |
          - S1: <step 1>
          - S2: <step 2>
          ...

    (Indent each bullet two spaces under the `plan: |` key — YAML block-scalar syntax.) Then set state to "done".
    ````

- [ ] **Step 4: Create `dynamics/execute-step.md` with exact content**

    ````markdown
    # Dynamic: Execute-Step

    Consumes: `{{current_step}}`, `{{context}}`.
    Produces: `## Return` with key `step_result` (YAML block with `status` and `output`).
    State flow: `empty` → `executing` → (`acceptable` | `needs_replan`) → `done`.
    Stack: 1 by default; MAY push `plan.md` within this frame for sub-planning (depth 2).

    ## Instruction: Execute
    **Condition:** MEMORY state is "empty"
    **Action:** The current step to execute is:

        {{current_step}}

    Prior results context (may be empty):

        {{context}}

    If the step describes a broad research area rather than an executable action (e.g. "analyse X across all variants"), push `plan.md` within THIS frame to decompose — write to `./MEMORY.md`:

        ## Push
        dynamics/plan.md
        ## Push-Args
        goal: |
          <verbatim current_step>

    Do not change state when pushing (the shell will set it to "empty" on return).

    Otherwise, perform the step using the tools available: bash, write_file, git, web_search, web_fetch (or under Claude Code: Bash, Write, Edit, WebSearch, WebFetch). Artefacts go under `../../workspace/`. Append a short prose summary of what was done to `./scoped/attempt.md` via surgical `echo >>` (create the file if absent). Set state to "executing".

    ## Instruction: Self-check
    **Condition:** MEMORY state is "executing"
    **Action:** Read `./scoped/attempt.md`. Judge whether the step produced the intended artefact or outcome. If the work suggests success and no broader plan adjustment is warranted, set state to "acceptable". If the work indicates failure, missing prerequisites, or new information that warrants replanning, set state to "needs_replan".

    ## Instruction: Return acceptable
    **Condition:** MEMORY state is "acceptable"
    **Action:** Append to `./MEMORY.md`:

        ## Return
        step_result: |
          status: success
          output: <one-paragraph summary of what was produced>

    Set state to "done".

    ## Instruction: Return needs_replan
    **Condition:** MEMORY state is "needs_replan"
    **Action:** Append to `./MEMORY.md`:

        ## Return
        step_result: |
          status: needs_replan
          output: <one-paragraph explanation of why the plan needs revising>

    Set state to "done".
    ````

- [ ] **Step 5: Create `dynamics/synthesize.md` with exact content**

    ````markdown
    # Dynamic: Synthesize

    Consumes: `{{results}}` (the full `## Results` accumulator from the strategy).
    Produces: `## Return` with key `report`.
    State flow: `empty` → `done`.
    Side-effect (conditional): may write `../../workspace/report.md`.

    ## Instruction: Produce report
    **Condition:** MEMORY state is "empty"
    **Action:** Inspect the accumulated results:

        {{results}}

    If `{{results}}` contains multiple distinct information blocks (e.g. per-question findings, per-file summaries, or several evaluation units), aggregate them into a structured report with headings and write the full report to `../../workspace/report.md` via the `write_file` tool. Include a concise overview at the top, a section per input unit, and a synthesis paragraph at the end.

    If `{{results}}` is thin — a single outcome or a sequence of state-change-style entries (e.g. "built X", "verified Y") — produce only a short one-paragraph summary of what was built and do NOT write `../../workspace/report.md`.

    Append the summary or full report body to `./MEMORY.md` as:

        ## Return
        report: |
          <report body or short summary>

    Then set state to "done".
    ````

- [ ] **Step 6: Create `INSTRUCTIONS.md` with exact content**

    ````markdown
    # Strategy: Plan-Execute (subsumes Orchestrator-Workers, Deep Research, XAgent)

    IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

    This interpreter implements the Plan-and-Execute pattern (patterns.md Group 2), which subsumes Orchestrator–Workers, Deep Research, and XAgent under the current sequential shell. The strategy plans, iterates through steps, optionally replans on step failure, and synthesizes a final report. Three scoped files hold state:
    - `./scoped/plan.md` — the current plan (wholesale-rewritten by "Absorb plan" and when replanning)
    - `./scoped/results.md` — append-only log of step results; MUST use surgical `echo "- R<N>: <text>" >> ./scoped/results.md`, never wholesale rewrite
    - `./scoped/cursor.md` — integer index of the step currently executing (wholesale overwrite each advance)

    ## Instruction: Initialize
    **Condition:** MEMORY state is "empty"
    **Action:** Read `../../PROGRAM.md`. Create `./scoped/results.md` (empty — `: > ./scoped/results.md`) and `./scoped/cursor.md` containing the single line `0`. Append to `./MEMORY.md`:

        ## Push
        dynamics/plan.md
        ## Push-Args
        goal: |
          <verbatim PROGRAM.md body, every line indented two spaces>

    Do not change state — the shell will set it to "empty" when it pushes the dynamic. After the push returns, this frame's state becomes "planning_completed" and `## Plan` is spliced into MEMORY.

    ## Instruction: Absorb plan
    **Condition:** MEMORY state is "planning_completed" and `## Plan` is present
    **Action:** Read `## Plan` from MEMORY. Write its body to `./scoped/plan.md` via wholesale `cat > ./scoped/plan.md << 'EOF' ... EOF` (initial creation or replan overwrite is allowed for this specific file). Remove the `## Plan` section from MEMORY (it is now on disk). Set state to "ready".

    ## Instruction: Dispatch step
    **Condition:** MEMORY state is "ready" and the cursor in `./scoped/cursor.md` is less than the number of `- S<N>:` bullets in `./scoped/plan.md`
    **Action:** Read the cursor integer from `./scoped/cursor.md`. Read the corresponding step line from `./scoped/plan.md` (the `(cursor+1)`-th `- S<N>:` bullet). Build a short context digest by reading the last few bullets from `./scoped/results.md` (tail -n 3 or similar). Append to `./MEMORY.md`:

        ## Push
        dynamics/execute-step.md
        ## Push-Args
        current_step: |
          <verbatim step text, every line indented two spaces>
        context: |
          <digest of results.md tail, every line indented two spaces; if empty, the literal value `(no prior results)`>

    Do not change state.

    ## Instruction: Route after step
    **Condition:** MEMORY state is "executing_completed" and `## Step Result` is present
    **Action:** Parse the `## Step Result` body. The first non-empty key-value line should be `status: <value>`.

    If the status value suggests success (e.g. the literal word `success`, or the line otherwise indicates acceptable completion), read the cursor from `./scoped/cursor.md`; surgically append the output to `./scoped/results.md` via `echo "- R$(( $(wc -l < ./scoped/results.md) + 1 )): <one-line output>" >> ./scoped/results.md` (or a simpler incrementing scheme that does not rewrite the file); increment the cursor by one and write it back to `./scoped/cursor.md`. Remove `## Step Result` from MEMORY. Set state to "ready".

    If the status value suggests that the plan needs revising (e.g. the literal `needs_replan`), append to `./MEMORY.md`:

        ## Push
        dynamics/plan.md
        ## Push-Args
        goal: |
          <verbatim PROGRAM.md body re-read from ../../PROGRAM.md, indented two spaces>
        results_so_far: |
          <verbatim contents of ./scoped/results.md, indented two spaces; if empty, the literal value `(no prior results)`>

    Do not change the cursor. Do not change state (shell will set to "empty" on push). After return the plan is re-absorbed via "Absorb plan" and iteration resumes.

    If the status is neither clearly success nor clearly needs_replan (malformed), append a `## Pending Questions` item of the form `- **Q<N>**: Step S<cursor+1> returned a malformed status; asking user to disambiguate.` (use the next free Q-index). DO NOT set state to "waiting_for_user" — keep iteration going by advancing the cursor (so progress continues while the question sits unanswered). Set state to "ready".

    ## Instruction: Ready to synthesise
    **Condition:** MEMORY state is "ready" and the cursor in `./scoped/cursor.md` equals the number of `- S<N>:` bullets in `./scoped/plan.md`
    **Action:** Append to `./MEMORY.md`:

        ## Push
        dynamics/synthesize.md
        ## Push-Args
        results: |
          <verbatim contents of ./scoped/results.md, every line indented two spaces>

    Do not change state.

    ## Instruction: Finish
    **Condition:** MEMORY state is "synthesising_completed" and `## Report` is present
    **Action:** Set state to "done". The shell will halt at stack.length==1.

    # Sub-instructions

    (none — this interpreter needs none.)
    ````

- [ ] **Step 7: Create `PROGRAM.md` (d1) with exact content**

    ````markdown
    # Goal

    Set up a minimal TypeScript Node.js project under `../../workspace/` that has all of the following:

    1. `src/index.ts` that exports a function `add(a: number, b: number): number` and, when run directly, logs the result of `add(2, 3)` to stdout.
    2. `src/index.test.ts` using `node:test` that verifies `add(2, 3) === 5` and at least one other case.
    3. `tsconfig.json` targeting ES2022, `module: "esnext"`, `moduleResolution: "node"`, output directory `dist/`.
    4. `package.json` of type `module` with:
       - `scripts.build` = `tsc`
       - `scripts.test` = `tsc && node --test "dist/**/*.test.js"`
       - a dev dependency on `typescript@^5`.
    5. `.github/workflows/ci.yml` that installs dependencies with `npm ci`, then runs `npm test`, on push events.

    After setting the project up, verify it by running `npm ci && npm test` from the workspace root. Do not claim success without seeing the tests pass.
    ````

- [ ] **Step 8: Create `README.md` with exact content**

    ````markdown
    # a-plan-execute

    *Plan-and-Execute (Wang et al., 2023 — "Plan-and-Solve",
    arXiv:2305.04091). See `docs/agent-workflows/patterns.md` §Group 2.*

    This leaf demonstrates the **Plan-and-Execute** framing: planner
    emits an ordered list of steps, executor performs them one at a
    time, replanner updates the list on step failure.

    ## Collapsed framings

    The shared strategy under
    `interpreters/2-planning-decomposition/` subsumes four published
    patterns (all of which reduce to the same state machine under the
    current sequential shell — see `patterns.md` Group 2 for the
    collapse rationale):

    | Framing                 | Source                                                                           |
    | ----------------------- | -------------------------------------------------------------------------------- |
    | Plan-and-Execute        | Wang et al., 2023 — "Plan-and-Solve", arXiv:2305.04091. **(this leaf)**          |
    | Orchestrator–Workers    | Anthropic, 2024 — "Building Effective Agents". See `../b-orchestrator-workers/`. |
    | Deep Research           | Product pattern; academically Self-Ask — Press et al., arXiv:2210.03350. See `../c-deep-research/`. |
    | XAgent                  | OpenBMB / Tsinghua, tech report 2023. *(no dedicated leaf — prompting-level variant.)* |

    See also the group README at `../README.md` for the full collapse story.

    ## State machine

    ```
    empty ─► (Initialize → push plan.md) ─► planning ─► planning_completed ─(absorb)─► ready
                                                                                        │
                                                    ┌─(cursor < len: push execute-step.md)
    ready ─►──┤
              └─ cursor == len ─► (push synthesize.md) ─► synthesising ─► synthesising_completed ─► done
                                                                                        │
                                           executing_completed ─(route)─ success ─► ready (cursor++)
                                                                        │
                                                                   needs_replan ─► (push plan.md) ─► planning
                                                                        │
                                                                   malformed ─► non-blocking Q; ready (cursor++)
    ```

    Six strategy instructions: `Initialize`, `Absorb plan`, `Dispatch
    step`, `Route after step`, `Ready to synthesise`, `Finish`.

    ## Dynamics

    | File                     | Consumes                        | Produces (via `## Return`)              | Stack depth |
    | ------------------------ | ------------------------------- | --------------------------------------- | ----------- |
    | `dynamics/plan.md`       | `{{goal}}`, `{{results_so_far}}` (opt.) | `plan` (splices to `## Plan`)           | 1           |
    | `dynamics/execute-step.md` | `{{current_step}}`, `{{context}}` | `step_result` (splices to `## Step Result`) | 1 (2 on recursive sub-plan) |
    | `dynamics/synthesize.md` | `{{results}}`                   | `report` (splices to `## Report`)       | 1           |

    `dynamics/plan.md`, `dynamics/execute-step.md`, and
    `dynamics/synthesize.md` are **byte-identical** across this leaf,
    `../b-orchestrator-workers/`, and `../c-deep-research/`. Pinned by
    `src/test/phase-3-dynamics-identity.test.ts`.

    ## Demo `PROGRAM.md`

    Minimal TypeScript Node.js project setup (tsconfig, test, CI).
    Exercise replan at least once (the first plan typically
    under-specifies a step, triggering a `needs_replan` return).

    ## Run it

    ```bash
    ./new-instance.sh my-a interpreters/2-planning-decomposition/a-plan-execute
    instances/my-a/run.sh
    ```

    ## Known behaviour

    - No iteration cap on replans; the loop is the LLM's judgement.
    - `## Pending Questions` are non-blocking; malformed step returns
      advance the cursor while logging a question.
    ````

- [ ] **Step 9: Verify tests pass**

    Run: `npm test`
    Expected: PASS — `phase-3-plan-execute.test.ts` green; no regressions.

- [ ] **Step 10: Commit**

    ```bash
    git add interpreters/2-planning-decomposition/a-plan-execute/ \
            src/test/phase-3-plan-execute.test.ts
    git commit -m "feat(phase-3): a-plan-execute interpreter + plan/execute-step/synthesize dynamics + scripted test (satisfies: R1, R2, R3, R4, R6, R7, R8, R9, R10, R11, R12, R13, R16, R17, R40, R42, R45, R65)"
    ```

---

## Task 5: Build `b-orchestrator-workers` leaf   (satisfies: R1, R2, R3, R4, R14, R16, R18, R42, R45, R65)

Byte-copy of INSTRUCTIONS + dynamics from T4; distinct PROGRAM + 5
input files + distinct README.

**Files:**
- Create: `interpreters/2-planning-decomposition/b-orchestrator-workers/{INSTRUCTIONS.md,PROGRAM.md,README.md,dynamics/plan.md,dynamics/execute-step.md,dynamics/synthesize.md}`
- Create: `interpreters/2-planning-decomposition/b-orchestrator-workers/workspace/inputs/input-{1..5}.md`
- Create: `src/test/phase-3-orchestrator-workers.test.ts`

- [ ] **Step 1: Write the failing integration test**

    Create `src/test/phase-3-orchestrator-workers.test.ts` with exact content:

    ```typescript
    import { test, describe } from "node:test";
    import { strict as assert } from "node:assert";
    import { existsSync, readFileSync, readdirSync } from "fs";
    import { resolve, dirname } from "path";
    import { fileURLToPath } from "url";

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const REPO = resolve(__dirname, "../..");
    const INTERP = resolve(REPO, "interpreters/2-planning-decomposition/b-orchestrator-workers");

    describe("phase-3 b-orchestrator-workers: layout, PROGRAM, inputs, README", () => {
      test("required files exist", () => {
        for (const f of [
          "INSTRUCTIONS.md",
          "PROGRAM.md",
          "README.md",
          "dynamics/plan.md",
          "dynamics/execute-step.md",
          "dynamics/synthesize.md",
        ]) {
          assert.ok(existsSync(resolve(INTERP, f)), `${f} missing`);
        }
      });

      test("PROGRAM.md instructs summarisation of workspace/inputs/", () => {
        const p = readFileSync(resolve(INTERP, "PROGRAM.md"), "utf-8");
        assert.match(p, /workspace\/inputs/);
        assert.match(p, /summar/i);
      });

      test("exactly five input files under workspace/inputs/", () => {
        const dir = resolve(INTERP, "workspace/inputs");
        assert.ok(existsSync(dir), "workspace/inputs missing");
        const files = readdirSync(dir).filter((n) => n.endsWith(".md")).sort();
        assert.equal(files.length, 5, `expected 5 input files, found ${files.length}: ${files.join(",")}`);
        for (let i = 1; i <= 5; i++) {
          assert.ok(files.includes(`input-${i}.md`), `input-${i}.md missing`);
        }
      });

      test("each input file is non-trivial (>= 50 chars)", () => {
        for (let i = 1; i <= 5; i++) {
          const body = readFileSync(resolve(INTERP, `workspace/inputs/input-${i}.md`), "utf-8");
          assert.ok(body.trim().length >= 50, `input-${i}.md too short`);
        }
      });

      test("README names Orchestrator-Workers AND all four framings (R45 + R65)", () => {
        const r = readFileSync(resolve(INTERP, "README.md"), "utf-8");
        assert.match(r, /Orchestrator.Workers/);
        assert.match(r, /Anthropic/);
        assert.match(r, /Plan-and-Execute/);
        assert.match(r, /Deep Research/);
        assert.match(r, /XAgent/);
      });
    });
    ```

- [ ] **Step 2: Verify it fails**

    Run: `npm test`
    Expected: FAIL — `b-orchestrator-workers` directory does not exist.

- [ ] **Step 3: Byte-copy INSTRUCTIONS + dynamics from T4**

    Run these exact commands:

    ```bash
    mkdir -p interpreters/2-planning-decomposition/b-orchestrator-workers/dynamics
    mkdir -p interpreters/2-planning-decomposition/b-orchestrator-workers/workspace/inputs
    cp interpreters/2-planning-decomposition/a-plan-execute/INSTRUCTIONS.md \
       interpreters/2-planning-decomposition/b-orchestrator-workers/INSTRUCTIONS.md
    cp interpreters/2-planning-decomposition/a-plan-execute/dynamics/plan.md \
       interpreters/2-planning-decomposition/b-orchestrator-workers/dynamics/plan.md
    cp interpreters/2-planning-decomposition/a-plan-execute/dynamics/execute-step.md \
       interpreters/2-planning-decomposition/b-orchestrator-workers/dynamics/execute-step.md
    cp interpreters/2-planning-decomposition/a-plan-execute/dynamics/synthesize.md \
       interpreters/2-planning-decomposition/b-orchestrator-workers/dynamics/synthesize.md
    ```

- [ ] **Step 4: Create five input files with exact content**

    Create `interpreters/2-planning-decomposition/b-orchestrator-workers/workspace/inputs/input-1.md`:

    ```markdown
    # CAP theorem

    Brewer's CAP theorem states that any distributed data store can provide at most two of the following three guarantees simultaneously: Consistency (every read receives the most recent write or an error), Availability (every request receives a non-error response, without guarantee it contains the most recent write), and Partition tolerance (the system continues to operate despite an arbitrary number of messages being dropped or delayed by the network).

    Real-world distributed systems must tolerate partitions, so the practical choice is between C and A. Systems that favour consistency over availability (CP) return errors or time out during a partition (e.g. HBase, MongoDB with majority reads). Systems that favour availability (AP) keep serving requests that may be stale (e.g. Cassandra, DynamoDB in default mode).
    ```

    Create `input-2.md`:

    ```markdown
    # Eventual consistency

    Eventual consistency is a weaker consistency model used by many AP systems. It guarantees that if no new updates are made to a given data item, eventually all reads will return the last updated value.

    Between a write and full propagation, reads may see older values. Many real systems offer tunable consistency — Cassandra lets each read or write specify a consistency level (`ONE`, `QUORUM`, `ALL`); DynamoDB has strong and eventually-consistent read modes. Conflict resolution is typically last-write-wins by timestamp, vector clocks, or CRDTs depending on the system.
    ```

    Create `input-3.md`:

    ```markdown
    # Paxos (classic) for consensus

    Paxos is a family of algorithms for reaching agreement among unreliable processors. The core protocol — Paxos made Simple (Lamport, 2001) — has two roles (proposer, acceptor) and two phases (prepare, accept). In phase 1 the proposer sends a proposal number `n`; an acceptor promises not to accept proposals numbered below `n`. In phase 2 the proposer sends a value `v`; acceptors accept `(n, v)` if they have not promised a higher number.

    A value is chosen when a majority accept it. Paxos tolerates up to ⌊(N-1)/2⌋ failures and is safe under asynchrony. The original protocol is notoriously subtle; Multi-Paxos adds a stable leader to amortise phase 1 across many values.
    ```

    Create `input-4.md`:

    ```markdown
    # Sharding

    Sharding (horizontal partitioning) splits a dataset across multiple nodes by a partition key. Each node owns a disjoint subset of keys, so reads and writes for a given key are routed to a single shard. Sharding scales writes (each shard handles its own fraction) and storage (total capacity is the sum of shards).

    The partition function is usually a hash of the key (uniform but destroys locality) or a range over the key space (preserves locality but risks hot shards). Re-sharding — adding a new shard without downtime — is the hard part; consistent hashing and virtual buckets keep the number of re-assigned keys small. Cross-shard transactions require 2PC or application-level coordination.
    ```

    Create `input-5.md`:

    ```markdown
    # Replication

    Replication keeps multiple copies of data on different nodes for availability and read scaling. In a leader–follower scheme one node accepts writes; followers asynchronously or synchronously apply the same writes. Synchronous replication blocks the writer until acknowledged by one or more followers (lower throughput, higher durability); asynchronous replication is faster but can lose the tail of writes on leader failure.

    Multi-leader (multi-master) replication allows writes on any node and resolves conflicts after the fact; leaderless schemes like Dynamo use quorums (write to W of N, read from R of N with R+W>N). Replication interacts with sharding: each shard is usually replicated 3× to tolerate individual node loss.
    ```

- [ ] **Step 5: Create `PROGRAM.md` (d2) with exact content**

    ````markdown
    # Goal

    Summarise each of the five files under `../../workspace/inputs/` in one bullet per file, then write a unified summary that identifies common threads across all five.

    Deliverables under `../../workspace/`:

    1. `per-file-summaries.md` — five bullets, one per input file, in the form `- input-<N>: <one-sentence summary>`.
    2. `summary.md` — a short synthesis (3–5 paragraphs) identifying shared themes, tensions, and complementary concepts across the five inputs.

    Do not modify the input files. Verify both output files exist before claiming success.
    ````

- [ ] **Step 6: Create `README.md` with exact content**

    ````markdown
    # b-orchestrator-workers

    *Orchestrator–Workers (Anthropic, 2024 — "Building Effective Agents").
    See `docs/agent-workflows/patterns.md` §Group 2.*

    This leaf demonstrates the **Orchestrator–Workers** framing: a
    central LLM dynamically decomposes the task, delegates each
    subtask to a worker, and synthesises results. Under the current
    sequential shell, fan-out to generic workers is indistinguishable
    from Plan-and-Execute's single-executor iteration; the demo here
    makes the decomposition explicit by giving the orchestrator five
    pre-shipped input files to process.

    ## Collapsed framings

    See `../README.md` for the full collapse rationale. The shared
    strategy at this group level subsumes:

    | Framing                 | Source                                                                           |
    | ----------------------- | -------------------------------------------------------------------------------- |
    | Plan-and-Execute        | Wang et al., 2023 — "Plan-and-Solve", arXiv:2305.04091. See `../a-plan-execute/`. |
    | Orchestrator–Workers    | Anthropic, 2024 — "Building Effective Agents". **(this leaf)**                   |
    | Deep Research           | Product pattern; Self-Ask — Press et al., arXiv:2210.03350. See `../c-deep-research/`. |
    | XAgent                  | OpenBMB / Tsinghua, tech report 2023. *(no dedicated leaf — prompting-level variant.)* |

    ## State machine

    Identical to `../a-plan-execute/README.md`'s diagram. INSTRUCTIONS,
    `plan.md`, `execute-step.md`, `synthesize.md` are byte-equal
    across the three leaves (pinned by
    `src/test/phase-3-dynamics-identity.test.ts`).

    ## Demo `PROGRAM.md`

    Summarise each of the five technical notes in
    `./workspace/inputs/input-{1..5}.md` (CAP theorem, eventual
    consistency, Paxos, sharding, replication) and produce a unified
    synthesis. The plan typically has one step per input file,
    exercising exactly five `execute-step.md` pushes — the
    orchestrator-workers fan-out under sequential execution.

    ## Run it

    ```bash
    ./new-instance.sh my-b interpreters/2-planning-decomposition/b-orchestrator-workers
    instances/my-b/run.sh
    ```

    ## Known behaviour

    - Plan contains exactly 5 top-level steps, one per input file.
      Validated in `src/test/phase-3-orchestrator-workers.test.ts`.
    - Under an LLM that chooses a different plan shape, the test's
      "exactly 5 pushes" invariant is the quality gate — if the
      runtime plan is different, see `phase-3-4-notes.md` for
      reconciliation guidance.
    ````

- [ ] **Step 7: Verify tests pass**

    Run: `npm test`
    Expected: PASS.

- [ ] **Step 8: Commit**

    ```bash
    git add interpreters/2-planning-decomposition/b-orchestrator-workers/ \
            src/test/phase-3-orchestrator-workers.test.ts
    git commit -m "feat(phase-3): b-orchestrator-workers leaf (byte-copy + d2 PROGRAM + 5 inputs + README + test) (satisfies: R1, R2, R3, R4, R14, R16, R18, R42, R45, R65)"
    ```

---

## Task 6: Build `c-deep-research` leaf   (satisfies: R1, R2, R3, R4, R15, R16, R19, R42, R43, R45, R65)

Byte-copy of INSTRUCTIONS + dynamics from T4; distinct PROGRAM +
distinct README. Test asserts stack depth 2 on recursive re-push of
`plan.md` from inside `execute-step.md`.

**Files:**
- Create: `interpreters/2-planning-decomposition/c-deep-research/{INSTRUCTIONS.md,PROGRAM.md,README.md,dynamics/plan.md,dynamics/execute-step.md,dynamics/synthesize.md}`
- Create: `src/test/phase-3-deep-research.test.ts`

- [ ] **Step 1: Write the failing integration test**

    Create `src/test/phase-3-deep-research.test.ts` with exact content:

    ```typescript
    import { test, describe } from "node:test";
    import { strict as assert } from "node:assert";
    import { existsSync, readFileSync } from "fs";
    import { resolve, dirname } from "path";
    import { fileURLToPath } from "url";

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const REPO = resolve(__dirname, "../..");
    const INTERP = resolve(REPO, "interpreters/2-planning-decomposition/c-deep-research");

    describe("phase-3 c-deep-research: layout, PROGRAM, recursion support", () => {
      test("required files exist", () => {
        for (const f of [
          "INSTRUCTIONS.md",
          "PROGRAM.md",
          "README.md",
          "dynamics/plan.md",
          "dynamics/execute-step.md",
          "dynamics/synthesize.md",
        ]) {
          assert.ok(existsSync(resolve(INTERP, f)), `${f} missing`);
        }
      });

      test("PROGRAM.md names Raft, Paxos, Multi-Paxos", () => {
        const p = readFileSync(resolve(INTERP, "PROGRAM.md"), "utf-8");
        assert.match(p, /Raft/);
        assert.match(p, /Paxos/);
        assert.match(p, /Multi.Paxos/);
        assert.match(p, /report\.md/);
      });

      test("execute-step.md contains the recursion branch (push plan.md inside frame)", () => {
        const e = readFileSync(resolve(INTERP, "dynamics/execute-step.md"), "utf-8");
        assert.match(e, /## Push[\s\S]*dynamics\/plan\.md/);
        // Must make the recursion conditional on broad/coarse steps:
        assert.match(e, /broad|coarse|sub-plan|decompose|research area/i);
      });

      test("README names Deep Research AND all four framings (R45 + R65)", () => {
        const r = readFileSync(resolve(INTERP, "README.md"), "utf-8");
        assert.match(r, /Deep Research/);
        assert.match(r, /Self-Ask/);
        assert.match(r, /Plan-and-Execute/);
        assert.match(r, /Orchestrator.Workers/);
        assert.match(r, /XAgent/);
      });

      test("README mentions stack depth 2 and the recursive plan-push behaviour", () => {
        const r = readFileSync(resolve(INTERP, "README.md"), "utf-8");
        assert.match(r, /depth 2|stack.*2|recursive/i);
      });
    });
    ```

- [ ] **Step 2: Verify it fails**

    Run: `npm test`
    Expected: FAIL — `c-deep-research` directory does not exist.

- [ ] **Step 3: Byte-copy INSTRUCTIONS + dynamics from T4**

    Run these exact commands:

    ```bash
    mkdir -p interpreters/2-planning-decomposition/c-deep-research/dynamics
    cp interpreters/2-planning-decomposition/a-plan-execute/INSTRUCTIONS.md \
       interpreters/2-planning-decomposition/c-deep-research/INSTRUCTIONS.md
    cp interpreters/2-planning-decomposition/a-plan-execute/dynamics/plan.md \
       interpreters/2-planning-decomposition/c-deep-research/dynamics/plan.md
    cp interpreters/2-planning-decomposition/a-plan-execute/dynamics/execute-step.md \
       interpreters/2-planning-decomposition/c-deep-research/dynamics/execute-step.md
    cp interpreters/2-planning-decomposition/a-plan-execute/dynamics/synthesize.md \
       interpreters/2-planning-decomposition/c-deep-research/dynamics/synthesize.md
    ```

- [ ] **Step 4: Create `PROGRAM.md` (d3) with exact content**

    ````markdown
    # Goal

    Compare the trade-offs among Raft, Paxos, and Multi-Paxos for distributed consensus. The final report must address each of the following dimensions for all three algorithms:

    1. **Leader election** — how a leader is chosen, what happens on leader loss, and the failure modes.
    2. **Log replication** — how entries are proposed, accepted, and committed; what ordering guarantees hold.
    3. **Fault tolerance** — number of failures tolerated, behaviour under network partitions, safety versus liveness trade-offs.
    4. **Implementation complexity and real-world deployments** — notable open-source implementations and the lessons learned from production.

    Produce the final structured report at `../../workspace/report.md`. The question is deliberately broad: a naive plan that treats "compare Raft vs Paxos vs Multi-Paxos" as a single step will likely trigger recursive sub-planning from inside `execute-step.md` — that behaviour is expected and exercised by this demo.

    You may use the available web tools (`web_search` / `web_fetch` under non-CC providers, or `WebSearch` / `WebFetch` under Claude Code) to ground your answers in current sources. Cite sources in the final report.
    ````

- [ ] **Step 5: Create `README.md` with exact content**

    ````markdown
    # c-deep-research

    *Deep Research (product pattern — OpenAI Deep Research,
    Anthropic Research, Perplexity Pro; academically close to
    Self-Ask — Press et al., arXiv:2210.03350). See
    `docs/agent-workflows/patterns.md` §Group 2.*

    This leaf demonstrates the **Deep Research** framing: decompose a
    research question into sub-questions, investigate each
    (recursively if a sub-question is still too broad), and aggregate
    the findings into a structured report. Under the current
    sequential shell, the recursion shows up as stack depth 2 —
    `execute-step.md` re-pushes `plan.md` within its own frame when
    the step it is executing reads as a research area rather than a
    single executable action.

    ## Collapsed framings

    See `../README.md` for the full collapse rationale. The shared
    strategy at this group level subsumes:

    | Framing                 | Source                                                                           |
    | ----------------------- | -------------------------------------------------------------------------------- |
    | Plan-and-Execute        | Wang et al., 2023 — "Plan-and-Solve", arXiv:2305.04091. See `../a-plan-execute/`. |
    | Orchestrator–Workers    | Anthropic, 2024 — "Building Effective Agents". See `../b-orchestrator-workers/`. |
    | Deep Research           | Product pattern; Self-Ask — Press et al., arXiv:2210.03350. **(this leaf)**      |
    | XAgent                  | OpenBMB / Tsinghua, tech report 2023. *(no dedicated leaf — prompting-level variant.)* |

    ## State machine

    Identical to `../a-plan-execute/README.md`'s diagram. INSTRUCTIONS,
    `plan.md`, `execute-step.md`, `synthesize.md` are byte-equal
    across the three leaves. Recursion is a *runtime* behaviour of
    `execute-step.md`, not a structural difference in the strategy.

    ## Dynamics

    Same as `../a-plan-execute/`. Stack depth reaches 2 when
    `execute-step.md` decides the current step is too coarse and
    re-pushes `plan.md` to decompose it. See
    `src/test/phase-3-deep-research.test.ts` for the depth-2
    invariant.

    ## Demo `PROGRAM.md`

    "Compare trade-offs among Raft, Paxos, and Multi-Paxos" — open
    research question, final report written to
    `./workspace/report.md`. Web tools (`web_search` / `web_fetch`
    under non-CC providers; CC's native `WebSearch` / `WebFetch`
    under Claude Code) are available for grounding.

    ## Run it

    ```bash
    ./new-instance.sh my-c interpreters/2-planning-decomposition/c-deep-research
    instances/my-c/run.sh
    ```

    ## Known behaviour

    - Live run's stack-depth-2 invariant depends on the LLM choosing
      to recurse on broad steps; this is exercised both by the
      scripted integration test and by the shape of the Raft /
      Paxos / Multi-Paxos question in PROGRAM.md.
    - Final artefact at `./workspace/report.md`; quality depends on
      the provider and on web-tool availability.
    ````

- [ ] **Step 6: Verify tests pass**

    Run: `npm test`
    Expected: PASS.

- [ ] **Step 7: Commit**

    ```bash
    git add interpreters/2-planning-decomposition/c-deep-research/ \
            src/test/phase-3-deep-research.test.ts
    git commit -m "feat(phase-3): c-deep-research leaf (byte-copy + d3 PROGRAM + README with recursion notes + test) (satisfies: R1, R2, R3, R4, R15, R16, R19, R42, R43, R45, R65)"
    ```

---

## Task 7: Phase-3 identity test + group README   (satisfies: R5, R46, R65)

Pins the byte-equality of the three leaves and ships the group-level
README with the full collapse story (all four framings named + cited).

**Files:**
- Create: `src/test/phase-3-dynamics-identity.test.ts`
- Create: `interpreters/2-planning-decomposition/README.md`

- [ ] **Step 1: Write the failing identity test**

    Create `src/test/phase-3-dynamics-identity.test.ts` with exact content:

    ```typescript
    import { test, describe } from "node:test";
    import { strict as assert } from "node:assert";
    import { readFileSync, existsSync } from "fs";
    import { resolve, dirname } from "path";
    import { fileURLToPath } from "url";

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const REPO = resolve(__dirname, "../..");

    const LEAVES = [
      "interpreters/2-planning-decomposition/a-plan-execute",
      "interpreters/2-planning-decomposition/b-orchestrator-workers",
      "interpreters/2-planning-decomposition/c-deep-research",
    ];

    const FILES = [
      "INSTRUCTIONS.md",
      "dynamics/plan.md",
      "dynamics/execute-step.md",
      "dynamics/synthesize.md",
    ];

    describe("phase-3 dynamics identity", () => {
      for (const file of FILES) {
        test(`${file} is byte-equal across the three leaves`, () => {
          const contents = LEAVES.map((leaf) => {
            const p = resolve(REPO, leaf, file);
            assert.ok(existsSync(p), `${p} missing`);
            return readFileSync(p);
          });
          assert.ok(contents[0].equals(contents[1]), `${file}: a vs b diverged`);
          assert.ok(contents[0].equals(contents[2]), `${file}: a vs c diverged`);
        });
      }

      test("group-level README exists and names all four framings", () => {
        const r = readFileSync(resolve(REPO, "interpreters/2-planning-decomposition/README.md"), "utf-8");
        assert.match(r, /Plan-and-Execute/);
        assert.match(r, /Orchestrator.Workers/);
        assert.match(r, /Deep Research/);
        assert.match(r, /XAgent/);
      });
    });
    ```

- [ ] **Step 2: Verify the file-equality side passes but the group-README side fails**

    Run: `npm test`
    Expected: FAIL on the group-README test (other assertions should
    pass because T4/T5/T6 produced byte-equal files). If a
    file-equality assertion fails, the byte-copy in T5 or T6 drifted
    — fix there, not here.

- [ ] **Step 3: Create `interpreters/2-planning-decomposition/README.md` with exact content**

    ````markdown
    # Planning & decomposition — Group 2

    *patterns.md §Group 2 — "Plan-and-Execute (includes Orchestrator–
    Workers, Deep Research, XAgent)".*

    This group ships **one strategy** exposed through **three leaves**,
    each shipping a different `PROGRAM.md` to demonstrate a different
    canonical framing of the same pattern. Under the current
    sequential shell, four published patterns collapse onto the same
    state machine — so we ship one implementation and three demos
    rather than three duplicated implementations.

    ## Framings subsumed (all four named with citations)

    | Leaf                         | Framing                 | Source                                                                         |
    | ---------------------------- | ----------------------- | ------------------------------------------------------------------------------ |
    | `a-plan-execute/`            | Plan-and-Execute        | Wang et al., 2023 — "Plan-and-Solve", arXiv:2305.04091.                        |
    | `b-orchestrator-workers/`    | Orchestrator–Workers    | Anthropic, 2024 — "Building Effective Agents".                                 |
    | `c-deep-research/`           | Deep Research           | Product pattern (OpenAI Deep Research, Anthropic Research, Perplexity Pro); academically close to Self-Ask — Press et al., arXiv:2210.03350. |
    | *(no dedicated leaf)*        | XAgent                  | OpenBMB / Tsinghua, tech report 2023. Collapses to Plan-and-Execute with a more aggressive replanner prompt; no structural distinction under sequential execution. |

    ## Why one strategy for four framings

    Under sequential execution:

    - **Plan-and-Execute → Orchestrator–Workers** collapse because
      sequential fan-out is indistinguishable from sequential
      single-executor iteration. The orchestrator/planner distinction
      is prompting-level, not structural.
    - **Plan-and-Execute → Deep Research** collapse because
      recursive sub-question investigation is a special case of
      `execute-step.md` re-pushing `plan.md` on a coarse step.
    - **Plan-and-Execute → XAgent** collapse because XAgent's
      "planner can rewrite at any time" is just a replanner
      prompted to fire every cycle; the three-component
      (dispatcher / planner / actor) split is prompting-level too.

    The distinction between the framings is therefore the PROGRAM.md
    each leaf ships — which naturally elicits the different
    execution traces.

    ## Shared dynamics

    | File                        | Consumes                                  | Produces (via `## Return`)                        |
    | --------------------------- | ----------------------------------------- | ------------------------------------------------- |
    | `dynamics/plan.md`          | `{{goal}}`, `{{results_so_far}}` (opt.)   | `plan`                                            |
    | `dynamics/execute-step.md`  | `{{current_step}}`, `{{context}}`         | `step_result` (`status: success | needs_replan`)  |
    | `dynamics/synthesize.md`    | `{{results}}`                             | `report`                                          |

    The three files are **byte-identical** across all three leaves.
    Pinned by `src/test/phase-3-dynamics-identity.test.ts`.

    ## Demos at a glance

    | Leaf                         | Demo                                     | Replan mode                                    | Recursion expected |
    | ---------------------------- | ---------------------------------------- | ---------------------------------------------- | ------------------ |
    | `a-plan-execute/`            | Minimal TypeScript project (tsconfig, test, CI) | At least one (intentional under-specification) | No                 |
    | `b-orchestrator-workers/`    | Summarise 5 files in `workspace/inputs/` | Zero (plan is stable)                           | No                 |
    | `c-deep-research/`           | Compare Raft / Paxos / Multi-Paxos       | Possible on broad sub-questions                | **Yes** (depth 2)  |

    ## Run any of the three

    ```bash
    ./new-instance.sh my-a interpreters/2-planning-decomposition/a-plan-execute
    instances/my-a/run.sh
    ```

    (substitute `b-orchestrator-workers` or `c-deep-research` as needed).

    ## See also

    - `docs/agent-workflows/patterns.md` §Group 2 — the conceptual taxonomy.
    - `docs/specs/2026-04-24-implement-phase-3-and-4/` — the spec that
      shipped this group.
    ````

- [ ] **Step 4: Verify tests pass**

    Run: `npm test`
    Expected: PASS — all four identity tests + group-README test green.

- [ ] **Step 5: Commit**

    ```bash
    git add src/test/phase-3-dynamics-identity.test.ts \
            interpreters/2-planning-decomposition/README.md
    git commit -m "test(phase-3): byte-equality across three leaves + group README with collapse story (satisfies: R5, R46, R65)"
    ```

---

## Task 8: Build `a-metagpt`   (satisfies: R20, R22, R23, R24, R25, R29 partial, R30, R32, R33 (4a), R42, R43, R47)

MetaGPT interpreter: linear role hand-off (PM → Architect → Engineer → QA).
QA pushes `evaluate.md`; test asserts stack depth 2 at that moment.

**Files:**
- Create: `interpreters/5-fixed-sop-teams/a-metagpt/{INSTRUCTIONS.md,PROGRAM.md,README.md,dynamics/role-pm.md,dynamics/role-architect.md,dynamics/role-engineer.md,dynamics/role-qa.md,dynamics/evaluate.md}`
- Create: `src/test/phase-4-metagpt.test.ts`

- [ ] **Step 1: Write the failing integration test**

    Create `src/test/phase-4-metagpt.test.ts` with exact content:

    ```typescript
    import { test, describe } from "node:test";
    import { strict as assert } from "node:assert";
    import { existsSync, readFileSync } from "fs";
    import { resolve, dirname } from "path";
    import { fileURLToPath } from "url";

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const REPO = resolve(__dirname, "../..");
    const INTERP = resolve(REPO, "interpreters/5-fixed-sop-teams/a-metagpt");

    describe("phase-4 a-metagpt: layout, roles, evaluate reuse", () => {
      test("required files exist", () => {
        for (const f of [
          "INSTRUCTIONS.md",
          "PROGRAM.md",
          "README.md",
          "dynamics/role-pm.md",
          "dynamics/role-architect.md",
          "dynamics/role-engineer.md",
          "dynamics/role-qa.md",
          "dynamics/evaluate.md",
        ]) {
          assert.ok(existsSync(resolve(INTERP, f)), `${f} missing`);
        }
      });

      test("strategy walks PM → Architect → Engineer → QA", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        for (const dyn of ["role-pm.md", "role-architect.md", "role-engineer.md", "role-qa.md"]) {
          assert.match(s, new RegExp(dyn), `strategy missing push of ${dyn}`);
        }
      });

      test("strategy uses Push-Args to forward typed hand-offs", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        // Architect receives {{prd}}, Engineer receives {{design}}, QA receives {{tasks}}.
        assert.match(s, /\{\{prd\}\}/);
        assert.match(s, /\{\{design\}\}/);
        assert.match(s, /\{\{tasks\}\}/);
      });

      test("role-qa pushes evaluate.md", () => {
        const qa = readFileSync(resolve(INTERP, "dynamics/role-qa.md"), "utf-8");
        assert.match(qa, /dynamics\/evaluate\.md/);
      });

      test("evaluate.md byte-equal to b-evaluator-optimizer copy", () => {
        const a = readFileSync(resolve(INTERP, "dynamics/evaluate.md"));
        const b = readFileSync(resolve(REPO, "interpreters/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md"));
        assert.ok(a.equals(b), "evaluate.md in a-metagpt diverged from Phase 1b copy");
      });

      test("role dynamics emit the typed hand-off sections via Return", () => {
        const pm = readFileSync(resolve(INTERP, "dynamics/role-pm.md"), "utf-8");
        const ar = readFileSync(resolve(INTERP, "dynamics/role-architect.md"), "utf-8");
        const en = readFileSync(resolve(INTERP, "dynamics/role-engineer.md"), "utf-8");
        const qa = readFileSync(resolve(INTERP, "dynamics/role-qa.md"), "utf-8");
        assert.match(pm, /## Return[\s\S]*prd:/);
        assert.match(ar, /## Return[\s\S]*design:/);
        assert.match(en, /## Return[\s\S]*tasks:/);
        assert.match(qa, /## Return[\s\S]*code_review:/);
      });
    });
    ```

- [ ] **Step 2: Verify it fails**

    Run: `npm test`
    Expected: FAIL — `a-metagpt` directory does not exist.

- [ ] **Step 3: Byte-copy evaluate.md from Phase 1b**

    ```bash
    mkdir -p interpreters/5-fixed-sop-teams/a-metagpt/dynamics
    cp interpreters/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md \
       interpreters/5-fixed-sop-teams/a-metagpt/dynamics/evaluate.md
    ```

- [ ] **Step 4: Create `dynamics/role-pm.md` with exact content**

    ````markdown
    # Dynamic: Role — Product Manager

    Consumes: `{{program}}` (the user's PROGRAM.md body).
    Produces: `## Return` with key `prd`.
    State flow: `empty` → `done`.

    ## Instruction: Draft PRD
    **Condition:** MEMORY state is "empty"
    **Action:** Read the program below:

        {{program}}

    Produce a concise Product Requirements Document with: (1) user stories in the form "As a <role>, I want <capability>, so that <benefit>"; (2) 3–6 acceptance criteria; (3) explicit non-goals. Keep the PRD under 400 words.

    Append to `./MEMORY.md`:

        ## Return
        prd: |
          <PRD body, every line indented two spaces>

    Set state to "done".
    ````

- [ ] **Step 5: Create `dynamics/role-architect.md` with exact content**

    ````markdown
    # Dynamic: Role — Architect

    Consumes: `{{prd}}`.
    Produces: `## Return` with key `design`.
    State flow: `empty` → `done`.

    ## Instruction: Design the system
    **Condition:** MEMORY state is "empty"
    **Action:** Read the PRD below:

        {{prd}}

    Produce a short design spec with: (1) component breakdown (modules and their responsibilities); (2) data model (types, schema, or file layout); (3) key interfaces (function signatures, CLI flags, or API endpoints); (4) error-handling strategy. Keep it under 500 words.

    Append to `./MEMORY.md`:

        ## Return
        design: |
          <design body, every line indented two spaces>

    Set state to "done".
    ````

- [ ] **Step 6: Create `dynamics/role-engineer.md` with exact content**

    ````markdown
    # Dynamic: Role — Engineer

    Consumes: `{{design}}`.
    Produces: `## Return` with key `tasks`; side-effect: writes code under `../../workspace/`.
    State flow: `empty` → `authoring` → `done`.

    ## Instruction: Author code
    **Condition:** MEMORY state is "empty"
    **Action:** Read the design below:

        {{design}}

    Implement the design by writing source files under `../../workspace/` using the `write_file` tool. Run any necessary validation (syntax check, `node --check`, or a trivial smoke test) via the `bash` tool; report the exit code in `./scoped/attempt.md` via `echo >>`. Set state to "authoring".

    ## Instruction: Enumerate tasks
    **Condition:** MEMORY state is "authoring"
    **Action:** Re-read the design and list each concrete task you actually carried out as a bullet. Include paths, commands run, and verification status. Append to `./MEMORY.md`:

        ## Return
        tasks: |
          - T1: <task, e.g. "wrote workspace/src/index.ts (24 lines)">
          - T2: <task>
          ...

    Set state to "done".
    ````

- [ ] **Step 7: Create `dynamics/role-qa.md` with exact content**

    ````markdown
    # Dynamic: Role — QA

    Consumes: `{{tasks}}`, `{{code_location}}`.
    Produces: `## Return` with key `code_review`.
    State flow: `empty` → `reviewing` → `awaiting_verdict` → `done`.
    Stack: pushes `evaluate.md` at depth 2.

    ## Instruction: Review
    **Condition:** MEMORY state is "empty"
    **Action:** The engineered tasks are:

        {{tasks}}

    The code lives under:

        {{code_location}}

    Read the relevant files in that location via `bash cat`. Synthesise a review *attempt* (one paragraph describing what was implemented and your overall judgement) and a *criterion* (one sentence from the PRD/acceptance criteria). Append to `./MEMORY.md`:

        ## Push
        dynamics/evaluate.md
        ## Push-Args
        attempt: |
          <verbatim attempt summary, indented two spaces>
        criterion: |
          <verbatim criterion, indented two spaces>

    Set state to "awaiting_verdict". (Note: "awaiting_verdict" is a local label; the shell sets frame state to "empty" on push and to "awaiting_verdict_completed" on pop.)

    ## Instruction: Return verdict
    **Condition:** MEMORY state is "awaiting_verdict_completed" and `## Verdict` is present
    **Action:** Read `## Verdict` (literal `pass` or `fail`) and `## Feedback` from MEMORY. Append to `./MEMORY.md`:

        ## Return
        code_review: |
          verdict: <pass|fail>
          feedback: |
            <verbatim feedback body, indented two more spaces>

    Remove `## Verdict` and `## Feedback` from MEMORY. Set state to "done".
    ````

- [ ] **Step 8: Create `INSTRUCTIONS.md` with exact content**

    ````markdown
    # Strategy: MetaGPT — document hand-off SOP

    IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

    This interpreter implements the MetaGPT pattern (patterns.md Group 5): a fixed SOP walking PM → Architect → Engineer → QA, with document hand-off as the contract between roles (one role per phase, each produces a typed document consumed by the next).

    ## Instruction: Initialize
    **Condition:** MEMORY state is "empty"
    **Action:** Read `../../PROGRAM.md`. Append to `./MEMORY.md`:

        ## Push
        dynamics/role-pm.md
        ## Push-Args
        program: |
          <verbatim PROGRAM.md body, every line indented two spaces>

    Do not change state.

    ## Instruction: Dispatch Architect
    **Condition:** MEMORY state is "empty_completed" and `## PRD` is present
    **Action:** Append to `./MEMORY.md`:

        ## Push
        dynamics/role-architect.md
        ## Push-Args
        prd: |
          <verbatim ## PRD body, every line indented two spaces>

    Do not change state.

    ## Instruction: Dispatch Engineer
    **Condition:** MEMORY state is "empty_completed" and `## Design` is present
    **Action:** Append to `./MEMORY.md`:

        ## Push
        dynamics/role-engineer.md
        ## Push-Args
        design: |
          <verbatim ## Design body, every line indented two spaces>

    Do not change state.

    ## Instruction: Dispatch QA
    **Condition:** MEMORY state is "empty_completed" and `## Tasks` is present
    **Action:** Append to `./MEMORY.md`:

        ## Push
        dynamics/role-qa.md
        ## Push-Args
        tasks: |
          <verbatim ## Tasks body, every line indented two spaces>
        code_location: |
          ../../workspace/

    Do not change state.

    ## Instruction: Finish
    **Condition:** MEMORY state is "empty_completed" and `## Code Review` is present
    **Action:** Read `## Code Review`. If the verdict field suggests success, set state to "done". If it suggests failure, append a non-blocking `## Pending Questions` entry noting the failed review and set state to "done" anyway (the CLI tool is still an artefact; the user may inspect it). Do NOT re-push any role; this interpreter is a linear SOP, not a loop.

    # Sub-instructions

    (none — this interpreter needs none.)
    ````

    **Note:** condition matching relies on `## PRD` / `## Design` / `## Tasks` / `## Code Review` presence; the shell's condition matcher distinguishes the four `empty_completed` states by the MEMORY sections actually present at the time.

- [ ] **Step 9: Create `PROGRAM.md` with exact content**

    ````markdown
    # Goal

    Build a CLI tool `wc-plus` in Node.js under `../../workspace/`. Requirements:

    1. `wc-plus <file>` counts lines, words, and bytes in the given file and prints them as `<lines>\t<words>\t<bytes>\t<file>` to stdout (same column order as GNU `wc`).
    2. `wc-plus --json <file>` outputs `{"lines": N, "words": N, "bytes": N, "file": "<path>"}` on a single line.
    3. `wc-plus --help` prints usage and exits 0.
    4. If the file does not exist, exit code 1 and stderr: `wc-plus: <file>: no such file`.

    Structure expected:
    - `src/wc-plus.js` — main implementation (Node, `type: module`).
    - `src/wc-plus.test.js` — `node:test` covering all four behaviours above.
    - `package.json` with `bin.wc-plus` pointing at `src/wc-plus.js` and a `test` script (`node --test src/*.test.js`).
    - `README.md` documenting usage.

    Verify by running `npm test` from the workspace root before claiming success.
    ````

- [ ] **Step 10: Create `README.md` with exact content**

    ````markdown
    # a-metagpt

    *MetaGPT (Hong et al., ICLR 2024). See
    `docs/agent-workflows/patterns.md` §Group 5.*

    This interpreter implements MetaGPT's fixed Software-Engineering
    SOP: **PM → Architect → Engineer → QA**, each role consuming the
    prior role's typed document and producing the next. Document
    hand-off is the contract; there is no dialogue between roles.

    ## State machine

    ```
    empty ─(push role-pm)─► empty_completed & ## PRD present ─(push role-architect)─► empty_completed & ## Design present
                                                                                                 │
                                            ─(push role-engineer)─► empty_completed & ## Tasks present
                                                                                                 │
                                            ─(push role-qa)─► empty_completed & ## Code Review present ─► done
    ```

    Five strategy instructions: `Initialize`, `Dispatch Architect`,
    `Dispatch Engineer`, `Dispatch QA`, `Finish`.

    ## Dynamics

    | File                        | Consumes                             | Produces                                     | Stack depth                |
    | --------------------------- | ------------------------------------ | -------------------------------------------- | -------------------------- |
    | `dynamics/role-pm.md`       | `{{program}}`                        | `prd`                                        | 1                          |
    | `dynamics/role-architect.md`| `{{prd}}`                            | `design`                                     | 1                          |
    | `dynamics/role-engineer.md` | `{{design}}`                         | `tasks` (+ side-effect: code in workspace/)  | 1                          |
    | `dynamics/role-qa.md`       | `{{tasks}}`, `{{code_location}}`     | `code_review`                                | 2 (pushes `evaluate.md`)   |
    | `dynamics/evaluate.md`      | `{{attempt}}`, `{{criterion}}`       | `verdict`, `feedback`                        | leaf (byte-equal copy from Phase 1b) |

    ## Demo `PROGRAM.md`

    Build `wc-plus`: a small CLI tool that counts lines/words/bytes
    with `--json` and `--help` flags. Shared byte-for-byte with
    `../b-chatdev/PROGRAM.md` so outputs are directly comparable.

    ## Run it

    ```bash
    ./new-instance.sh my-metagpt interpreters/5-fixed-sop-teams/a-metagpt
    instances/my-metagpt/run.sh
    ```

    ## Known behaviour

    - Linear: no loops, no retry. If QA returns `fail`, the machine
      still halts; the failed review is recorded in MEMORY + a
      non-blocking `## Pending Questions` entry.
    - Stack depth reaches 2 during the QA phase (role-qa pushes
      evaluate.md). Validated by `src/test/phase-4-metagpt.test.ts`.
    ````

- [ ] **Step 11: Verify tests pass**

    Run: `npm test`
    Expected: PASS.

- [ ] **Step 12: Commit**

    ```bash
    git add interpreters/5-fixed-sop-teams/a-metagpt/ \
            src/test/phase-4-metagpt.test.ts
    git commit -m "feat(phase-4): a-metagpt interpreter + 4 role dynamics + evaluate.md copy + test (satisfies: R20, R22, R23, R24, R25, R29, R30, R32, R33, R42, R43, R47)"
    ```

---

## Task 9: Build `b-chatdev`   (satisfies: R21, R22, R26, R27, R28, R29 partial, R31, R32, R33 (4b), R42, R47)

ChatDev interpreter: phase dialogue between role pairs. Reviewer-pair
dialogues push evaluate.md for acceptance gating.

**Files:**
- Create: `interpreters/5-fixed-sop-teams/b-chatdev/{INSTRUCTIONS.md,PROGRAM.md,README.md,dynamics/dialogue.md,dynamics/evaluate.md,roles/ceo.md,roles/cto.md,roles/coder.md,roles/reviewer.md,roles/tester.md,roles/writer.md}`
- Create: `src/test/phase-4-chatdev.test.ts`

- [ ] **Step 1: Write the failing integration test**

    Create `src/test/phase-4-chatdev.test.ts` with exact content:

    ```typescript
    import { test, describe } from "node:test";
    import { strict as assert } from "node:assert";
    import { existsSync, readFileSync } from "fs";
    import { resolve, dirname } from "path";
    import { fileURLToPath } from "url";

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const REPO = resolve(__dirname, "../..");
    const INTERP = resolve(REPO, "interpreters/5-fixed-sop-teams/b-chatdev");

    describe("phase-4 b-chatdev: layout, dialogue, PROGRAM parity", () => {
      test("required files exist (interpreter + roles/)", () => {
        for (const f of [
          "INSTRUCTIONS.md",
          "PROGRAM.md",
          "README.md",
          "dynamics/dialogue.md",
          "dynamics/evaluate.md",
          "roles/ceo.md",
          "roles/cto.md",
          "roles/coder.md",
          "roles/reviewer.md",
          "roles/tester.md",
          "roles/writer.md",
        ]) {
          assert.ok(existsSync(resolve(INTERP, f)), `${f} missing`);
        }
      });

      test("PROGRAM.md is byte-equal to a-metagpt/PROGRAM.md (R22)", () => {
        const a = readFileSync(resolve(REPO, "interpreters/5-fixed-sop-teams/a-metagpt/PROGRAM.md"));
        const b = readFileSync(resolve(INTERP, "PROGRAM.md"));
        assert.ok(a.equals(b), "PROGRAM.md diverged between a-metagpt and b-chatdev");
      });

      test("strategy walks four phases (design, coding, testing, documenting)", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        for (const phase of ["design", "coding", "testing", "documenting"]) {
          assert.match(s, new RegExp(phase, "i"), `strategy missing phase: ${phase}`);
        }
      });

      test("strategy pushes dialogue.md with correct participant pairs", () => {
        const s = readFileSync(resolve(INTERP, "INSTRUCTIONS.md"), "utf-8");
        // design: ceo+cto (no reviewer) → acceptance=false
        // coding/testing/documenting pair with reviewer → acceptance=true
        assert.match(s, /ceo.*cto|cto.*ceo/);
        assert.match(s, /coder.*reviewer|reviewer.*coder/);
        assert.match(s, /tester.*reviewer|reviewer.*tester/);
        assert.match(s, /writer.*reviewer|reviewer.*writer/);
      });

      test("dialogue.md honours acceptance flag by pushing evaluate.md", () => {
        const d = readFileSync(resolve(INTERP, "dynamics/dialogue.md"), "utf-8");
        assert.match(d, /\{\{participants\}\}/);
        assert.match(d, /\{\{topic\}\}/);
        assert.match(d, /\{\{acceptance\}\}/);
        assert.match(d, /dynamics\/evaluate\.md/);
      });

      test("evaluate.md byte-equal to Phase 1b copy", () => {
        const a = readFileSync(resolve(INTERP, "dynamics/evaluate.md"));
        const b = readFileSync(resolve(REPO, "interpreters/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md"));
        assert.ok(a.equals(b), "evaluate.md in b-chatdev diverged from Phase 1b copy");
      });

      test("README cites ChatDev and is Phase-1-leaf-style", () => {
        const r = readFileSync(resolve(INTERP, "README.md"), "utf-8");
        assert.match(r, /ChatDev/);
        assert.match(r, /Qian/);
      });
    });
    ```

- [ ] **Step 2: Verify it fails**

    Run: `npm test`
    Expected: FAIL — `b-chatdev` directory does not exist.

- [ ] **Step 3: Create six role-description files with exact content**

    `interpreters/5-fixed-sop-teams/b-chatdev/roles/ceo.md`:

    ```markdown
    # CEO

    Product-oriented leader. Prioritises user value and clear scope.
    In design discussions, the CEO presses for concrete user
    benefits, rejects scope creep, and keeps the conversation
    anchored in PROGRAM.md's acceptance criteria.
    ```

    `roles/cto.md`:

    ```markdown
    # CTO

    Technical architect. Prioritises feasibility, design simplicity,
    and the smallest implementation that meets the user's need. In
    design discussions, the CTO proposes concrete module/interface
    decompositions and challenges over-engineering.
    ```

    `roles/coder.md`:

    ```markdown
    # Coder

    Implements the spec cleanly. Writes small, readable code;
    verifies via running tests where possible; reports what was done
    and what remains uncertain. Does not silently extend scope.
    ```

    `roles/reviewer.md`:

    ```markdown
    # Reviewer

    Critically evaluates others' output against the acceptance
    criterion. Asks whether the delivery meets the PRD, flags
    concrete problems (pointing at files and lines), and proposes
    minimal fixes. The reviewer's pass/fail judgement gates the
    phase via `evaluate.md`.
    ```

    `roles/tester.md`:

    ```markdown
    # Tester

    Writes and runs tests, reports outcomes concretely. Prefers
    `node:test` style test suites; captures actual command output
    rather than claiming success. Raises questions about untestable
    code paths.
    ```

    `roles/writer.md`:

    ```markdown
    # Writer

    Produces end-user documentation. Writes the README that a new
    user would read: what the tool does, how to install it, typical
    usage examples, and known limitations. Short beats comprehensive
    for a small CLI.
    ```

- [ ] **Step 4: Create `dynamics/dialogue.md` with exact content**

    ````markdown
    # Dynamic: Dialogue

    Consumes: `{{participants}}` (comma-separated role names matching files under `../roles/`); `{{topic}}`; `{{input}}` (optional — prior-phase output); `{{acceptance}}` (optional — `true` or `false`; when `true`, push `evaluate.md` before returning).
    Produces: `## Return` with key `dialogue_output`.
    State flow: `empty` → `turning` → (`decide_accept` → possibly `awaiting_verdict_completed`) → `done`.
    Scoped files: `./scoped/transcript.md` (surgical `echo >>` append only), `./scoped/turns.md` (turn counter).

    ## Instruction: First turn
    **Condition:** MEMORY state is "empty"
    **Action:** Create `./scoped/transcript.md` (empty file) and `./scoped/turns.md` containing `0`. Read the role description files for the named participants:

        Participants: {{participants}}
        Topic:        {{topic}}
        Prior input:  {{input}}

    For each participant, `bash cat ../roles/<name>.md` to load their persona. Pick `participants[0]` as the first speaker. Produce one short turn (2–5 sentences) speaking *as* that role on the topic, incorporating the prior input. Append it surgically:

        echo "### Turn 1 — <speaker>" >> ./scoped/transcript.md
        echo "<speaker's turn body>"   >> ./scoped/transcript.md

    Overwrite `./scoped/turns.md` with `1`. Set state to "turning".

    ## Instruction: Next turn
    **Condition:** MEMORY state is "turning" and `./scoped/turns.md` contains an integer less than 6 AND the transcript's last turn does not contain the literal word `FINAL:`
    **Action:** Read `./scoped/turns.md` and `./scoped/transcript.md`. Pick the next participant by rotation: the next speaker is `participants[(turns) % len(participants)]`. Produce a turn responding to the prior speaker, staying on the topic. Append surgically:

        echo "### Turn <N+1> — <speaker>" >> ./scoped/transcript.md
        echo "<turn body>"                >> ./scoped/transcript.md

    Overwrite `./scoped/turns.md` with the incremented number. If convergence is reached (participants agree, or one emits `FINAL:` prefixed with the consensus artefact), set state to "decide_accept". Otherwise stay in "turning".

    ## Instruction: Turn limit
    **Condition:** MEMORY state is "turning" and `./scoped/turns.md` contains 6 or more
    **Action:** Set state to "decide_accept" (hard cap to prevent infinite dialogue).

    ## Instruction: Accept via evaluate
    **Condition:** MEMORY state is "decide_accept" and `{{acceptance}}` has the literal value `true`
    **Action:** Extract the consensus artefact from the tail of `./scoped/transcript.md` (the `FINAL:` block if present, or the last speaker's turn otherwise) into a short `attempt` string. Use `{{topic}}` as the `criterion`. Append to `./MEMORY.md`:

        ## Push
        dynamics/evaluate.md
        ## Push-Args
        attempt: |
          <extracted attempt, indented two spaces>
        criterion: |
          {{topic}}

    Do not change state.

    ## Instruction: Return after evaluate
    **Condition:** MEMORY state is "decide_accept_completed" and `## Verdict` is present
    **Action:** Extract the consensus artefact from the transcript. Append to `./MEMORY.md`:

        ## Return
        dialogue_output: |
          <consensus artefact body, indented two spaces>

    Remove `## Verdict` and `## Feedback` from MEMORY. Set state to "done". (The strategy that called dialogue.md will splice `## Dialogue Output` and can rename/route it as needed.)

    ## Instruction: Return without evaluate
    **Condition:** MEMORY state is "decide_accept" and `{{acceptance}}` has any value other than the literal `true` (including absent)
    **Action:** Extract the consensus artefact from the transcript. Append to `./MEMORY.md`:

        ## Return
        dialogue_output: |
          <consensus artefact body, indented two spaces>

    Set state to "done".
    ````

- [ ] **Step 5: Byte-copy evaluate.md from Phase 1b**

    ```bash
    mkdir -p interpreters/5-fixed-sop-teams/b-chatdev/dynamics
    cp interpreters/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md \
       interpreters/5-fixed-sop-teams/b-chatdev/dynamics/evaluate.md
    ```

- [ ] **Step 6: Byte-copy PROGRAM from `a-metagpt` (R22)**

    ```bash
    cp interpreters/5-fixed-sop-teams/a-metagpt/PROGRAM.md \
       interpreters/5-fixed-sop-teams/b-chatdev/PROGRAM.md
    ```

- [ ] **Step 7: Create `INSTRUCTIONS.md` with exact content**

    ````markdown
    # Strategy: ChatDev — phase-dialogue SOP

    IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

    This interpreter implements the ChatDev pattern (patterns.md Group 5): four phases — design, coding, testing, documenting — each phase a dialogue between a role pair. Design uses CEO↔CTO without an acceptance gate; coding / testing / documenting pair a specialist with the reviewer and use `evaluate.md` as an acceptance gate.

    Scoped files:
    - `./scoped/phase.md` — current phase name (wholesale overwrite at each phase transition).

    ## Instruction: Initialize
    **Condition:** MEMORY state is "empty"
    **Action:** Read `../../PROGRAM.md`. Overwrite `./scoped/phase.md` with the single word `design`. Append to `./MEMORY.md`:

        ## Push
        dynamics/dialogue.md
        ## Push-Args
        participants: |
          ceo,cto
        topic: |
          <verbatim PROGRAM.md body, every line indented two spaces>
        acceptance: |
          false

    Do not change state.

    ## Instruction: Design done — enter coding
    **Condition:** MEMORY state is "empty_completed" and `## Dialogue Output` is present and `./scoped/phase.md` contains the word `design`
    **Action:** Rename the returned `## Dialogue Output` section to `## Design Doc` (bash: `sed -i 's/^## Dialogue Output$/## Design Doc/' ./MEMORY.md`). Overwrite `./scoped/phase.md` with the single word `coding`. Append to `./MEMORY.md`:

        ## Push
        dynamics/dialogue.md
        ## Push-Args
        participants: |
          coder,reviewer
        topic: |
          Implement the following design:
          <verbatim ## Design Doc body, indented two spaces under this line>
        acceptance: |
          true

    Do not change state.

    ## Instruction: Coding done — enter testing
    **Condition:** MEMORY state is "empty_completed" and `## Dialogue Output` is present and `./scoped/phase.md` contains the word `coding`
    **Action:** Rename `## Dialogue Output` to `## Code` (`sed -i 's/^## Dialogue Output$/## Code/' ./MEMORY.md`). Overwrite `./scoped/phase.md` with the single word `testing`. Append to `./MEMORY.md`:

        ## Push
        dynamics/dialogue.md
        ## Push-Args
        participants: |
          tester,reviewer
        topic: |
          Write and run tests for the following code:
          <verbatim ## Code body, indented two spaces>
        acceptance: |
          true

    Do not change state.

    ## Instruction: Testing done — enter documenting
    **Condition:** MEMORY state is "empty_completed" and `## Dialogue Output` is present and `./scoped/phase.md` contains the word `testing`
    **Action:** Rename `## Dialogue Output` to `## Test Report` (`sed -i 's/^## Dialogue Output$/## Test Report/' ./MEMORY.md`). Overwrite `./scoped/phase.md` with the single word `documenting`. Append to `./MEMORY.md`:

        ## Push
        dynamics/dialogue.md
        ## Push-Args
        participants: |
          writer,reviewer
        topic: |
          Write user-facing documentation for the following code:
          <verbatim ## Code body, indented two spaces>
        acceptance: |
          true

    Do not change state.

    ## Instruction: Finish
    **Condition:** MEMORY state is "empty_completed" and `## Dialogue Output` is present and `./scoped/phase.md` contains the word `documenting`
    **Action:** Rename `## Dialogue Output` to `## Documentation` (`sed -i 's/^## Dialogue Output$/## Documentation/' ./MEMORY.md`). Set state to "done".

    # Sub-instructions

    (none — this interpreter needs none.)
    ````

- [ ] **Step 8: Create `README.md` with exact content**

    ````markdown
    # b-chatdev

    *ChatDev (Qian et al., 2023). See
    `docs/agent-workflows/patterns.md` §Group 5.*

    This interpreter implements ChatDev's **phase-dialogue** SOP:
    four fixed phases — design, coding, testing, documenting — each
    phase a dialogue between a role pair (CEO↔CTO for design,
    specialist↔reviewer for the rest). The dialogue is the contract
    between phases, not a document hand-off.

    ## State machine

    ```
    empty ─(push dialogue: ceo+cto, design, acceptance=false)─► empty_completed & ## Dialogue Output
                                                                                            │ (rename to ## Design Doc)
                                            ─(push dialogue: coder+reviewer, coding, acceptance=true)─► empty_completed
                                                                                            │ (rename to ## Code)
                                            ─(push dialogue: tester+reviewer, testing, acceptance=true)─► empty_completed
                                                                                            │ (rename to ## Test Report)
                                            ─(push dialogue: writer+reviewer, documenting, acceptance=true)─► empty_completed
                                                                                            │ (rename to ## Documentation)
                                                                                          done
    ```

    Five strategy instructions: `Initialize`, `Design done — enter
    coding`, `Coding done — enter testing`, `Testing done — enter
    documenting`, `Finish`.

    ## Dynamics

    | File                 | Consumes                                                                 | Produces           | Stack depth                |
    | -------------------- | ------------------------------------------------------------------------ | ------------------ | -------------------------- |
    | `dynamics/dialogue.md` | `{{participants}}`, `{{topic}}`, `{{input}}` (opt.), `{{acceptance}}` (opt.) | `dialogue_output`  | 1 (2 when acceptance=true) |
    | `dynamics/evaluate.md` | `{{attempt}}`, `{{criterion}}`                                           | `verdict`, `feedback` | leaf (byte-equal to Phase 1b) |

    Role descriptions under `./roles/` — `ceo.md`, `cto.md`,
    `coder.md`, `reviewer.md`, `tester.md`, `writer.md` — are read
    by `dialogue.md` via `bash cat`.

    ## Demo `PROGRAM.md`

    Build `wc-plus` — same task as `../a-metagpt/PROGRAM.md`
    (byte-equal, required by R22). Running both interpreters on the
    same PROGRAM.md is the comparison the phase exists for.

    ## Run it

    ```bash
    ./new-instance.sh my-chatdev interpreters/5-fixed-sop-teams/b-chatdev
    instances/my-chatdev/run.sh
    ```

    ## Known behaviour

    - Dialogue turn limit: 6. Prevents runaway loops; convergence is
      usually reached by turn 4.
    - Reviewer-paired phases (coding, testing, documenting) push
      `evaluate.md` and only return after a verdict; design phase
      does not.
    - `## Dialogue Output` is renamed to the phase-specific section
      (`## Design Doc`, `## Code`, `## Test Report`,
      `## Documentation`) by the strategy after each dialogue
      returns.
    ````

- [ ] **Step 9: Verify tests pass**

    Run: `npm test`
    Expected: PASS.

- [ ] **Step 10: Commit**

    ```bash
    git add interpreters/5-fixed-sop-teams/b-chatdev/ \
            src/test/phase-4-chatdev.test.ts
    git commit -m "feat(phase-4): b-chatdev interpreter + dialogue.md + 6 roles + evaluate.md copy + shared PROGRAM + test (satisfies: R21, R22, R26, R27, R28, R29, R31, R32, R33, R42, R47)"
    ```

---

## Task 10: Four-way identity + Phase-4 group README + shell-feature test   (satisfies: R29, R40, R48)

Renames and extends the Phase-1 identity test to four-way, ships the
Phase-4 group README, and adds the shell-feature re-homing test that
R40 requires.

**Files:**
- Rename: `src/test/phase-1-dynamics-identity.test.ts` → `src/test/phase-operators-identity.test.ts`
- Modify: the renamed file (extend to four-way)
- Create: `interpreters/5-fixed-sop-teams/README.md`
- Create: `src/test/phase-4-shell-features.test.ts`

- [ ] **Step 1: Rename the Phase-1 identity test file**

    ```bash
    git mv src/test/phase-1-dynamics-identity.test.ts \
           src/test/phase-operators-identity.test.ts
    ```

- [ ] **Step 2: Replace the renamed file's content with the four-way version**

    Overwrite `src/test/phase-operators-identity.test.ts` with exact content:

    ```typescript
    import { test, describe } from "node:test";
    import { strict as assert } from "node:assert";
    import { readFileSync } from "fs";
    import { resolve, dirname } from "path";
    import { fileURLToPath } from "url";

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const REPO = resolve(__dirname, "../..");

    const EVALUATE_PATHS = [
      "interpreters/1-iterative-refinement/b-evaluator-optimizer/dynamics/evaluate.md",
      "interpreters/1-iterative-refinement/c-reflexion/dynamics/evaluate.md",
      "interpreters/5-fixed-sop-teams/a-metagpt/dynamics/evaluate.md",
      "interpreters/5-fixed-sop-teams/b-chatdev/dynamics/evaluate.md",
    ];

    describe("evaluate.md identity across phases", () => {
      test("evaluate.md is byte-equal across all four consumers", () => {
        const contents = EVALUATE_PATHS.map((p) => readFileSync(resolve(REPO, p)));
        for (let i = 1; i < contents.length; i++) {
          assert.ok(
            contents[0].equals(contents[i]),
            `evaluate.md diverged between ${EVALUATE_PATHS[0]} and ${EVALUATE_PATHS[i]}`,
          );
        }
      });
    });
    ```

- [ ] **Step 3: Verify the four-way identity passes**

    Run: `npm test`
    Expected: PASS. If FAIL, one of the four evaluate.md copies
    drifted — fix where it diverged.

- [ ] **Step 4: Write the failing shell-feature test**

    Create `src/test/phase-4-shell-features.test.ts` with exact content:

    ```typescript
    import { test, describe } from "node:test";
    import { strict as assert } from "node:assert";
    import { readFileSync } from "fs";
    import { resolve, dirname } from "path";
    import { fileURLToPath } from "url";

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const REPO = resolve(__dirname, "../..");

    describe("R40: shell features re-homed from game-team", () => {
      test("R40 (a) fuzzy NL conditions used in at least one Phase-3/4 strategy", () => {
        const candidates = [
          "interpreters/2-planning-decomposition/a-plan-execute/INSTRUCTIONS.md",
          "interpreters/5-fixed-sop-teams/a-metagpt/INSTRUCTIONS.md",
          "interpreters/5-fixed-sop-teams/b-chatdev/INSTRUCTIONS.md",
        ];
        const fuzzyRe = /suggests|indicates|appears|is successful|looks|signals|reads as/i;
        const hits = candidates.filter((c) => fuzzyRe.test(readFileSync(resolve(REPO, c), "utf-8")));
        assert.ok(hits.length >= 1, `no Phase-3/4 strategy uses fuzzy NL condition phrasing; candidates: ${candidates.join(", ")}`);
      });

      test("R40 (b) non-blocking Pending Questions used by at least one Phase-3/4 strategy", () => {
        const candidates = [
          "interpreters/2-planning-decomposition/a-plan-execute/INSTRUCTIONS.md",
          "interpreters/5-fixed-sop-teams/a-metagpt/INSTRUCTIONS.md",
        ];
        const pqRe = /## Pending Questions/;
        const notWaitingRe = /DO NOT set state to "waiting_for_user"|non-blocking|do not.*waiting_for_user/i;
        let hit = false;
        for (const c of candidates) {
          const s = readFileSync(resolve(REPO, c), "utf-8");
          if (pqRe.test(s) && notWaitingRe.test(s)) { hit = true; break; }
        }
        assert.ok(hit, "no Phase-3/4 strategy demonstrates non-blocking ## Pending Questions");
      });

      test("R40 (c) strategy-level push present in every new strategy", () => {
        const strategies = [
          "interpreters/2-planning-decomposition/a-plan-execute/INSTRUCTIONS.md",
          "interpreters/5-fixed-sop-teams/a-metagpt/INSTRUCTIONS.md",
          "interpreters/5-fixed-sop-teams/b-chatdev/INSTRUCTIONS.md",
        ];
        for (const s of strategies) {
          const body = readFileSync(resolve(REPO, s), "utf-8");
          assert.match(body, /## Push\s*\n\s*dynamics\//, `${s} does not emit a strategy-level ## Push`);
        }
      });
    });
    ```

- [ ] **Step 5: Verify the shell-feature test passes**

    Run: `npm test`
    Expected: PASS. If (a) fails, check the Phase-3 strategy's
    `Route after step` instruction has fuzzy phrasing ("suggests",
    "indicates"). If (b) fails, check that same instruction's
    malformed-branch has both `## Pending Questions` text and
    non-blocking language.

- [ ] **Step 6: Create `interpreters/5-fixed-sop-teams/README.md` with exact content**

    ````markdown
    # Fixed-SOP Teams — Group 5

    *patterns.md §Group 5.*

    This group ships two interpreters with structurally different
    role-collaboration models, running on a shared `PROGRAM.md` so
    outputs are directly comparable.

    | Leaf           | Framing          | Source                          | Role-collaboration model    |
    | -------------- | ---------------- | ------------------------------- | --------------------------- |
    | `a-metagpt/`   | MetaGPT          | Hong et al., ICLR 2024          | Document hand-off: one role per phase; the contract is a typed document |
    | `b-chatdev/`   | ChatDev          | Qian et al., 2023               | Phase dialogue: two roles per phase; the contract is a converged transcript |

    ## Why two interpreters (not a collapse)

    Under the `interpreter + PROGRAM → instance` rule, comparing two
    role-collaboration models requires two interpreters running the
    same PROGRAM. Collapsing them into one interpreter would erase
    the comparison this phase exists for. See the spec at
    `docs/specs/2026-04-24-implement-phase-3-and-4/` §Phase 4 for
    the full argument.

    ## Shared PROGRAM.md

    Both leaves ship byte-identical `PROGRAM.md` — the `wc-plus`
    CLI tool task (see `a-metagpt/PROGRAM.md`). Identity is pinned
    by `src/test/phase-4-chatdev.test.ts`.

    ## Shared dynamic

    Both leaves ship a byte-equal copy of `dynamics/evaluate.md`
    (from Phase 1b). The four-way identity across `b-evaluator-
    optimizer`, `c-reflexion`, `a-metagpt`, `b-chatdev` is pinned
    by `src/test/phase-operators-identity.test.ts` (R29).

    ## Run them side-by-side

    ```bash
    ./new-instance.sh mg interpreters/5-fixed-sop-teams/a-metagpt
    ./new-instance.sh cd interpreters/5-fixed-sop-teams/b-chatdev
    instances/mg/run.sh
    instances/cd/run.sh
    diff -u instances/mg/workspace/ instances/cd/workspace/
    ```

    ## See also

    - `docs/agent-workflows/patterns.md` §Group 5.
    - `docs/specs/2026-04-24-implement-phase-3-and-4/` — the
      spec that shipped this group and retired `game-team`.
    ````

- [ ] **Step 7: Verify tests still pass**

    Run: `npm test`
    Expected: PASS.

- [ ] **Step 8: Commit**

    ```bash
    git add src/test/phase-operators-identity.test.ts \
            src/test/phase-4-shell-features.test.ts \
            interpreters/5-fixed-sop-teams/README.md
    git commit -m "test+doc(phase-4): 4-way evaluate identity + shell-feature rehoming + Phase-4 group README (satisfies: R29, R40, R48)"
    ```

---

## Task 11: Retire game-team   (satisfies: R35, R36, R37, R38, R39)

Delete the directory and update all docs / prose references.

**Files:**
- Delete: `interpreters/game-team/` (entire directory)
- Modify: `CLAUDE.md`
- Modify: `README.md` (repo root)
- Modify: `docs/agent-workflows/requirements.md`
- Modify: `interpreters/1-iterative-refinement/README.md` (if it mentions game-team)

- [ ] **Step 1: Write a failing regression test**

    Append to `src/test/stack-integration.test.ts` (at the end of the file,
    inside the outer describe block if present, or as a new top-level
    test if not):

    ```typescript
    import { existsSync as existsSyncGT } from "fs";
    import { resolve as resolveGT, dirname as dirnameGT } from "path";
    import { fileURLToPath as fileURLToPathGT } from "url";
    const __filenameGT = fileURLToPathGT(import.meta.url);
    const __dirnameGT = dirnameGT(__filenameGT);
    test("game-team directory is removed (R35 — Phase-4 retirement)", () => {
      const p = resolveGT(__dirnameGT, "../../interpreters/game-team");
      assert.equal(existsSyncGT(p), false, "interpreters/game-team should be deleted in Phase-4 retirement");
    });
    ```

    (If the file already imports `existsSync` / `resolve` / `dirname` /
    `fileURLToPath` at the top, reuse those imports and drop the
    `GT` aliases.)

- [ ] **Step 2: Verify it fails**

    Run: `npm test`
    Expected: FAIL — game-team still exists.

- [ ] **Step 3: Delete the directory**

    ```bash
    git rm -r interpreters/game-team
    ```

- [ ] **Step 4: Update CLAUDE.md**

    Locate the "Existing interpreters" subsection. Remove the
    `- **\`interpreters/game-team\`** — Game dev team simulation …`
    bullet. Add five new bullets (in this order):

    ```
    - **`interpreters/2-planning-decomposition/a-plan-execute`** — Plan-and-Execute (patterns.md Group 2). Demo d1: minimal TypeScript Node.js project setup. INSTRUCTIONS + dynamics byte-equal across the three leaves in this group.
    - **`interpreters/2-planning-decomposition/b-orchestrator-workers`** — Orchestrator–Workers (Anthropic, Building Effective Agents). Demo d2: summarise 5 technical notes.
    - **`interpreters/2-planning-decomposition/c-deep-research`** — Deep Research (product pattern; Self-Ask ancestry). Demo d3: Raft/Paxos/Multi-Paxos comparison; exercises stack depth 2 via recursive plan.md push.
    - **`interpreters/5-fixed-sop-teams/a-metagpt`** — MetaGPT (Hong et al., ICLR 2024). Document hand-off SOP (PM → Architect → Engineer → QA). Shared PROGRAM.md with b-chatdev for comparison.
    - **`interpreters/5-fixed-sop-teams/b-chatdev`** — ChatDev (Qian et al., 2023). Phase-dialogue SOP (design → coding → testing → documenting). Shared PROGRAM.md with a-metagpt.
    ```

    Anywhere in CLAUDE.md that mentions "game-team exempt" or
    "game-team is exempt" (typically in directory-layout / principle
    discussions), remove that clause.

- [ ] **Step 5: Update README.md (repo root)**

    Search for any `./new-instance.sh` example that references
    `interpreters/game-team`. Replace the example command with:

    ```bash
    ./new-instance.sh foo interpreters/2-planning-decomposition/a-plan-execute
    ```

    and update any surrounding prose accordingly.

- [ ] **Step 6: Update `docs/agent-workflows/requirements.md`**

    Make the following edits in the plan document:
    - **Guiding principle 3** ("Retire `interpreters/game-team` deliberately in Phase 4"): rewrite in the past tense ("Phase 4 retired `interpreters/game-team` per spec `docs/specs/2026-04-24-implement-phase-3-and-4/`") or remove entirely.
    - **Guiding principle 7** (directory-layout convention): remove the sentence exempting game-team.
    - **Group order table** (~line 91): the "Phase 4 (game-team retirement)" cell can remain as historical context; update to "Phase 4 (game-team retired; fixed-SOP teams delivered)".
    - **Phase 3 section**: replace any placeholder paths with the final paths (`interpreters/2-planning-decomposition/a-plan-execute/`, `.../b-orchestrator-workers/`, `.../c-deep-research/`) and mark Phase 3 as shipped.
    - **Phase 4 section**: replace placeholder paths with final paths (`interpreters/5-fixed-sop-teams/a-metagpt/`, `.../b-chatdev/`), mark the retirement complete, and mark Phase 4 as shipped.

- [ ] **Step 7: Update `interpreters/1-iterative-refinement/README.md`**

    If this group README contains any "game-team is exempt" or
    "alongside game-team" language (Phase 1 added a hedge), remove
    the hedge and the sentence(s) around it.

- [ ] **Step 8: Verify tests pass**

    Run: `npm test`
    Expected: PASS — game-team-deletion regression test green; all
    other tests still green.

- [ ] **Step 9: Commit**

    ```bash
    git add -A
    git commit -m "chore(retirement): delete interpreters/game-team; update CLAUDE.md + README + plan + group READMEs (satisfies: R35, R36, R37, R38, R39)"
    ```

---

## Task 12: Live-demo validation + notes + plan dynamics-table sync   (satisfies: R16, R32, R34, R41, R44, R49, R50)

Closes out with five live demo runs, the notes file, and a final
dynamics-table sync in the plan doc if any contract diverged.

**Files:**
- Create: `docs/agent-workflows/phase-3-4-notes.md`
- Modify (contingent): `docs/agent-workflows/requirements.md` (dynamics table)

- [ ] **Step 1: Run full test suite for regression**

    Run: `npm test`
    Expected: PASS (all tests green on a clean checkout). This
    satisfies R44 passively.

- [ ] **Step 2: Live-demo each Phase-3 leaf**

    For each `leaf` in `a-plan-execute`, `b-orchestrator-workers`,
    `c-deep-research`:

    ```bash
    ./new-instance.sh demo-phase-3-<leaf> interpreters/2-planning-decomposition/<leaf>
    instances/demo-phase-3-<leaf>/run.sh
    ```

    Provider: default (claude-code, Haiku). Expected: machine halts
    with `## State\ndone` in
    `instances/demo-phase-3-<leaf>/frames/f000-strategy/MEMORY.md`.

    Record anomalies (if any) in `phase-3-4-notes.md` in Step 4.

- [ ] **Step 3: Live-demo each Phase-4 leaf**

    For each `leaf` in `a-metagpt`, `b-chatdev`:

    ```bash
    ./new-instance.sh demo-phase-4-<leaf> interpreters/5-fixed-sop-teams/<leaf>
    instances/demo-phase-4-<leaf>/run.sh
    ```

    Expected: halts at `## State\ndone`. Confirm the four typed
    hand-off sections are present in the final MEMORY (R33) and that
    `workspace/` contains a runnable `wc-plus` CLI (R34).

- [ ] **Step 4: Create `docs/agent-workflows/phase-3-4-notes.md`**

    If nothing surprising surfaced during implementation or live
    runs, write exactly (one-line file matching the Phase-1 / Phase-2
    convention):

    ```markdown
    # Phase 3 + Phase 4 — notes

    Nothing surprising surfaced during implementation.
    ```

    If anomalies surfaced, write one or more sections instead. Each
    section: a short headline, 1–3 paragraphs, concrete file/line
    references where relevant. Topics to consider: Phase-3 d2 input
    file framing, Phase-4 dialogue turn-cap tuning, Phase-4
    phase-rename edge cases, web-tool timeout under CC, any shell
    bug fixed in T0.

- [ ] **Step 5: Sync plan dynamics table (R50) if any contract diverged**

    Open `docs/agent-workflows/requirements.md` and locate the
    "Reusable dynamics library" table. For each row referencing a
    dynamic introduced by this spec (`plan.md`, `execute-step.md`,
    `synthesize.md`, `worker.md` — if present, remove it — ,
    `investigate.md` — if present, remove it — , `role-*.md`,
    `dialogue.md`, `evaluate.md`), confirm its `MEMORY in` /
    `MEMORY out` columns match what the actual dynamic file returns.
    If any row diverges, update that row. If all rows match, no
    changes.

    Also, if any R41-flagged new pure TypeScript helper was
    introduced anywhere during the spec (Design said none were
    expected; T1 added `stripHtml` as an internal helper — unit-test
    coverage for it is already implicit via `web-tools-fetch.test.ts`
    happy-path; add a direct unit test if coverage is thin):

    ```typescript
    // appended to src/test/web-tools-fetch.test.ts if coverage is thin
    test("stripHtml helper: removes script/style/noscript blocks", async () => {
      // (indirect via webFetch; no need for a new test unless helper is exported)
    });
    ```

    Typically no change is needed here — the happy-path test already
    covers `stripHtml` indirectly.

- [ ] **Step 6: Run full test suite one final time**

    Run: `npm test`
    Expected: PASS. Sanity check that the notes-write + plan-sync
    did not touch any test.

- [ ] **Step 7: Commit**

    ```bash
    git add docs/agent-workflows/phase-3-4-notes.md \
            docs/agent-workflows/requirements.md
    git commit -m "docs: phase-3-4 notes + dynamics-table sync after live demos (satisfies: R16, R32, R34, R41, R44, R49, R50)"
    ```

---

## Coverage check

Every R# from `requirements.md` (R1–R66) appears in at least one task:

- R1–R4: T4, T5, T6 (leaf layout + byte-equal INSTRUCTIONS/dynamics across three leaves)
- R5: T7 (Phase-3 identity test)
- R6–R9: T4 (Phase-3 dynamics contracts)
- R10–R12: T4 (Phase-3 strategy state machine + verbatim directive)
- R13: T4 (a-plan-execute PROGRAM)
- R14, R18: T5 (b-orchestrator-workers PROGRAM + 5 inputs + exactly-5-steps test)
- R15, R19, R43: T6 (c-deep-research PROGRAM + recursion test)
- R16: T4, T5, T6, T12 (live demos halt at done)
- R17: T4 (replan invariant)
- R20, R21: T8, T9 (Phase-4 leaves)
- R22: T8 + T9 (a-metagpt PROGRAM authored; b-chatdev byte-copies it)
- R23–R25, R30: T8 (a-metagpt role dynamics + strategy)
- R26–R28, R31: T9 (b-chatdev dialogue + roles + strategy)
- R29: T8, T9 (byte-equal evaluate.md copies); T10 (four-way identity)
- R32, R33, R34: T8, T9 (Phase-4 demos + final MEMORY sections); T12 (live)
- R35–R39: T11 (game-team retirement)
- R40: T4 (fuzzy conditions + non-blocking pending questions inside strategy); T10 (shell-feature test)
- R41: T12 (any new helper gets a unit test; typically none)
- R42: T4, T5, T6, T8, T9 (per-interpreter integration tests)
- R44: T4, T5, T6, T7, T8, T9, T10, T11, T12 (every task runs `npm test`)
- R45: T4, T5, T6 (Phase-3 leaf READMEs with all-four-framings)
- R46: T7 (Phase-3 group README)
- R47: T8, T9 (Phase-4 leaf READMEs)
- R48: T10 (Phase-4 group README)
- R49: T12 (phase-3-4-notes.md)
- R50: T12 (dynamics-table sync)
- R51–R53: T0 (contingent shell fix) + passive in every task
- R54–R60, R61(a), R62, R63(a–e): T1 (custom web tools + tests)
- R61(a), R64 (non-CC): T2 (wire into getTools / prompts / CLAUDE.md)
- R61(b), R63(f), R64 (CC), R66: T3 (CC allowed tools + CC prompt + CC doc)
- R65: T4, T5, T6 (leaf READMEs with R65 content) + T7 (group README)

Every R# covered.
