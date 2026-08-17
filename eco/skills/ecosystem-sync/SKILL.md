---
name: ecosystem-sync
description: "Use before pushing the claude-ecosystem repo — runs a 3-phase pre-push audit: (1) drift check between ~/.claude/ live config and config-claude/ snapshot + detection of unexpected files in ~/.claude/, (2) smart INDEX.md refresh based on git-status diff, (3) summary of changes for user approval. TRIGGER: 'push this repo', 'push ecosystem', 'sync ecosystem', 'publish changes', '/ecosystem-sync', before git commit/push in the ecosystem repo, after editing ~/.claude/ config or ecosystem artefacts. SKIP: non-ecosystem repos, fresh unchanged state, first-time setup, already-synced state, pure reading/investigation tasks."
origin: ECC
---

# Ecosystem Sync

Pre-push audit and preparation for the `claude-ecosystem` repo. Orchestrates 3 phases; **at each phase, Claude summarises and the user decides** — nothing is pushed or deleted without explicit approval.

## Activation check

Only activate when the current working directory is the `claude-ecosystem` repo (or a subdirectory). Confirm with:

```bash
git rev-parse --show-toplevel
# expect: $HOME/Documents/claude-ecosystem
```

If not in the ecosystem repo → stop and report.

---

## Phase 1 — Drift check: `~/.claude/` vs `config-claude/`

### 1.1 — Diff the 3 mirrored files

For each of the 3 versioned files, compare live vs snapshot:

```bash
for f in CLAUDE.md settings.json .mcp.json; do
  if ! diff -q ~/.claude/$f config-claude/$f > /dev/null 2>&1; then
    echo "--- $f DIFFERS ---"
    diff -u config-claude/$f ~/.claude/$f | head -30
  else
    echo "$f: in sync"
  fi
done
```

For each differing file, report the short diff and ask the user:
- **push** → run `/sync-claude-config push` (live → repo)
- **pull** → run `/sync-claude-config pull` (repo → live, overwrites local)
- **ignore** → leave as-is

### 1.2 — Detect unexpected files in `~/.claude/`

Expected entries in `~/.claude/`:

- **Config files** (versioned): `CLAUDE.md`, `settings.json`, `.mcp.json`
- **Machine-local**: `settings.local.json`, `.credentials.json`, `.mcp.json.bak`, `mcp-needs-auth-cache.json`
- **Symlink dirs**: `agents/`, `commands/`, `skills/`, `rules/` (if it exists)
- **Runtime state**: `projects/`, `sessions/`, `history.jsonl`, `file-history/`, `ide/`, `shell-snapshots/`
- **Ephemeral**: `cache/`, `downloads/`, `paste-cache/`, `telemetry/`, `session-env/`, `backups/`, `tasks/`, `plans/`

Scan for anything outside this list:

```bash
ALLOWED='^(CLAUDE\.md|settings\.json|settings\.local\.json|\.mcp\.json|\.mcp\.json\.bak|\.credentials\.json|mcp-needs-auth-cache\.json|agents|commands|skills|rules|projects|sessions|history\.jsonl|file-history|ide|shell-snapshots|cache|downloads|paste-cache|telemetry|session-env|backups|tasks|plans)$'

ls -A ~/.claude/ | grep -vE "$ALLOWED" || echo "(clean — nothing unexpected)"
```

For each unexpected entry:
- Report the path and its size/type
- Ask: **delete / move to ecosystem / leave alone / investigate**

### 1.3 — Summary of Phase 1

Output:
```
PHASE 1 — Drift check
  CLAUDE.md: in sync
  settings.json: DIFFERS (added "attribution" key)
     → Suggest: /sync-claude-config push

  Unexpected in ~/.claude/:
    foo.bak (2 KB)  → suggest: delete
    (nothing else)
```

Wait for user decision before moving to Phase 2.

---

## Phase 2 — Smart INDEX.md + INDEX-PROJECT.md refresh

### 2.1 — Detect impacted artefact folders

