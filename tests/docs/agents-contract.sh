#!/usr/bin/env bash

set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
passes=0
failures=0

pass() {
  printf 'PASS: %s\n' "$1"
  passes=$((passes + 1))
}

fail() {
  printf 'FAIL: %s\n' "$1"
  failures=$((failures + 1))
}

require_file() {
  local path="$1"
  local description="$2"

  if [[ -f "$repo_root/$path" ]]; then
    pass "$description"
  else
    fail "$description (missing: $path)"
  fi
}

require_text() {
  local path="$1"
  local pattern="$2"
  local description="$3"

  if rg --quiet --fixed-strings "$pattern" "$repo_root/$path"; then
    pass "$description"
  else
    fail "$description (missing text in $path: $pattern)"
  fi
}

require_balanced_fences() {
  local path="$1"
  local count
  count="$(awk '/^```/{count++} END{print count+0}' "$repo_root/$path")"

  if (( count % 2 == 0 )); then
    pass "$path has balanced Markdown fences"
  else
    fail "$path has unbalanced Markdown fences ($count)"
  fi
}

require_english_prose() {
  local path="$1"
  local description="$2"

  if sed \
    -e 's/OnlyBoth-产品方案\.md//g' \
    -e 's/OnlyBoth-产品精神\.md//g' \
    -e 's/OnlyBoth-工程设计\.md//g' \
    -e 's/OnlyBoth-AI工程设计\.md//g' \
    -e 's/OnlyBoth-赛事评估与竞品研究\.md//g' \
    -e 's/OnlyBoth-运行代码迁移计划-TEMP\.md//g' \
    "$repo_root/$path" | rg --quiet --pcre2 '\p{Han}'; then
    fail "$description (found Han-script prose in $path)"
  else
    pass "$description"
  fi
}

require_file "AGENTS.md" "root AGENTS.md exists"
require_file "HANDOFF.md" "root HANDOFF.md exists"
require_file "OnlyBoth-产品精神.md" "normative product doctrine exists"
require_file "OnlyBoth-产品方案.md" "authoritative product plan exists"
require_file "OnlyBoth-工程设计.md" "authoritative engineering design exists"
require_file "README.md" "root README exists"
require_file "test-reports/README.md" "test report policy exists"

require_text "AGENTS.md" "Every behavior change MUST add or update automated tests in the same change." "AGENTS requires tests for behavior changes"
require_text "AGENTS.md" "persist actual test output under test-reports/" "AGENTS requires persisted test output"
require_text "AGENTS.md" 'Every development task MUST update the root `HANDOFF.md` before completion.' "AGENTS requires HANDOFF updates"
require_text "AGENTS.md" 'only the primary integration agent may update the root `HANDOFF.md`' "AGENTS protects HANDOFF during parallel work"
require_text "AGENTS.md" "No held blind-review obligation → No candidate answer" "AGENTS preserves pre-answer review obligation"
require_text "AGENTS.md" "No recorded answer evidence → No candidate selection" "AGENTS forbids pre-answer candidate selection"
require_text "AGENTS.md" "No completed cohort reviews → No Direct / Explore allocation" "AGENTS preserves the Advancement Cohort review barrier"
require_text "AGENTS.md" "No work evidence → No pedigree reveal" "AGENTS preserves label reveal invariant"
require_text "AGENTS.md" 'Résumé Reveal requires an immutable anonymous Human Answer Review with decision' "AGENTS binds résumé Reveal to an anonymous positive Human Review"
require_text "AGENTS.md" '`ADVANCE_ELIGIBLE`, the Candidate' "AGENTS defines the exact review outcome that authorizes résumé Reveal"
require_text "AGENTS.md" 'separately paginated Recruiter' "AGENTS isolates full résumés from sequential answer review"
require_text "AGENTS.md" 'inclusive two-year graduation boundary' "AGENTS freezes deterministic education precedence"
require_text "AGENTS.md" "No settled human obligation → That review Slot cannot serve the next candidate" "AGENTS preserves per-Slot backpressure"
require_text "AGENTS.md" "Answer Review Slots are reusable concurrent obligations" "AGENTS forbids treating WIP as total applicant capacity"
require_text "AGENTS.md" "Lightweight Interest is a queue registration, not an Application" "AGENTS preserves the Interest/Application boundary"
require_text "AGENTS.md" "A settled Answer Review Slot must serve the next queued Interest" "AGENTS requires rolling queue service"
require_text "AGENTS.md" "Candidate Evidence Passport Drafts, immutable Snapshots, and discovery signals are Candidate-only." "AGENTS preserves the Passport role boundary"
require_text "AGENTS.md" "deriveCandidateJobSignals" "AGENTS registers Candidate-only discovery"
require_text "AGENTS.md" "Every open JobPost remains visible" "AGENTS forbids discovery-based job hiding"
require_text "AGENTS.md" "Employer Evidence Analyst policy and Review Criteria are sealed" "AGENTS seals Employer analysis policy before consent"
require_text "AGENTS.md" "Process sources MUST NOT support or contradict an AI capability criterion" "AGENTS separates process context from AI capability findings"
require_text "AGENTS.md" "Good/Bad verdict scoped to one sealed Answer" "AGENTS bounds binary answer assessment"
require_text "AGENTS.md" "only with pre-application disclosure" "AGENTS requires consent before behavior profiling"
require_text "AGENTS.md" "analysis states MUST NOT block" "AGENTS keeps AI analysis nonblocking"
require_text "AGENTS.md" '`TEXT | AUDIO | IMAGE | FILE` parts' "AGENTS defines the multimodal Critical Challenge manifest"
require_text "AGENTS.md" "before registering Interest or" "AGENTS exposes the complete Challenge before Candidate commitment"
require_text "HANDOFF.md" "Verification and report" "HANDOFF includes test report section"
require_text "test-reports/README.md" "Never report Not Run, Skipped, or Blocked checks as Passed." "report policy forbids false pass claims"
require_text "AGENTS.md" "pnpm check" "AGENTS defines a stable aggregate check command"
require_text "AGENTS.md" "Operational logs are diagnostic only" "AGENTS separates operational logs from domain audit"
require_text "AGENTS.md" 'every `README.md` in this repository MUST be written in English' "AGENTS preserves the English documentation rule"

require_balanced_fences "AGENTS.md"
require_balanced_fences "HANDOFF.md"

require_english_prose "AGENTS.md" "AGENTS prose is English"
require_english_prose "HANDOFF.md" "HANDOFF prose is English"

while IFS= read -r readme_path; do
  require_balanced_fences "$readme_path"
  require_english_prose "$readme_path" "$readme_path prose is English"
done < <(cd "$repo_root" && rg --files -g 'README.md' | sort)

printf 'RESULT: %d passed, %d failed\n' "$passes" "$failures"

if (( failures > 0 )); then
  exit 1
fi
