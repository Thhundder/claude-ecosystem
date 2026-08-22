# Par quoi commence une session Claude Code

Reconstruction de l'ordre d'assemblage du contexte de démarrage, mesurée le 2026-08-22
sur une session réelle (`cwd = ~/Documents/Xeko/pms-ia`, modèle Opus 5, mode auto).

Mesures reproductibles :
`scripts/tool-stats.py` (usage des tools natifs) et
`scripts/custom-tools-stats.py` (usage de tes artefacts).

---

## 1 · Ordre d'assemblage

Le contexte n'arrive pas en un bloc. Il arrive en **deux vagues** : le prompt système
proprement dit, puis une salve de `<system-reminder>` accrochée au premier tour utilisateur.

### Vague 1 — prompt système (avant ton premier message)

| # | Bloc | Origine | Sous ton contrôle |
|---|---|---|---|
| 1 | Schémas des 13 tools chargés d'emblée | harness | non |
| 2 | Identité, garde-fous sécurité offensive | harness | non |
| 3 | Section *Harness* : rendu terminal, modes de permission, hooks, parallélisme | harness | non |
| 4 | Pronoms neutres, confirmation avant action irréversible, rapport fidèle | harness | non |
| 5 | *Session-specific guidance* : préfixe `!`, invocation des skills, ultrareview | harness | non |
| 6 | Section *Memory* : chemin `projects/<projet>/memory/`, format des fiches | harness + ton dossier | partiel |
| 7 | *Environment* : cwd, dépôt git, branche, OS, shell, modèle | harness + ton contexte | partiel |
| 8 | *Scratchpad directory* | harness | non |
| 9 | *Context management*, *Delivering work*, *Corrections* | harness | non |
| 10 | **2 directives d'origine non tracée** (voir §3.1) | ? | à déterminer |
| 11 | Note `EndConversation` | harness | non |
| 12 | Guidance *Claude in Chrome* | serveur MCP claude-in-chrome | oui (désinstallable) |

### Vague 2 — `<system-reminder>` sur le premier tour

| # | Bloc | Fichier source | ~tokens |
|---|---|---|---|
| 13 | `~/.claude/CLAUDE.md` | user | **543** |
| 14 | 6 rules `@`-importées | `rules/**` | **3 211** |
| 15 | `~/CLAUDE.md` (doctrine Bun) | héritage par cwd | **631** |
| 16 | `pms-ia/CLAUDE.md` → `AGENTS.md` | projet | **2 177** |
| 17 | `MEMORY.md` + mémoires rappelées | mémoire projet | 40 |
| 18 | `userEmail`, `currentDate` | harness | ~30 |
| 19 | Liste des ~45 tools différés | harness | ~250 |
| 20 | Types d'agents disponibles (14 tiens + 8 natifs) | `~/.claude/agents/*` | **787** (tes 14) |
| 21 | *MCP Server Instructions* | serveurs MCP | ~600 |
| 22 | Listing des skills (18 tiennes + natives + plugin) | `~/.claude/skills/*` | **2 969** (tes 18) |
| 23 | Listing des slash commands (13 tiennes) | `~/.claude/commands/*` | **460** |
| 24 | `gitStatus` | harness | ~150 |
| 25 | Bloc *auto mode* : « privilégier Bash aux tools dédiés » | `settings.defaultMode: auto` | oui |

**Total sous ton contrôle direct : ≈ 10 800 tokens par session**, dont
7 433 tokens d'artefacts ecosystem (`custom-tools-stats.py`).

---

## 2 · Réglages effectifs

| Réglage | Valeur | Fichier |
|---|---|---|
| modèle | `opus` | `settings.json` |
| effort | `high` | `settings.json` |
| mode de permission | `auto` | `settings.json` |
| prompt de permission auto | désactivé | `skipAutoPermissionPrompt: true` |
| hooks | 2 × `PreToolUse` sur `Bash` | `settings.json` + `hooks/git-branch-guard.sh` |
| MCP | context7 (HTTP) | `~/.claude.json` |
| plugin | frontend-design | `enabledPlugins` |
| miroir de config | **synchro** avec `config-claude/` | — |

Le bloc `autoMode.allow` accorde en plus l'accès commande complet à
`xeko-backend-prod` et `xeko-crawler-prod` sans prompt.

---

## 3 · Incohérences relevées

### 3.1 Deux directives contredisent la doctrine, et on ne sait pas d'où elles viennent

Le prompt système de la session porte :

> Do not call the AgentTool unless the user requested it
> Do not use workflows or deep-research unless the user requested it

Introuvables dans `settings.json`, `settings.local.json`, `~/.claude.json`, `CLAUDE.md`,
les rules, les hooks, l'environnement shell ou les transcripts. Hypothèse la plus
probable : directive de session persistée (`/btw`, 17 usages).

C'est frontalement opposé à `rules/workflow/agent-orchestration.md` (« Delegate to
specialized agents … invoke automatically ») — et ça explique très probablement le
chiffre suivant : **95 % des délégations partent en `general-purpose`**, et 11 des 14
agents écrits n'ont jamais été appelés.

