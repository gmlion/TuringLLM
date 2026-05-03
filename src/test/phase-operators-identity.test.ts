import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = resolve(__dirname, "../..");

const EVALUATE_PATHS = [
  "interpreters/1-iterative-refinement/b-evaluator-optimizer/operators/evaluate.md",
  "interpreters/1-iterative-refinement/c-reflexion/operators/evaluate.md",
  "interpreters/5-fixed-sop-teams/a-metagpt/operators/evaluate.md",
  "interpreters/5-fixed-sop-teams/b-chatdev/operators/evaluate.md",
  "interpreters/3-search/a-tot/operators/evaluate.md",
  "interpreters/3-search/b-lats/operators/evaluate.md",
  "interpreters/7-meta-framework/a-aflow-lite/operators/evaluate.md",
];

const REFLECT_PATHS = [
  "interpreters/1-iterative-refinement/c-reflexion/operators/reflect.md",
  "interpreters/3-search/b-lats/operators/reflect.md",
  "interpreters/7-meta-framework/a-aflow-lite/operators/reflect.md",
];

const EXPAND_NODE_PATHS = [
  "interpreters/3-search/a-tot/operators/expand-node.md",
  "interpreters/3-search/b-lats/operators/expand-node.md",
];

const PLAN_EXECUTE_PATHS = [
  "interpreters/2-planning-decomposition/a-plan-execute/operators/plan-execute.md",
  "interpreters/2-planning-decomposition/b-orchestrator-workers/operators/plan-execute.md",
  "interpreters/2-planning-decomposition/c-deep-research/operators/plan-execute.md",
  "interpreters/7-meta-framework/a-aflow-lite/operators/plan-execute.md",
];

const PLAN_PATHS = [
  "interpreters/2-planning-decomposition/a-plan-execute/operators/plan.md",
  "interpreters/2-planning-decomposition/b-orchestrator-workers/operators/plan.md",
  "interpreters/2-planning-decomposition/c-deep-research/operators/plan.md",
  "interpreters/7-meta-framework/a-aflow-lite/operators/plan.md",
];

const TACKLE_PATHS = [
  "interpreters/2-planning-decomposition/a-plan-execute/operators/tackle.md",
  "interpreters/2-planning-decomposition/b-orchestrator-workers/operators/tackle.md",
  "interpreters/2-planning-decomposition/c-deep-research/operators/tackle.md",
  "interpreters/7-meta-framework/a-aflow-lite/operators/tackle.md",
];

const REFINE_PATHS = [
  "interpreters/1-iterative-refinement/b-evaluator-optimizer/operators/refine.md",
  "interpreters/7-meta-framework/a-aflow-lite/operators/refine.md",
];

const REFLEXION_PATHS = [
  "interpreters/1-iterative-refinement/c-reflexion/operators/reflexion.md",
  "interpreters/7-meta-framework/a-aflow-lite/operators/reflexion.md",
];

const COVE_PATHS = [
  "interpreters/1-iterative-refinement/d-cove/operators/cove.md",
  "interpreters/7-meta-framework/a-aflow-lite/operators/cove.md",
];

const VERIFY_PATHS = [
  "interpreters/1-iterative-refinement/d-cove/operators/verify.md",
  "interpreters/7-meta-framework/a-aflow-lite/operators/verify.md",
];

const ANSWER_INDEPENDENTLY_PATHS = [
  "interpreters/1-iterative-refinement/d-cove/operators/answer-independently.md",
  "interpreters/7-meta-framework/a-aflow-lite/operators/answer-independently.md",
];

const DEBATE_PATHS = [
  "interpreters/4-peer-collaboration/a-debate/operators/debate.md",
  "interpreters/7-meta-framework/a-aflow-lite/operators/debate.md",
];