Run `git status --porcelain` and filter for artefact directories. **Note**: changes in `eco/` are intentionally excluded from both indexes, so we filter to `agents/`, `commands/`, `rules/`, `skills/` only.

```bash
git -C ~/Documents/claude-ecosystem status --porcelain | \
  grep -E '^\s*[AMDR?]+\s+(agents|commands|rules|skills)/' || \
  echo "(no artefact changes — indexes are up to date)"
```

### 2.2 — Regenerate both indexes if needed

- If any non-`eco/` artefact directory is touched → run the index builder (produces both):

  ```bash
  cd ~/Documents/claude-ecosystem && python3 scripts/build-index.py
  ```

  This generates:
  - `INDEX.md` — full catalog (agents + commands + rules + skills)
  - `INDEX-PROJECT.md` — filtered view for `tool-project` / `tool-finder` (per-project skills only)

- Then diff both:

  ```bash
  git -C ~/Documents/claude-ecosystem diff INDEX.md INDEX-PROJECT.md | head -120
  ```

- If nothing changed → skip the rebuild and mention that both indexes are up to date.
- **Never** regenerate for changes in `eco/` — those tools are intentionally excluded from INDEX.

### 2.3 — Summary of Phase 2

Output:
```
PHASE 2 — INDEX refresh
  Artefact changes detected:
    M skills/analysis/explore/SKILL.md
    A skills/agents-meta/ecosystem-sync/SKILL.md
    M commands/analysis/rebuild-ecosystem-index.md (new)

  INDEX.md: regenerated (3 entries added/updated)
  Staged for commit.
```

Wait for user approval before Phase 3.

---

## Phase 3 — Pre-push summary

### 3.1 — List pending changes

```bash
git -C ~/Documents/claude-ecosystem status --short
git -C ~/Documents/claude-ecosystem log --oneline '@{u}..HEAD' 2>/dev/null | head -10
```

### 3.2 — Propose a commit message

Classify the changes and propose a concise Conventional-Commits message:

| Changes | Suggested type |
|---|---|
| New skill/agent/command | `feat(skills|agents|commands): …` |
| Modified existing artefact | `refactor(<cat>): …` or `docs(<cat>): …` |
| Only INDEX.md | `docs(index): refresh catalog` |
| Only `config-claude/*` | `chore(config): …` |
| Rules edits | `docs(rules): …` |
| Mixed | `feat(ecosystem): …` |

### 3.3 — Present final summary and wait for user

Display:

```
PRE-PUSH SUMMARY

Drift status:       <from Phase 1>
INDEX refresh:      <from Phase 2>

Pending files:
  M  skills/analysis/explore/SKILL.md
  A  skills/agents-meta/ecosystem-sync/SKILL.md
  M  INDEX.md
  M  config-claude/settings.json

Unpushed commits:   none (or list)

Suggested commit:
  "feat(ecosystem): add ecosystem-sync skill + INDEX refresh"

Next steps — choose:
  1. commit now (I'll stage + run git commit with the suggested message)
  2. edit the commit message (give me your preferred message)
  3. commit AND push (commit then git push — push will prompt for your approval)
  4. stop (do nothing, leave as-is)
```

Never auto-commit. Never auto-push. The user's explicit approval is required at each transition.

---

## Rules the skill follows

- **Never** run `git push` without the user saying "commit and push" or similar explicit go-ahead.
- **Never** delete anything in `~/.claude/` based on the unexpected-files check — only propose.
- **Never** overwrite `config-claude/*` or `~/.claude/*` without calling the `/sync-claude-config` command explicitly.
- **Always** show the user a compact summary before each phase transition.
- **Always** respect the attribution config (no `Co-Authored-By: Claude` trailer — already disabled in settings.json).

---

## Related tools

- `/rebuild-ecosystem-index` — full INDEX.md rebuild (used in Phase 2)
- `/sync-claude-config push|pull` — mirror `~/.claude/` ↔ `config-claude/` (used in Phase 1 decisions)
- `tool-project` skill (to come) — per-project tool installation using INDEX.md
- `tool-finder` skill (to come) — feature-level tool lookup using INDEX.md
