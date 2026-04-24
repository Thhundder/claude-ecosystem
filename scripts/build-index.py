#!/usr/bin/env python3
"""Build ecosystem INDEX.md from agents/, commands/, rules/, skills/ frontmatters.

Usage:
  python3 scripts/build-index.py              # full rebuild
  python3 scripts/build-index.py --incremental <path1> <path2>...
                                              # only re-scan given paths, patch INDEX.md
"""

import sys
import yaml
import pathlib
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
GLOBAL_SKILLS_DIR = pathlib.Path.home() / ".claude" / "skills"


def parse_frontmatter(path: pathlib.Path):
    try:
        txt = path.read_text()
    except Exception:
        return None, ""
    if not txt.startswith("---"):
        return None, txt
    end = txt.find("---", 3)
    if end == -1:
        return None, txt
    try:
        fm = yaml.safe_load(txt[3:end]) or {}
    except Exception:
        fm = {}
    body = txt[end + 3:].lstrip("\n")
    return fm, body


def short(text: str, limit: int = 250) -> str:
    if not text:
        return ""
    text = " ".join(text.split())
    return text[:limit] + ("…" if len(text) > limit else "")


def first_heading(body: str) -> str:
    for line in body.splitlines():
        line = line.strip()
        if line.startswith("# "):
            return line[2:].strip()
    return ""


def first_paragraph(body: str, skip_headings: bool = True) -> str:
    paragraphs = []
    cur = []
    for line in body.splitlines():
        if not line.strip():
            if cur:
                paragraphs.append("\n".join(cur))
                cur = []
        else:
            cur.append(line)
    if cur:
        paragraphs.append("\n".join(cur))
    for p in paragraphs:
        if skip_headings and p.lstrip().startswith("#"):
            continue
        return p
    return ""


def global_skill_names() -> set:
    names = set()
    if GLOBAL_SKILLS_DIR.exists():
        for entry in GLOBAL_SKILLS_DIR.iterdir():
            names.add(entry.name)
    return names


def split_trigger_skip(description: str):
    """Extract TRIGGER and SKIP sections from a skill description if present."""
    trig, skip, core = "", "", description
    if "TRIGGER:" in description:
        before, after = description.split("TRIGGER:", 1)
        core = before.strip().rstrip(".").strip().rstrip('"')
        if "SKIP:" in after:
            trig_part, skip_part = after.split("SKIP:", 1)
            trig = trig_part.strip().rstrip(".").rstrip('"').strip()
            skip = skip_part.strip().rstrip(".").rstrip('"').strip()
        else:
            trig = after.strip().rstrip(".").rstrip('"').strip()
    return core, trig, skip


def render_agent(path: pathlib.Path) -> list:
    fm, _body = parse_frontmatter(path)
    if not fm:
        return []
    name = fm.get("name", path.stem)
    cat = path.parent.name
    rel = path.relative_to(ROOT)
    model = fm.get("model", "?")
    tools = fm.get("tools", "")
    if isinstance(tools, list):
        tools = ", ".join(tools)
    return [
        f"### `{name}` · {cat}",
        f"Path: `{rel}` · Model: {model} · Tools: {tools}",
        f"Desc: {short(fm.get('description', ''))}",
        "",
    ]


def render_command(path: pathlib.Path) -> list:
    fm, body = parse_frontmatter(path)
    desc = ""
    arg = ""
    if fm:
        desc = fm.get("description", "")
        arg = fm.get("argument-hint", "")
    name = f"/{path.stem}"
    cat = path.parent.name
    rel = path.relative_to(ROOT)
    header = f"### `{name}` · {cat}"
    path_line = f"Path: `{rel}`" + (f" · Args: `{arg}`" if arg else "")
    desc_line = desc or first_heading(body) or first_paragraph(body, skip_headings=True)
    return [header, path_line, f"Desc: {short(desc_line)}", ""]


def render_rule(path: pathlib.Path) -> list:
    _fm, body = parse_frontmatter(path)
    name = path.stem
    cat = path.parent.name
    rel = path.relative_to(ROOT)
    title = first_heading(body) or name
    summary = first_paragraph(body, skip_headings=True)
    return [
        f"### `{cat}/{name}`",
        f"Path: `{rel}` · Title: {title}",
        f"Summary: {short(summary, 300)}",
        "",
    ]


def render_skill(path: pathlib.Path, globals_set: set) -> list:
    fm, _body = parse_frontmatter(path)
    if not fm:
        return []
    folder_name = path.parent.name
    name = fm.get("name", folder_name)
    cat = path.parent.parent.name
    rel = path.relative_to(ROOT)
    scope = "global" if folder_name in globals_set else "per-project"
    origin = fm.get("origin", "")
    core, trig, skip = split_trigger_skip(fm.get("description", ""))
    header = f"### `{name}` · {cat} · {scope}" + (f" · origin: {origin}" if origin else "")
    lines = [header, f"Path: `{rel}`"]
    if trig:
        lines.append(f"TRIGGER: {short(trig, 250)}")
    if skip:
        lines.append(f"SKIP: {short(skip, 180)}")
    core_clean = core.replace("Use when", "").strip()
    if core_clean:
        lines.append(f"Desc: {short(core_clean, 300)}")
    lines.append("")
    return lines


