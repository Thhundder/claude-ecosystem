#!/usr/bin/env python3
"""Compteur d'usage des tools Claude Code, lu depuis ~/.claude/projects/**/*.jsonl.

Chaque appel est classe par couche : main (thread principal), subagent (Agent tool),
workflow (agent lance par le Workflow tool).

Usage:
  tool-stats.py                 rapport texte
  tool-stats.py --json out.json dump complet
  tool-stats.py --since 2026-08 filtre par prefixe de timestamp ISO
"""
import json, os, sys, re, collections

ROOT = os.path.expanduser("~/.claude/projects")
SLASH_RE = re.compile(r"<command-name>([^<]+)</command-name>")
CD_RE = re.compile(r"^\s*(cd\s+[^\s;&|]+\s*(&&|;)\s*)+")
ENV_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=\S+\s+")


def bash_verb(cmd):
    """Verbe reel : les prefixes cd/env/sudo masquent l'outil reellement appele."""
    cmd = CD_RE.sub("", cmd.strip())
    cmd = re.sub(r"^(sudo|time|nohup)\s+", "", cmd)
    cmd = ENV_RE.sub("", cmd)
    v = re.split(r"[\s|;&(<>\n]", cmd, 1)[0]
    return os.path.basename(v).strip("\"'")[:22] or "?"


def layer_of(rel):
    parts = rel.split(os.sep)
    if len(parts) == 2:
        return "main"
    return "workflow" if "workflows" in parts else "subagent"


def scan(since=""):
    tool_total = collections.Counter()
    by_layer = collections.defaultdict(collections.Counter)
    by_month = collections.defaultdict(collections.Counter)
    by_project = collections.defaultdict(collections.Counter)
    layer_calls = collections.Counter()
    skills = collections.Counter()
    subagents = collections.Counter()
    slash = collections.Counter()
    models = collections.Counter()
    bash_verbs = collections.Counter()
    tool_err = collections.Counter()
    files = collections.Counter()
    err_ids, id2tool = set(), {}
    sessions, workflows = set(), set()
    first_ts, last_ts, lines_seen = "9999", "0000", 0

    for dirpath, _dirs, fnames in os.walk(ROOT):
        for fn in fnames:
            if not fn.endswith(".jsonl"):
                continue
            path = os.path.join(dirpath, fn)
            rel = os.path.relpath(path, ROOT)
            parts = rel.split(os.sep)
            project, layer = parts[0], layer_of(rel)
            if fn == "journal.jsonl":
                workflows.add(rel)
                files["journal"] += 1
                continue
            files[layer] += 1
            if layer == "main":
                sessions.add(parts[-1][:-6])
            with open(path, "r", errors="replace") as fh:
                for line in fh:
                    lines_seen += 1
                    if not ('"tool_use"' in line or '"is_error":true' in line
                            or "<command-name>" in line):
                        continue
                    try:
                        rec = json.loads(line)
                    except Exception:
                        continue
                    ts = rec.get("timestamp") or ""
                    if since and not ts.startswith(since) and ts < since:
                        continue
                    if ts:
                        first_ts = min(first_ts, ts)
                        last_ts = max(last_ts, ts)
                    msg = rec.get("message") or {}
                    if not isinstance(msg, dict):
                        continue
                    if msg.get("model"):
                        models[msg["model"]] += 1
                    content = msg.get("content")
                    if isinstance(content, str):
                        for m in SLASH_RE.finditer(content):
                            slash[m.group(1).strip()] += 1
                        continue
                    if not isinstance(content, list):
                        continue
                    for blk in content:
                        if not isinstance(blk, dict):
                            continue
                        t = blk.get("type")
                        if t == "tool_use":
                            name = blk.get("name") or "?"
                            inp = blk.get("input") if isinstance(blk.get("input"), dict) else {}
                            tool_total[name] += 1
                            by_layer[layer][name] += 1
                            layer_calls[layer] += 1
                            by_month[ts[:7]][name] += 1
                            by_project[project][name] += 1
                            id2tool[blk.get("id")] = name
                            if name == "Skill":
                                skills[str(inp.get("skill"))] += 1
                            if name in ("Task", "Agent"):
                                subagents[str(inp.get("subagent_type") or "general-purpose")] += 1
                            if name == "Bash":
                                bash_verbs[bash_verb(inp.get("command") or "")] += 1
                        elif t == "tool_result" and blk.get("is_error"):
                            err_ids.add(blk.get("tool_use_id"))
                        elif t == "text" and isinstance(blk.get("text"), str) \
                                and "<command-name>" in blk["text"]:
                            for m in SLASH_RE.finditer(blk["text"]):
                                slash[m.group(1).strip()] += 1

    for i in err_ids:
        n = id2tool.get(i)
        if n:
            tool_err[n] += 1

    return {
        "meta": {"lines": lines_seen, "files": dict(files), "sessions": len(sessions),
                 "workflows": len(workflows), "projects": len(by_project),
                 "first": first_ts, "last": last_ts,
                 "total_calls": sum(tool_total.values()),
                 "calls_by_layer": dict(layer_calls)},
        "tools": tool_total.most_common(),
        "by_layer": {k: v.most_common(25) for k, v in by_layer.items()},
        "errors": tool_err.most_common(20),
        "skills": skills.most_common(),
        "subagents": subagents.most_common(),
        "slash": slash.most_common(40),
        "models": models.most_common(),
        "bash_verbs": bash_verbs.most_common(35),
        "by_month": {k: dict(v.most_common(12)) for k, v in sorted(by_month.items())},
        "by_project": {k: {"total": sum(v.values()), "top": dict(v.most_common(8))}
                       for k, v in sorted(by_project.items(), key=lambda x: -sum(x[1].values()))},
    }


def report(o):
    m = o["meta"]
    tot = m["total_calls"] or 1
    L = [f"Fenetre {m['first'][:10]} -> {m['last'][:10]}  |  {m['sessions']} sessions  |  "
         f"{m['workflows']} workflows  |  {tot} appels de tools",
         "Couches : " + "  ".join(f"{k} {v} ({100*v/tot:.0f}%)"
                                  for k, v in m["calls_by_layer"].items())]

    def block(title, rows, denom=None, n=15):
        L.append("")
        L.append(f"--- {title}")
        d = denom or sum(c for _, c in rows) or 1
        for name, c in rows[:n]:
            L.append(f"  {c:>7}  {100*c/d:>5.1f}%  {name}")

    block("Tools (tous)", o["tools"], tot, 20)
    for layer in ("main", "subagent", "workflow"):
        if layer in o["by_layer"]:
            block(f"Tools - {layer}", o["by_layer"][layer], m["calls_by_layer"][layer], 10)
    block("Verbes Bash", o["bash_verbs"], None, 20)
    block("Erreurs (tool_result is_error)", o["errors"], None, 10)
    block("subagent_type", o["subagents"], None, 15)
    block("Skills", o["skills"], None, 15)
    block("Slash commands", o["slash"], None, 15)
    block("Modeles", o["models"], None, 6)
    return "\n".join(L)


if __name__ == "__main__":
    args = sys.argv[1:]
    since = args[args.index("--since") + 1] if "--since" in args else ""
    result = scan(since)
    if "--json" in args:
        i = args.index("--json")
        dest = args[i + 1] if len(args) > i + 1 else "/dev/stdout"
        json.dump(result, open(dest, "w"), indent=1, ensure_ascii=False)
        if dest != "/dev/stdout":
            print(f"JSON -> {dest}")
    else:
        print(report(result))
