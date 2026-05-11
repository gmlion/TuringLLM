#!/usr/bin/env bash
# Shared primitives for adas-lite library scripts.
# Sourced by: initialize.sh, seed_stage.sh, propose_push.sh, propose_absorb.sh,
#             test_push.sh, test_absorb.sh, finalize_entry.sh, record_invalid.sh,
#             finalize_run.sh.
# CWD is always the active frame directory; ./scoped/ is the frame's heap.

set -euo pipefail

BASE_LIBRARY="refine reflexion cove plan-execute debate"

# Indent every line of stdin by two spaces (YAML block scalar).
indent2() { sed 's/^/  /'; }

# Number of files in ./scoped/archive/ (0 if dir empty or missing).
archive_count() {
  if [ -d ./scoped/archive ]; then
    find ./scoped/archive -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' '
  else
    echo 0
  fi
}

# Zero-padded NN for the next archive entry.
next_archive_nn() {
  local n
  n=$(archive_count)
  printf '%02d' "$((n + 1))"
}

# Extract the spliced ## Answer block from MEMORY.md.
extract_answer() {
  awk '/^## Answer$/{found=1;next} found && /^## /{exit} found{print}' ./MEMORY.md \
    | sed '/^[[:space:]]*$/d'
}

# Extract the spliced ## Operator_content block from MEMORY.md.
# (Splice from `operator_content:` Return key per Phase-2b grammar.)
extract_operator_content() {
  awk '/^## Operator_content$/{found=1;next} found && /^## /{exit} found{print}' ./MEMORY.md
}

# Append a recent-scores line and cap the file at the last 20 entries.
recent_scores_append() {
  local label="$1" score="$2"
  echo "${label}: ${score}" >> ./scoped/recent_scores.md
  tail -n 20 ./scoped/recent_scores.md > ./scoped/recent_scores.md.tmp
  mv ./scoped/recent_scores.md.tmp ./scoped/recent_scores.md
}

# Write an archive entry.
# Args: NN, label, phase, score, items_passed, items_total, per_item_scores,
#       malformed (true|false), note_text, content_path.
archive_write() {
  local nn="$1" label="$2" phase="$3" score="$4" passed="$5" total="$6"
  local per_item="$7" malformed="$8" note_text="$9" content_path="${10}"
  local out="./scoped/archive/${nn}-${label}.md"
  mkdir -p ./scoped/archive
  {
    echo "---"
    echo "entry: ${nn}"
    echo "label: ${label}"
    echo "phase: ${phase}"
    echo "score: ${score}"
    echo "items_passed: ${passed}"
    echo "items_total: ${total}"
    echo "per_item_scores: ${per_item}"
    echo "malformed: ${malformed}"
    echo "---"
    echo
    echo "## Failure note"
    echo
    if [ -n "$note_text" ]; then
      printf '%s\n' "$note_text"
    else
      echo "No failure note."
    fi
    echo
    echo "## Operator content"
    echo
    if [ -f "$content_path" ]; then
      cat "$content_path"
    else
      echo "(content path missing: ${content_path})"
    fi
  } > "$out"
}

# Splice holdout fields into a winner archive entry's front-matter.
# Inserts `holdout_score: <hs>` and `holdout_per_item: <hp>` lines
# immediately before the closing `---` of the YAML front-matter block.
# Args: entry_file, holdout_score, holdout_per_item.
splice_holdout_fields() {
  local f="$1" hs="$2" hp="$3"
  awk -v hs="$hs" -v hp="$hp" '
    BEGIN { count = 0; inserted = 0 }
    /^---$/ {
      count++
      if (count == 2 && !inserted) {
        print "holdout_score: " hs
        print "holdout_per_item: " hp
        inserted = 1
      }
    }
    { print }
  ' "$f" > "${f}.tmp" && mv "${f}.tmp" "$f"
}