const OPINE_PATHS = [
  "interpreters/4-peer-collaboration/a-debate/operators/opine.md",
  "interpreters/7-meta-framework/a-aflow-lite/operators/opine.md",
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

describe("reflect.md identity across phases", () => {
  test("reflect.md is byte-equal across all consumers", () => {
    const contents = REFLECT_PATHS.map((p) => readFileSync(resolve(REPO, p)));
    for (let i = 1; i < contents.length; i++) {
      assert.ok(
        contents[0].equals(contents[i]),
        `reflect.md diverged between ${REFLECT_PATHS[0]} and ${REFLECT_PATHS[i]}`,
      );
    }
  });
});

describe("expand-node.md identity across phases (post-refactor)", () => {
  test("expand-node.md is byte-equal across all consumers", () => {
    const contents = EXPAND_NODE_PATHS.map((p) => readFileSync(resolve(REPO, p)));
    for (let i = 1; i < contents.length; i++) {
      assert.ok(
        contents[0].equals(contents[i]),
        `expand-node.md diverged between ${EXPAND_NODE_PATHS[0]} and ${EXPAND_NODE_PATHS[i]}`,
      );
    }
  });
});

describe("plan-execute.md identity across phases", () => {
  test("plan-execute.md is byte-equal across all consumers", () => {
    const contents = PLAN_EXECUTE_PATHS.map((p) => readFileSync(resolve(REPO, p)));
    for (let i = 1; i < contents.length; i++) {
      assert.ok(
        contents[0].equals(contents[i]),
        `plan-execute.md diverged between ${PLAN_EXECUTE_PATHS[0]} and ${PLAN_EXECUTE_PATHS[i]}`,
      );
    }
  });
});

describe("plan.md identity across phases", () => {
  test("plan.md is byte-equal across all consumers", () => {
    const contents = PLAN_PATHS.map((p) => readFileSync(resolve(REPO, p)));
    for (let i = 1; i < contents.length; i++) {
      assert.ok(
        contents[0].equals(contents[i]),
        `plan.md diverged between ${PLAN_PATHS[0]} and ${PLAN_PATHS[i]}`,
      );
    }
  });
});

describe("tackle.md identity across phases", () => {
  test("tackle.md is byte-equal across all consumers", () => {
    const contents = TACKLE_PATHS.map((p) => readFileSync(resolve(REPO, p)));
    for (let i = 1; i < contents.length; i++) {
      assert.ok(
        contents[0].equals(contents[i]),
        `tackle.md diverged between ${TACKLE_PATHS[0]} and ${TACKLE_PATHS[i]}`,
      );
    }
  });
});

describe("refine.md identity across phases", () => {
  test("refine.md is byte-equal across all consumers", () => {
    const contents = REFINE_PATHS.map((p) => readFileSync(resolve(REPO, p)));
    for (let i = 1; i < contents.length; i++) {
      assert.ok(
        contents[0].equals(contents[i]),
        `refine.md diverged between ${REFINE_PATHS[0]} and ${REFINE_PATHS[i]}`,
      );
    }
  });
});

describe("reflexion.md identity across phases", () => {
  test("reflexion.md is byte-equal across all consumers", () => {
    const contents = REFLEXION_PATHS.map((p) => readFileSync(resolve(REPO, p)));
    for (let i = 1; i < contents.length; i++) {
      assert.ok(
        contents[0].equals(contents[i]),
        `reflexion.md diverged between ${REFLEXION_PATHS[0]} and ${REFLEXION_PATHS[i]}`,
      );
    }
  });
});

describe("cove.md identity across phases", () => {
  test("cove.md is byte-equal across all consumers", () => {
    const contents = COVE_PATHS.map((p) => readFileSync(resolve(REPO, p)));
    for (let i = 1; i < contents.length; i++) {
      assert.ok(
        contents[0].equals(contents[i]),
        `cove.md diverged between ${COVE_PATHS[0]} and ${COVE_PATHS[i]}`,
      );
    }
  });
});

describe("verify.md identity across phases", () => {
  test("verify.md is byte-equal across all consumers", () => {
    const contents = VERIFY_PATHS.map((p) => readFileSync(resolve(REPO, p)));
    for (let i = 1; i < contents.length; i++) {
      assert.ok(
        contents[0].equals(contents[i]),
        `verify.md diverged between ${VERIFY_PATHS[0]} and ${VERIFY_PATHS[i]}`,
      );
    }
  });
});

describe("answer-independently.md identity across phases", () => {
  test("answer-independently.md is byte-equal across all consumers", () => {
    const contents = ANSWER_INDEPENDENTLY_PATHS.map((p) => readFileSync(resolve(REPO, p)));
    for (let i = 1; i < contents.length; i++) {
      assert.ok(
        contents[0].equals(contents[i]),
        `answer-independently.md diverged between ${ANSWER_INDEPENDENTLY_PATHS[0]} and ${ANSWER_INDEPENDENTLY_PATHS[i]}`,
      );
    }
  });
});

describe("debate.md identity across phases", () => {
  test("debate.md is byte-equal across all consumers", () => {
    const contents = DEBATE_PATHS.map((p) => readFileSync(resolve(REPO, p)));
    for (let i = 1; i < contents.length; i++) {
      assert.ok(
        contents[0].equals(contents[i]),
        `debate.md diverged between ${DEBATE_PATHS[0]} and ${DEBATE_PATHS[i]}`,
      );
    }
  });
});

describe("opine.md identity across phases", () => {
  test("opine.md is byte-equal across all consumers", () => {
    const contents = OPINE_PATHS.map((p) => readFileSync(resolve(REPO, p)));
    for (let i = 1; i < contents.length; i++) {
      assert.ok(
        contents[0].equals(contents[i]),
        `opine.md diverged between ${OPINE_PATHS[0]} and ${OPINE_PATHS[i]}`,
      );
    }
  });
});
