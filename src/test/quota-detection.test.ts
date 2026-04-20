import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { isQuotaError } from "../providers/claude-code.js";

describe("claude-code quota detection", () => {
  test("matches HTTP 529 with word boundary", () => {
    assert.equal(isQuotaError("HTTP 529 Overloaded"), true);
    assert.equal(isQuotaError("status: 529"), true);
    assert.equal(isQuotaError(" 529 "), true);
  });

  test("does NOT match 529 embedded inside larger digit runs", () => {
    // Regression guard for the bug that fired on every cycle 3:
    // the JSON blob `"cache_read_input_tokens":97595` contains "529"
    // as a substring of 97595, causing the /529/ regex to misfire.
    assert.equal(isQuotaError('{"cache_read_input_tokens":97595}'), false);
    assert.equal(isQuotaError('{"total_tokens":15290}'), false);
    assert.equal(isQuotaError("15291 tokens used"), false);
  });

  test("still catches other quota phrases", () => {
    assert.equal(isQuotaError("Rate limited"), true);
    assert.equal(isQuotaError("rate_limit exceeded"), true);
    assert.equal(isQuotaError("Quota exceeded"), true);
    assert.equal(isQuotaError("Too many requests"), true);
    assert.equal(isQuotaError("Model is overloaded"), true);
    assert.equal(isQuotaError("resource_exhausted"), true);
  });

  test("does not flag plain success output", () => {
    assert.equal(isQuotaError('{"type":"result","is_error":false}'), false);
    assert.equal(isQuotaError("Cycle complete."), false);
  });
});
