import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import {
  parseState, setState, getAnswersSection, writeAnswer,
  parsePendingQuestions, parsePush, removePush,
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