def build_full(globals_set: set) -> str:
    """Full catalog: everything under agents/, commands/, rules/, skills/ (eco/ excluded)."""
    out = []
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    out.append("# Ecosystem Catalog")
    out.append("")
    out.append(f"Auto-generated by `/rebuild-ecosystem-index` — last rebuild {now}.")
    out.append("")
    out.append("**Do not edit by hand.** Run `/rebuild-ecosystem-index` after adding, removing, or modifying artefacts in `agents/`, `commands/`, `rules/`, `skills/`.")
    out.append("")
    out.append("Tools in `eco/` (managing this ecosystem repo itself) are intentionally excluded — see `eco/README.md` for the meta-tools.")
    out.append("")

    agents = sorted((ROOT / "agents").rglob("*.md"))
    out.append(f"\n## Agents ({len(agents)})\n")
    for p in agents:
        out.extend(render_agent(p))

    commands = sorted((ROOT / "commands").rglob("*.md"))
    out.append(f"\n## Commands ({len(commands)})\n")
    for p in commands:
        out.extend(render_command(p))

    rules = sorted((ROOT / "rules").rglob("*.md"))
    out.append(f"\n## Rules ({len(rules)})\n")
    for p in rules:
        out.extend(render_rule(p))

    skills = sorted((ROOT / "skills").rglob("SKILL.md"))
    n_global = sum(1 for s in skills if s.parent.name in globals_set)
    n_proj = len(skills) - n_global
    out.append(f"\n## Skills ({len(skills)} — {n_global} global, {n_proj} per-project)\n")
    for p in skills:
        out.extend(render_skill(p, globals_set))

    return "\n".join(out).rstrip() + "\n"


def build_project(globals_set: set) -> str:
    """Per-project subset: only skills NOT in global, plus all agents/commands/rules.

    Consumed by `tool-project` and `tool-finder` when deciding what to install into a repo.
    Universals are already active via ~/.claude/ symlinks, so they're not listed here.
    """
    out = []
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    out.append("# Ecosystem Catalog — Per-Project Subset")
    out.append("")
    out.append(f"Auto-generated by `/rebuild-ecosystem-index` — last rebuild {now}.")
    out.append("")
    out.append("Filtered view: only **per-project skills** (those NOT globally symlinked in `~/.claude/skills/`). Agents, commands, and rules are all universal — they are active via the global symlinks and are listed here for reference only.")
    out.append("")
    out.append("Consumed by the `tool-project` and `tool-finder` skills to decide what to install per-repo.")
    out.append("")

    skills = sorted((ROOT / "skills").rglob("SKILL.md"))
    project_skills = [p for p in skills if p.parent.name not in globals_set]
    out.append(f"\n## Per-Project Skills ({len(project_skills)})\n")
    for p in project_skills:
        out.extend(render_skill(p, globals_set))

    # Universals — short reference list, no full descriptions
    out.append(f"\n## Reference: Global (already active, do not install per-project)\n")
    global_skills = [p for p in skills if p.parent.name in globals_set]
    out.append("Skills already symlinked in `~/.claude/skills/`:")
    out.append("")
    for p in global_skills:
        fm, _ = parse_frontmatter(p)
        name = (fm or {}).get("name", p.parent.name)
        out.append(f"- `{name}`")
    out.append("")

    # Agents + commands + rules — all universal in this ecosystem
    agents = sorted((ROOT / "agents").rglob("*.md"))
    commands = sorted((ROOT / "commands").rglob("*.md"))
    rules = sorted((ROOT / "rules").rglob("*.md"))
    out.append(f"\nAgents already active globally ({len(agents)}):")
    for p in agents:
        fm, _ = parse_frontmatter(p)
        name = (fm or {}).get("name", p.stem)
        out.append(f"- `{name}` ({p.parent.name})")
    out.append("")
    out.append(f"\nCommands already active globally ({len(commands)}):")
    for p in commands:
        out.append(f"- `/{p.stem}`")
    out.append("")
    out.append(f"\nRules applied globally ({len(rules)}):")
    for p in rules:
        out.append(f"- `{p.parent.name}/{p.stem}`")
    out.append("")

    return "\n".join(out).rstrip() + "\n"


def main():
    args = sys.argv[1:]
    if "--incremental" in args:
        print("Incremental mode not yet implemented — doing full rebuild", file=sys.stderr)

    globals_set = global_skill_names()

    # Full catalog
    full_text = build_full(globals_set)
    full_path = ROOT / "INDEX.md"
    full_path.write_text(full_text)

    # Per-project subset
    project_text = build_project(globals_set)
    project_path = ROOT / "INDEX-PROJECT.md"
    project_path.write_text(project_text)

    n_agents = len(list((ROOT / "agents").rglob("*.md")))
    n_cmds = len(list((ROOT / "commands").rglob("*.md")))
    n_rules = len(list((ROOT / "rules").rglob("*.md")))
    n_skills = len(list((ROOT / "skills").rglob("SKILL.md")))
    n_proj_skills = sum(1 for p in (ROOT / "skills").rglob("SKILL.md") if p.parent.name not in globals_set)

    print(f"INDEX.md rebuilt at {full_path}")
    print(f"  agents: {n_agents} · commands: {n_cmds} · rules: {n_rules} · skills: {n_skills}")
    print(f"INDEX-PROJECT.md rebuilt at {project_path}")
    print(f"  per-project skills: {n_proj_skills}")


if __name__ == "__main__":
    main()
