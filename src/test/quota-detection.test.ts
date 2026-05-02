import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { isQuotaError, shouldThrowQuotaForResponse } from "../providers/claude-code.js";

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

describe("shouldThrowQuotaForResponse — caller-side gating", () => {
  test("successful response with quota-shaped prose is NOT a quota error", () => {
    // Regression for the cycle-66 false positive: the LLM's prose described
    // UCT exploration "rate" / used the word "quota" in narration; the API
    // call itself succeeded (is_error: false). Retrying would have discarded
    // the MEMORY mutations the LLM had already written.
    const parsed = {
      type: "result",
      subtype: "success",
      is_error: false,
      api_error_status: null,
      result: "Perfect! I've successfully executed the Expand-push. Note: the rate of exploration is governed by UCT.",
    };
    assert.equal(shouldThrowQuotaForResponse(parsed, 0, JSON.stringify(parsed), ""), false);
  });

  test("response containing 'quota' or '529' as content is still NOT a quota error when is_error=false", () => {
    const parsed = {
      is_error: false,
      api_error_status: null,
      result: "Quota check passed. Continuing with rate limit considerations. Code 529 is irrelevant here.",
    };
    assert.equal(shouldThrowQuotaForResponse(parsed, 0, JSON.stringify(parsed), ""), false);
  });

  test("API-level error with quota text IS a quota error", () => {
    const parsed = {
      is_error: true,
      api_error_status: 529,
      result: "API call failed: Overloaded",
    };
    // api_error_status=529 (a number) won't match string check, but result text matches
    assert.equal(shouldThrowQuotaForResponse(parsed, 0, JSON.stringify(parsed), ""), true);
  });

  test("API-level error with quota in api_error_status string IS a quota error", () => {
    const parsed = {
      is_error: true,
      api_error_status: "rate_limit_exceeded",
      result: "",
    };
    assert.equal(shouldThrowQuotaForResponse(parsed, 0, JSON.stringify(parsed), ""), true);
  });

  test("subprocess crash with quota in stderr IS a quota error", () => {
    assert.equal(shouldThrowQuotaForResponse(null, 1, "", "API error: Quota exceeded"), true);
  });

  test("subprocess crash without quota text is NOT a quota error", () => {
    assert.equal(shouldThrowQuotaForResponse(null, 1, "", "Connection refused"), false);
  });

  test("unparseable but successful exit IS checked (responseInvalid path)", () => {
    assert.equal(shouldThrowQuotaForResponse(null, 0, "Quota exceeded raw text", ""), true);
    assert.equal(shouldThrowQuotaForResponse(null, 0, "Plain text response", ""), false);
  });

  test("empty stdout with successful exit is benign (no JSON, no error indicator)", () => {
    assert.equal(shouldThrowQuotaForResponse(null, 0, "", ""), false);
  });
});
