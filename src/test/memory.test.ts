import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import {
  parseState, setState, getAnswersSection, writeAnswer,
  parsePendingQuestions, parsePush, removePush,
  parsePushArgs, removePushArgs,
  parseReturn, removeReturn, spliceReturns,
} from "../memory.js";

describe("parseState", () => {
  test("extracts state from ## State section", () => {
    assert.equal(parseState("## State\nfoo\n## Other\nbar"), "foo");
  });

  test("returns empty string when no ## State section", () => {
    assert.equal(parseState("## Other\nbar"), "");
  });

  test("trims trailing whitespace", () => {
    assert.equal(parseState("## State\nfoo   "), "foo");
  });
});

describe("setState", () => {
  test("replaces existing state", () => {
    const out = setState("## State\nfoo\n## Other\nbar", "baz");
    assert.match(out, /^## State\nbaz\n## Other\nbar$/);
  });

  test("no-op when ## State is missing (returns unchanged)", () => {
    const input = "## Other\nbar";
    assert.equal(setState(input, "baz"), input);
  });
});

describe("getAnswersSection", () => {
  test("returns content between ## Answers and next heading (excluding trailing newline)", () => {
    const mem = "## State\nfoo\n## Answers\n- **Q1**: yes\n## Other\n";
    assert.equal(getAnswersSection(mem), "- **Q1**: yes");
  });

  test("returns content to end of file if no trailing heading", () => {
    const mem = "## State\nfoo\n## Answers\n- **Q1**: yes\n";
    assert.equal(getAnswersSection(mem), "- **Q1**: yes");
  });

  test("returns empty string when no ## Answers", () => {
    assert.equal(getAnswersSection("## State\nfoo"), "");
  });

  test("multi-line answers body is captured", () => {
    const mem = "## Answers\n- **Q1**: yes\n- **Q2**: no\n## Other";
    assert.equal(getAnswersSection(mem), "- **Q1**: yes\n- **Q2**: no");
  });
});

describe("writeAnswer", () => {
  test("appends to existing ## Answers", () => {
    const mem = "## State\nfoo\n## Answers\n- **Q1**: yes\n";
    const out = writeAnswer(mem, "Q2", "no");
    assert.match(out, /## Answers\n- \*\*Q2\*\*: no\n- \*\*Q1\*\*: yes/);
  });

  test("creates ## Answers section when missing", () => {
    const mem = "## State\nfoo";
    const out = writeAnswer(mem, "Q1", "yes");
    assert.match(out, /## Answers\n- \*\*Q1\*\*: yes\n/);
  });
});

describe("parsePendingQuestions", () => {
  test("parses bold-label format", () => {
    const mem = "## Pending Questions\n- **Q1**: first\n- **Q2**: second\n";
    const qs = parsePendingQuestions(mem);
    assert.deepEqual(qs, [
      { id: "Q1", question: "first" },
      { id: "Q2", question: "second" },
    ]);
  });

  test("parses underscore-label format", () => {
    const qs = parsePendingQuestions("## Pending Questions\n- __Q1__: x\n");
    assert.deepEqual(qs, [{ id: "Q1", question: "x" }]);
  });

  test("parses plain Q-label format", () => {
    const qs = parsePendingQuestions("## Pending Questions\n- Q1: x\n");
    assert.deepEqual(qs, [{ id: "Q1", question: "x" }]);
  });

  test("parses generic label format as fallback", () => {
    const qs = parsePendingQuestions("## Pending Questions\n- label: x\n");
    assert.deepEqual(qs, [{ id: "label", question: "x" }]);
  });

  test("handles multi-line question bodies", () => {
    const mem = "## Pending Questions\n- **Q1**: first line\n  continuation\n- **Q2**: second\n";
    const qs = parsePendingQuestions(mem);
    assert.equal(qs.length, 2);
    assert.match(qs[0].question, /first line[\s\S]*continuation/);
    assert.equal(qs[1].question, "second");
  });

  test("accepts section header with suffix", () => {
    const mem = "## Pending Questions - Choose Approach\n- **Q1**: x\n";
    const qs = parsePendingQuestions(mem);
    assert.deepEqual(qs, [{ id: "Q1", question: "x" }]);
  });

  test("stops at next ## heading", () => {
    const mem = "## Pending Questions\n- **Q1**: x\n## Answers\n- **Q1**: y\n";
    const qs = parsePendingQuestions(mem);
    assert.deepEqual(qs, [{ id: "Q1", question: "x" }]);
  });

  test("returns [] when section missing", () => {
    assert.deepEqual(parsePendingQuestions("## State\nfoo"), []);
  });
});

describe("parsePush", () => {
  test("extracts path after ## Push header", () => {
    assert.equal(parsePush("## State\nfoo\n## Push\ndynamics/consult.md"), "dynamics/consult.md");
  });

  test("trims whitespace from path", () => {
    assert.equal(parsePush("## Push\n  dynamics/consult.md  \n"), "dynamics/consult.md");
  });

  test("returns null when ## Push is missing", () => {
    assert.equal(parsePush("## State\nfoo"), null);
  });

  test("returns null for empty push body", () => {
    assert.equal(parsePush("## State\nfoo\n## Push\n"), null);
  });
});

describe("removePush", () => {
  test("removes ## Push section in the middle", () => {
    const mem = "## State\nfoo\n## Push\npath\n## Other\nx";
    assert.equal(removePush(mem), "## State\nfoo\n## Other\nx");
  });

  test("removes ## Push section at end of file", () => {
    const mem = "## State\nfoo\n## Push\npath";
    const out = removePush(mem);
    assert.match(out, /^## State\nfoo\s*$/);
  });

  test("removes ## Push even when followed by blank line + next section", () => {
    const mem = "## State\nfoo\n## Push\npath\n\n## Other\nx";
    const out = removePush(mem);
    assert.match(out, /## State\nfoo/);
    assert.match(out, /## Other\nx/);
    assert.doesNotMatch(out, /## Push/);
  });

  test("no-op when no ## Push section present", () => {
    const mem = "## State\nfoo\n## Other\nx";
    assert.equal(removePush(mem), mem);
  });
});

describe("parsePushArgs", () => {
  test("returns empty object when section absent", () => {
    const memory = "## State\nfoo\n## Push\ndynamics/x.md";
    assert.deepEqual(parsePushArgs(memory), {});
  });

  test("parses single-line key: value pairs", () => {
    const memory = "## State\nfoo\n## Push\nx.md\n## Push-Args\nq: hi\nr: bye";
    assert.deepEqual(parsePushArgs(memory), { q: "hi", r: "bye" });
  });

  test("parses block scalar with | indicator (2-space indent)", () => {
    const memory = "## State\nfoo\n## Push\nx.md\n## Push-Args\ndraft: |\n  line one\n  line two\nq: short";
    assert.deepEqual(parsePushArgs(memory), { draft: "line one\nline two", q: "short" });
  });

  test("stops at next ## heading", () => {
    const memory = "## State\nfoo\n## Push\nx.md\n## Push-Args\nq: hi\n## Other\nignored: yes";
    assert.deepEqual(parsePushArgs(memory), { q: "hi" });
  });

  test("handles section at end of MEMORY without trailing newline", () => {
    const memory = "## State\nfoo\n## Push\nx.md\n## Push-Args\nq: hi";
    assert.deepEqual(parsePushArgs(memory), { q: "hi" });
  });

  test("skips malformed lines, parses valid ones", () => {
    const memory = "## State\nfoo\n## Push\nx.md\n## Push-Args\nq: hi\nbroken-no-colon\nr: bye";
    assert.deepEqual(parsePushArgs(memory), { q: "hi", r: "bye" });
  });

  test("trims trailing empty lines from block-scalar value", () => {
    const memory = "## State\nfoo\n## Push\nx.md\n## Push-Args\ndraft: |\n  one\n  two\n\n## Other\nx";
    assert.deepEqual(parsePushArgs(memory), { draft: "one\ntwo" });
  });
});

describe("removePushArgs", () => {
  test("strips section between ## Push-Args and next ## heading", () => {
    const memory = "## State\nfoo\n## Push\nx.md\n## Push-Args\nq: hi\nr: bye\n## Other\nkeep: this";
    const result = removePushArgs(memory);
    assert.equal(result, "## State\nfoo\n## Push\nx.md\n## Other\nkeep: this");
  });

  test("strips section to end of MEMORY when no following ##", () => {
    const memory = "## State\nfoo\n## Push\nx.md\n## Push-Args\nq: hi";
    const result = removePushArgs(memory);
    assert.equal(result, "## State\nfoo\n## Push\nx.md");
  });

  test("returns memory unchanged when section absent", () => {
    const memory = "## State\nfoo\n## Push\nx.md";
    assert.equal(removePushArgs(memory), memory);
  });
});

describe("parseReturn", () => {
  test("returns empty entries when section absent", () => {
    const memory = "## State\ndone\n## Last Action\nfoo";
    const r = parseReturn(memory);
    assert.deepEqual(r.entries, {});
    assert.deepEqual(r.malformedLines, []);
  });

  test("parses single-line key: value pairs", () => {
    const memory = "## State\ndone\n## Return\nanswer: yes\nverdict: pass\n## Last Action\nfoo";
    const r = parseReturn(memory);
    assert.deepEqual(r.entries, { answer: "yes", verdict: "pass" });
    assert.deepEqual(r.malformedLines, []);
  });

  test("parses block scalar with two-space indent", () => {
    const memory = "## State\ndone\n## Return\ndraft: |\n  line one\n  line two\nshort: hi";
    const r = parseReturn(memory);
    assert.deepEqual(r.entries, { draft: "line one\nline two", short: "hi" });
  });

  test("collects malformed lines for logging", () => {
    const memory = "## State\ndone\n## Return\nok: yes\nbroken-no-colon\nalso-ok: true";
    const r = parseReturn(memory);
    assert.deepEqual(r.entries, { ok: "yes", "also-ok": "true" });
    assert.deepEqual(r.malformedLines, ["broken-no-colon"]);
  });

  test("stops at next ## heading", () => {
    const memory = "## State\ndone\n## Return\nq: hi\n## Other\nignored: yes";
    const r = parseReturn(memory);
    assert.deepEqual(r.entries, { q: "hi" });
  });
});

describe("removeReturn", () => {
  test("strips section between ## Return and next ##", () => {
    const memory = "## State\ndone\n## Return\nq: hi\n## Other\nkeep: this";
    assert.equal(removeReturn(memory), "## State\ndone\n## Other\nkeep: this");
  });

  test("strips section to end when no following heading", () => {
    const memory = "## State\ndone\n## Return\nq: hi";
    assert.equal(removeReturn(memory), "## State\ndone");
  });

  test("returns memory unchanged when section absent", () => {
    const memory = "## State\ndone\n## Last Action\nfoo";
    assert.equal(removeReturn(memory), memory);
  });
});

describe("spliceReturns", () => {
  test("appends a new section for a new key", () => {
    const caller = "## State\nattempted_completed\n";
    const r = spliceReturns(caller, { verdict: "pass" });
    assert.match(r, /## State\nattempted_completed/);
    assert.match(r, /## Verdict\npass/);
  });

  test("replaces an existing section body", () => {
    const caller = "## State\nfoo\n## Verdict\nfail\n## Feedback\nold";
    const r = spliceReturns(caller, { verdict: "pass" });
    assert.match(r, /## Verdict\npass/);
    assert.doesNotMatch(r, /## Verdict\nfail/);
    assert.match(r, /## Feedback\nold/);
  });

  test("capitalizes only the first character of the key", () => {
    const caller = "## State\nfoo\n";
    const r = spliceReturns(caller, { answerId: "42" });
    assert.match(r, /## AnswerId\n42/);
  });

  test("handles multi-line values", () => {
    const caller = "## State\nfoo\n";
    const r = spliceReturns(caller, { draft: "line1\nline2\nline3" });
    assert.match(r, /## Draft\nline1\nline2\nline3/);
  });

  test("returns caller unchanged when returns map is empty", () => {
    const caller = "## State\nfoo\n## Something\nbar";
    assert.equal(spliceReturns(caller, {}), caller);
  });
});
