# Dynamic: Opine

Receives push-args: `{{round}}`, `{{persona_name}}`, `{{persona_description}}`, `{{question}}`, `{{transcript}}`.
Produces: `## State done` + `## Return` block with key `opinion`.

This dynamic is invoked by the debate strategy once per (round, agent) pair. Each invocation produces ONE persona's contribution to ONE round, in isolation from siblings in the same round. The `transcript` push-arg contains opinions from rounds 1..(round−1) only — never siblings in the current round.

## Instruction: Speak as persona
**Condition:** MEMORY state is "empty"
**Action:** You ARE `{{persona_name}}` for this turn. Read your characterisation, the question, and the prior-rounds transcript below. Then form an opinion (2–5 sentences) responding to the question from your persona's perspective, addressing what other personas said in earlier rounds where present.

Constraints:
- Speak in `{{persona_name}}`'s voice. Do not impersonate another persona.
- If the transcript is `(none — round 1)`, this is the first round — produce a fresh opinion without referencing prior content.
- Otherwise, address one or more points from the prior-rounds transcript explicitly. Disagree, refine, or extend; do not merely restate.

Write `./MEMORY.md` with this EXACT single-heredoc shape (the `## Return` block MUST be in the same heredoc as the state change — without it the shell pops with no return value, breaking the caller):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Speak as persona
## Last Action
Composed opinion for {{persona_name}} in round {{round}}; popping back to coordinator.
## Result
Opinion produced.
## Return
opinion: |
  <your 2–5 sentence opinion in {{persona_name}}'s voice, every line indented two spaces>
MEMEOF
```

You are: `{{persona_name}}`.

Your characterisation:
{{persona_description}}

The question:
{{question}}

Round number: `{{round}}`.

Prior rounds (your siblings in THIS round are deliberately not visible — strict round isolation):
{{transcript}}
