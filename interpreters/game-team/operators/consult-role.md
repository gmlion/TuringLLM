# Dynamic: Consult Role

Receives arguments:
  - `{{role}}` — the role name (matches a file under `../../roles/<name>.md`).
  - `{{feature}}` — the feature description being discussed.
  - `{{brief_path}}` — path to the game brief blob (typically `./scoped/game_brief.md` from the team-lead frame; resolved relative to this dynamic's frame is the same file because the caller mounted it inside its own scoped/, so the path is `../../<caller frame>/scoped/game_brief.md` — pragmatically just read the role file and the inline {{feature}} and treat the brief path as optional context).

Produces: `## State done` + `## Return` block with keys `role` (echoed back so the caller knows which role this is) and `opinion` (the role's view as a block scalar).
Return: state done → caller sees {caller_state}_completed, and the verbatim `## Return` body is placed into the caller's MEMORY under a single `## Popped Return` section (the caller reads `role` and `opinion` keys from inside that section).

## Instruction: Opine in role
**Condition:** MEMORY state is "empty"
**Action:** Read the role persona file. The role name is `{{role}}` and the file is at `../../roles/{{role}}.md`. Read it via bash:

    bash cat ../../roles/{{role}}.md

If the role file is missing, that is a programmer error — write the opinion as `(role file missing: ../../roles/{{role}}.md)` and proceed to return; the caller will treat it as a non-fatal degenerate case.

Adopt the role's perspective. Consider the feature below from that role's viewpoint only. Produce a concise opinion (3-6 sentences). It should be substantive — flag concrete risks, specific recommendations, or trade-offs in your domain. Don't repeat what other roles would say better.

Write `./MEMORY.md` with this EXACT single-heredoc shape (the `## Return` block MUST be in the same heredoc as the state change — without it the shell pops with no return value, breaking the caller):

```
cat > ./MEMORY.md << 'MEMEOF'
## State
done
## Matched Instruction
Opine in role
## Last Action
Adopted the {{role}} persona, produced an opinion on the feature.
## Result
Opinion written to ## Return.
## Return
role: {{role}}
opinion: |
  <your opinion as the {{role}}, 3-6 sentences, every line indented two spaces>
MEMEOF
```

Feature under consideration:
{{feature}}
