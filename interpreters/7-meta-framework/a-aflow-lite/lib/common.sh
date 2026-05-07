#!/usr/bin/env bash
# Shared primitives for aflow-lite library scripts.
# Sourced by: select.sh, expand_push.sh, expand_absorb.sh, sim_push.sh,
#             sim_absorb.sh, eval_absorb.sh.
# CWD is always the active frame directory; ./scoped/ is the frame's heap.

set -euo pipefail

LIBRARY="refine,reflexion,cove,plan-execute,debate"

# Read a single field of a single tree node.
node_field() {
  local id="$1" field="$2"
  awk -v X="$id" -v F="$field" '
    /^---$/ { ib = 0; next }
    /^id:/  { ib = ($2 == X) }
    ib && $1 == F":" { print $2; exit }
  ' ./scoped/tree.md
}

# Surgically update one field of one node.
node_set() {
  local id="$1" field="$2" value="$3"
  awk -v X="$id" -v F="$field" -v V="$value" '
    /^---$/ { ib = 0; print; next }
    /^id:/  { ib = ($2 == X); print; next }
    ib && $1 == F":" { print F": " V; next }
    { print }
  ' ./scoped/tree.md > ./scoped/tree.md.tmp && mv ./scoped/tree.md.tmp ./scoped/tree.md
}

# List children of a node (one id per line).
children_of() {
  local p="$1"
  awk -v P="$p" '
    /^---$/ { id = ""; pp = "" }
    /^id:/ { id = $2 }
    /^parent_id:/ { pp = $2; if (pp == P) print id }
  ' ./scoped/tree.md
}

# Append a fresh child node, returning its new id on stdout.
append_node() {
  local parent="$1" depth="$2"
  local idx
  idx=$(grep -c '^id: n' ./scoped/tree.md)
  local new_id="n$idx"
  cat >> ./scoped/tree.md << EOF
---
id: $new_id
parent_id: $parent
depth: $depth
q: 0
n: 0
status: live
EOF
  echo "$new_id"
}

# Walk parent chain from $1 to root, adding $2 to q and 1 to n at every node.
backprop() {
  local current="$1" reward="$2"
  while [ -n "$current" ] && [ "$current" != "-" ]; do
    local q n new_q new_n
    q=$(node_field "$current" q)
    n=$(node_field "$current" n)
    new_q=$(echo "$q + $reward" | bc -l)
    new_n=$((n + 1))
    node_set "$current" q "$new_q"
    node_set "$current" n "$new_n"
    current=$(node_field "$current" parent_id)
  done
}

# Indent every line of stdin by two spaces (YAML block scalar).
indent2() { sed 's/^/  /'; }
