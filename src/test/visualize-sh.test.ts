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
