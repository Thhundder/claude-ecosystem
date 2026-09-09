#!/usr/bin/env python3
"""Compteur d'usage des artefacts Claude ecrits a la main (claude-ecosystem).

Croise trois sources d'usage, chacune avec une fenetre differente :
  - ~/.claude.json  skillUsage   -> slash commands, LIFETIME (depuis firstStartTime)
  - ~/.claude/history.jsonl      -> slash commands reellement tapees, lifetime
  - ~/.claude/projects/**/*.jsonl -> subagent_type des appels Agent, fenetre = retention transcripts

Usage: custom-tools-stats.py [--json out.json]
"""
import json, os, re, sys, glob, collections, datetime

ECO = os.path.expanduser("~/Documents/claude-ecosystem")
CLAUDE = os.path.expanduser("~/.claude")
CONFIG = os.path.expanduser("~/.claude.json")
PROJECTS = os.path.join(CLAUDE, "projects")
FM_DESC = re.compile(r"^description:\s*(.*?)(?=\n[a-z_-]+:\s|\n---)", re.S | re.M)


def desc_of(path):
    try:
        head = open(path, errors="replace").read(8000)
    except OSError:
        return ""
    m = FM_DESC.search(head)
    return " ".join(m.group(1).split()) if m else ""


def inventory():
    """Tout ce qui est ecrit dans le repo ecosystem, quelle que soit son installation."""
    items = {}
    for kind, pattern in (
        ("agent",   f"{ECO}/agents/*.md"),
        ("command", f"{ECO}/commands/*.md"),
    ):
        for path in glob.glob(pattern):
            name = os.path.basename(path)[:-3]
            rel = os.path.relpath(path, ECO)
            d = desc_of(path)
            items[(kind, name)] = {
                "kind": kind, "name": name, "path": rel,
                "body_chars": os.path.getsize(path), "desc_chars": len(d),
                "boot_chars": len(d),
                "installed_global": False,
            }
    return items


def installation(items):
    for kind, sub in (("agent", "agents"), ("command", "commands")):
        for p in glob.glob(os.path.join(CLAUDE, sub, "*")):
            name = os.path.basename(p)
            if name.endswith(".md"):
                name = name[:-3]
            if (kind, name) in items:
                items[(kind, name)]["installed_global"] = True


def usage_native():
    """skillUsage : compteur natif, couvre les slash commands, lifetime."""
    try:
        d = json.load(open(CONFIG))
    except OSError:
        return {}, None, 0
    su = d.get("skillUsage", {}) or {}
    out = {k: {"count": v.get("usageCount", 0),
               "last": datetime.datetime.fromtimestamp(v["lastUsedAt"] / 1000).date().isoformat()
                       if v.get("lastUsedAt") else None}
           for k, v in su.items()}
    fs = d.get("firstStartTime")
    if isinstance(fs, (int, float)):
        since = datetime.datetime.fromtimestamp(fs / 1000).date().isoformat()
    else:
        since = str(fs)[:10] if fs else None
    return out, since, d.get("numStartups", 0)


def usage_history():
    """Slash commands reellement tapees par l'utilisateur."""
    c = collections.Counter()
    path = os.path.join(CLAUDE, "history.jsonl")
    if not os.path.exists(path):
        return c, None, None
    lo, hi = None, None
    for line in open(path, errors="replace"):
        try:
            r = json.loads(line)
        except Exception:
            continue
        ts = r.get("timestamp")
        if isinstance(ts, (int, float)):
            lo = ts if lo is None else min(lo, ts)
            hi = ts if hi is None else max(hi, ts)
        disp = r.get("display") or ""
        if isinstance(disp, str) and disp.startswith("/"):
            c[disp.split()[0].lstrip("/")] += 1
    f = lambda t: datetime.datetime.fromtimestamp(t / 1000).date().isoformat() if t else None
    return c, f(lo), f(hi)