Tant que ces deux lignes ne sont pas localisées, la doctrine d'orchestration est
inapplicable.

### 3.2 La doctrine décrit un workflow qui n'est pas celui pratiqué

| Règle écrite | Réalité mesurée |
|---|---|
| « Delegate to specialized agents » | 95 % `general-purpose`, 5 appels nommés sur 241 |
| « Use Context7 before coding against any library » | 12 appels MCP en 6 semaines sur 105 748 |
| « Write tests before implementation » | `tdd-workflow` et `tdd-guide` : 0 usage |
| « Use the planner agent for ≥3 fichiers » | `planner` : 1 appel ; `/plan` : 0 |
| Aucune mention du tool `Workflow` | **72 % des appels de tools** (167 workflows) |

### 3.3 Un quart du coût de démarrage sert des artefacts morts

Sur 7 433 tokens d'artefacts chargés à chaque session, **1 847 tokens (25 %)**
décrivent des artefacts à zéro usage depuis le 2 mars.

- **Agents** : 11 morts sur 14 (architect, bug-validator, code-reviewer,
  conversation-analyzer, cpp-reviewer, harness-optimizer, performance-optimizer,
  refactor-cleaner, silent-failure-hunter, tdd-guide, typescript-reviewer)
- **Skills globales** : 8 mortes sur 18 (agent-creator, code-review-standards,
  fix-errors, prompt-optimizer, tdd-workflow, verification-loop, workflow-debug)
- **Commands** : 8 mortes sur 13
- **Skills par projet** : les 11 installées dans `xeko-backend` et `xeko-app` (telnyx-*,
  python-*, rag, docker, eval-harness, design-system…) sont **toutes à zéro usage**
- **20 skills écrites ne sont installées nulle part** (deep-research, santa-method,
  skill-creator, playwright-qa, api-design, benchmark…)

Bilan : **50 skills écrites, 12 utilisées au moins une fois.**

### 3.4 Le mode auto neutralise les tools dédiés

Le bloc auto mode demande de passer par Bash. Résultat : `Grep` = 7 appels,
`grep`+`rg` en Bash = 17 669. Idem `sed` (10 576) contre `Edit` (5 442).
Ce n'est pas un défaut en soi — mais toute règle qui suppose l'usage de Grep/Glob/Edit
est morte d'avance.

### 3.5 Config morte et dérive

- `~/.claude/.mcp.json` : `.mcp.json` est un fichier *de projet*. Placé dans
  `~/.claude/`, il n'est très probablement jamais lu. Il déclare context7 en stdio
  `bunx` alors que l'actif est le HTTP de `~/.claude.json` → doublon fantôme.
- `permissions.allow` contient `Read`, `Edit`, `Write` **nus** : les 10 entrées
  suivantes (`Edit(.claude/**)`, `Write(~//Documents/**/.claude/**)`…) sont mortes,
  dont des variantes à double slash qui ne matchent probablement rien.
- `settings.local.json` **au niveau user** a accumulé 44 autorisations one-shot de
  projets terminés (`pkill -9 -f uvicorn`, `rm -f logs/app.log*`, `Read(//tmp/**)`,
  `Bash(ssh ubuntu@*:*)`, chemins `/tmp/claude-ecosystem-work3/` disparus).
- `skillUsage` porte 12 entrées orphelines pointant des skills supprimées.
- `checkpoint.md` et `harness-audit.md` n'ont pas de `description` en frontmatter :
  ils ne peuvent pas se déclencher par intention, seulement par frappe explicite.
- Reliquats : `CLAUDE.md.bak-2026-04-27-0901` (vide), `settings.json.bak-…`.

### 3.6 Sécurité

- **Clé API Context7 en clair** dans `~/.claude.json` (`mcpServers.context7.headers`).
  À basculer sur variable d'environnement, et à faire tourner.
- `Bash(ssh:*)`, `Bash(scp:*)`, `Bash(curl:*)` sans restriction d'hôte, en mode auto.
  `ssh` est le verbe Bash n°1 (12 983 appels, 17 %). C'est le plus grand rayon d'action
  de la configuration.

### 3.7 Coût des hooks

Les deux hooks `PreToolUse` matchent `Bash` : **2 spawns de process par appel Bash**,
soit ~150 000 spawns sur la fenêtre de 6 semaines. Le premier lance un shell + `jq`
pour tester une regex qui tiendrait en première ligne du second. Les fusionner en un
seul script divise ce coût par deux.

---

## 4 · Signaux d'usage disponibles, et leurs limites

| Source | Couvre | Fenêtre |
|---|---|---|
| `~/.claude.json` → `skillUsage` | skills + slash commands | lifetime, depuis 2026-03-02 |
| `~/.claude/history.jsonl` | commandes tapées par l'utilisateur | 2026-03-16 → aujourd'hui |
| `~/.claude/projects/**/*.jsonl` | tous les appels de tools, `subagent_type` | **rétention ~6 semaines** |

Point important : **les agents n'ont aucun compteur natif.** Leur usage n'est lisible
que dans les transcripts, donc soumis à la rétention. Les transcripts de subagents
n'enregistrent pas leur propre type — seul l'appel parent le porte.
