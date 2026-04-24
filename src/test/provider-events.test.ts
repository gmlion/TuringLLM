import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve as nodeResolve } from "node:path";
import type { CycleResult, ProviderEvent } from "../providers/shared.js";

describe("providers/shared.ts CycleResult shape", () => {
  test("CycleResult.events is a ProviderEvent[]", () => {
    const result: CycleResult = {
      halt: false,
      events: [
        { type: "llm_request", provider: "api", model: "x", prompt: "p" },
        { type: "tool_call", tool: "bash", input: "ls" },
        { type: "tool_result", tool: "bash", output: "OK", isError: false },
        { type: "llm_response", output: "done", durationMs: 100 },
        { type: "retry", attempt: 1, reason: "no state change" },
      ],
    };
    assert.equal(result.events.length, 5);
  });

  test("ProviderEvent discriminates by type", () => {
    const ev: ProviderEvent = { type: "llm_request", provider: "p", model: "m", prompt: "x" };
    assert.equal(ev.type, "llm_request");
    if (ev.type === "llm_request") assert.equal(ev.provider, "p"); // type narrowing
  });
});

describe("providers do not import events.ts (B-architecture guard)", () => {
  const providerFiles = [
    "src/providers/api.ts",
    "src/providers/claude-code.ts",
    "src/providers/openai.ts",
    "src/providers/ollama.ts",
    "src/providers/local.ts",
  ];

  for (const f of providerFiles) {
    test(`${f} has no import from events`, () => {
      const src = readFileSync(nodeResolve(process.cwd(), f), "utf-8");
      assert.equal(/from\s+["']\.\.\/events(\.js)?["']/.test(src), false,
        `${f} must not import events.ts (B-architecture)`);
    });
  }
});
