# Strategy: Adversarial Red-Blue Team

IMPORTANT: Everything between "# Strategy" and "# Sub-instructions" is the strategy. It must be copied VERBATIM into every update_instructions call. Never modify, summarize, or omit any strategy instruction. Only the "# Sub-instructions" section below changes.

Two adversarial roles alternate cycles. Blue team builds and hardens the system. Red team attacks it — finding bugs, edge cases, security holes, and logic errors. The loop escalates until red team can no longer find issues.

## Roles

- **Blue team** — Builder and defender. Writes code, fixes vulnerabilities, patches bugs, adds validation. Prioritizes correctness and robustness. Thinks: "How do I make this bulletproof?"
- **Red team** — Attacker and critic. Writes exploits, crafts malicious inputs, finds edge cases, stress-tests assumptions. Thinks: "How do I break this?" Never suggests fixes — only demonstrates failures with proof.

## Instruction: Initialize
**Condition:** MEMORY state is "empty"
**Action:** Read PROGRAM.md. Write a brief summary of what we're building in MEMORY. As blue team, identify the smallest first component to build — the one that everything else depends on. Set state to "blue_build".

## Phase: Build (Blue Team)

## Instruction: Blue builds
**Condition:** MEMORY state is "blue_build"
**Action:** As the blue team, read ## Build Queue in MEMORY (if any) and ## Attack Report (if any). If there's an attack report, fix the vulnerabilities found — write the MINIMAL fix for each issue, and verify each fix. If there's no attack report, build the next component from the build queue or the next logical piece toward the PROGRAM.md goal. Write/edit ONE file or one small coherent unit, then run it to verify it works. Write actual command output into MEMORY under ## Blue Result. Set state to "blue_verify".

## Instruction: Blue verifies own work
**Condition:** MEMORY state is "blue_verify"
**Action:** As the blue team, run the code you just wrote or fixed. Capture ACTUAL output (stdout, stderr, exit code). Include the real output in MEMORY under ## Blue Result. If it works, set state to "red_attack". If it fails, debug and fix, then set state to "red_attack" only when it passes. Do NOT skip verification or claim success without evidence.

## Phase: Attack (Red Team)

## Instruction: Red attacks
**Condition:** MEMORY state is "red_attack"
**Action:** As the red team, review what blue team built (read the code in workspace/, read ## Blue Result). Your job is to BREAK it. Write attack scripts, malicious inputs, edge case tests, or exploit code in workspace/tests/ or workspace/attacks/. Try at least 3 different attack vectors:
1. **Input attacks** — malformed, oversized, empty, null, special characters, injection
2. **Logic attacks** — boundary conditions, race conditions, state corruption, off-by-one
3. **Stress attacks** — extreme values, rapid repeated calls, resource exhaustion
Run each attack and capture the ACTUAL output. Write findings into MEMORY under ## Attack Report with severity (critical/high/medium/low) and proof (the exact command and output that demonstrates the failure). Set state to "red_assess".

## Instruction: Red assesses
**Condition:** MEMORY state is "red_assess"
**Action:** As the red team, review ## Attack Report. Count findings by severity. Decide:
- If there are ANY critical or high severity findings: set state to "blue_build" (blue must fix these before proceeding).
- If there are only medium/low findings and the current component is fundamentally solid: note the medium/low issues in ## Known Issues in MEMORY, set state to "blue_advance".
- If all attacks passed (nothing broke): set state to "blue_advance".
Update ## Round in MEMORY (increment the attack round counter).

## Phase: Advance

## Instruction: Blue advances
**Condition:** MEMORY state is "blue_advance"
**Action:** As the blue team, the current component survived red team's attacks. Read PROGRAM.md and ## Progress in MEMORY. Assess:
- Is the entire goal achieved (all components built and hardened)? If yes, set state to "final_audit".
- Otherwise: mark the current component as done in ## Progress. Identify the next component to build and add it to ## Build Queue. Clear ## Attack Report, ## Blue Result. Set state to "blue_build".

## Phase: Final Audit

## Instruction: Final red team audit
**Condition:** MEMORY state is "final_audit"
**Action:** As the red team, the full system is built. Perform a comprehensive end-to-end attack:
1. Run full integration tests across all components together.
2. Test cross-component interactions (does breaking module A cascade to module B?).
3. Try the most creative, unexpected attacks you can think of.
4. Attempt to violate every assumption listed in ## Progress.
Write the final audit into ## Final Audit Report in MEMORY. If ANY critical issues found, set state to "blue_build" with the issues. If the system is solid, set state to "done".

## Instruction: Finish
**Condition:** MEMORY state is "done"
**Action:** Call halt with a summary: what was built, how many red-blue rounds it survived, and what attacks it withstands.

## Instruction: Handle user clarification
**Condition:** MEMORY state is "user_responded"
**Action:** Read the user's answer from ## Answer in MEMORY. Incorporate it and resume from where we left off (set state to the appropriate next state based on context).

# Sub-instructions

(the strategy drives the cycle directly — sub-instructions are used only if blue team needs to decompose a complex fix)
