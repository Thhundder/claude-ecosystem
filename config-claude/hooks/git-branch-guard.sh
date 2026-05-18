#!/usr/bin/env bash
# PreToolUse hook for Bash.
# - Allows `git commit` / `git push` automatically on feature branches.
# - Forces an "ask" prompt when on a protected branch (main/master/prod/production/dev/develop).
# Silent (no output) for any other command -> default permission rules apply.

set -u

input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)"
[ -z "$cmd" ] && exit 0

# Only react to git commit / git push (anywhere in the command line).
if ! printf '%s' "$cmd" | grep -qE '(^|[^a-zA-Z0-9_])git[[:space:]]+(commit|push)([^a-zA-Z0-9_-]|$)'; then
  exit 0
fi

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
# Not a git repo (or detached) -> let the default permission rules handle it.
[ -z "$branch" ] && exit 0

protected_re='^(main|master|prod|production|dev|develop)$'

if printf '%s' "$branch" | grep -qE "$protected_re"; then
  jq -nc \
    --arg b "$branch" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:("Protected branch (" + $b + ") — confirm git commit/push.")}}'
else
  jq -nc \
    --arg b "$branch" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"allow",permissionDecisionReason:("Feature branch (" + $b + ") — auto-allow git commit/push.")}}'
fi