def usage_agents():
    """subagent_type des appels Agent. Fenetre = retention des transcripts."""
    agents = collections.Counter()
    lo, hi = "9999", "0000"
    for dirpath, _d, fnames in os.walk(PROJECTS):
        for fn in fnames:
            if not fn.endswith(".jsonl") or fn == "journal.jsonl":
                continue
            for line in open(os.path.join(dirpath, fn), errors="replace"):
                if '"tool_use"' not in line:
                    continue
                try:
                    rec = json.loads(line)
                except Exception:
                    continue
                ts = rec.get("timestamp") or ""
                if ts:
                    lo, hi = min(lo, ts), max(hi, ts)
                content = (rec.get("message") or {}).get("content")
                if not isinstance(content, list):
                    continue
                for b in content:
                    if not isinstance(b, dict) or b.get("type") != "tool_use":
                        continue
                    inp = b.get("input") if isinstance(b.get("input"), dict) else {}
                    if b.get("name") in ("Task", "Agent"):
                        agents[str(inp.get("subagent_type") or "general-purpose")] += 1
    return agents, lo[:10], hi[:10]


def verdict(it):
    if not it["installed_global"]:
        return "NON INSTALLE"
    n = it["uses"]
    if n == 0:
        return "MORT"
    if n <= 2:
        return "DORMANT"
    return "VIVANT"


def main():
    items = inventory()
    installation(items)
    native, since_native, startups = usage_native()
    hist, hist_lo, hist_hi = usage_history()
    agents, tr_lo, tr_hi = usage_agents()

    for (kind, name), it in items.items():
        if kind == "agent":
            it["uses"] = agents.get(name, 0)
            it["last"] = None
            it["source"] = f"transcripts {tr_lo}->{tr_hi}"
        else:
            n = native.get(name, {})
            it["uses"] = max(n.get("count", 0), hist.get(name, 0))
            it["last"] = n.get("last")
            it["source"] = f"skillUsage depuis {since_native}"
        it["verdict"] = verdict(it)

    rows = sorted(items.values(), key=lambda x: (x["kind"], -x["uses"], x["name"]))

    print(f"Sources : skillUsage lifetime depuis {since_native} ({startups} demarrages) | "
          f"history.jsonl {hist_lo}->{hist_hi} | transcripts {tr_lo}->{tr_hi}")
    for kind, label in (("agent", "AGENTS"), ("command", "COMMANDS")):
        sel = [r for r in rows if r["kind"] == kind]
        print(f"\n=== {label} ({len(sel)} ecrits) ===")
        print(f"{'usages':>7}  {'dernier':<11} {'install':<10} {'boot tok':>8}  nom")
        for r in sel:
            inst = "global" if r["installed_global"] else "-"
            print(f"{r['uses']:>7}  {r['last'] or '-':<11} {inst:<10} {r['boot_chars']//4:>8}  "
                  f"{r['name']:<32} {r['verdict']}")

    boot = sum(r["boot_chars"] for r in rows if r["installed_global"])
    waste = sum(r["boot_chars"] for r in rows if r["installed_global"] and r["uses"] == 0)
    print(f"\nCout de demarrage des artefacts installes globalement : "
          f"{boot} car ~{boot//4} tok")
    if boot:
        print(f"  dont artefacts a 0 usage : {waste} car ~{waste//4} tok "
              f"({100*waste/boot:.0f}%)")

    if "--json" in sys.argv:
        i = sys.argv.index("--json")
        dest = sys.argv[i+1] if len(sys.argv) > i+1 else "/dev/stdout"
        json.dump({"rows": rows, "sources": {"skillUsage_since": since_native,
                   "startups": startups, "history": [hist_lo, hist_hi],
                   "transcripts": [tr_lo, tr_hi]}}, open(dest, "w"), indent=1, ensure_ascii=False)
        if dest != "/dev/stdout":
            print(f"JSON -> {dest}")


if __name__ == "__main__":
    main()
