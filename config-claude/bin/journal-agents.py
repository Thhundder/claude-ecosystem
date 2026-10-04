#!/usr/bin/env python3
"""Journal horodaté des agents d'une session, généré depuis leurs transcriptions.

Pour chaque agent : début, fin, durée, réponses, jetons relus, coût équivalent API, part du
temps passée à attendre le modèle contre le temps passé dans les outils.

Usage : journal-agents.py <id de session ou préfixe> [--detail]
"""
import datetime
import glob
import json
import os
import sys

PRIX = {
    "claude-opus-5-5": (4, 5, 8, 0.20, 20),
    "claude-fable-5-1": (10, 12.5, 20, 0.25, 50),
}


def horo(ts):
    return datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))


def dollars(u, modele):
    p = PRIX.get(modele)
    if not p:
        return 0.0
    cc = u.get("cache_creation") or {}
    h1 = cc.get("ephemeral_1h_input_tokens", u.get("cache_creation_input_tokens", 0)) or 0
    m5 = cc.get("ephemeral_5m_input_tokens", 0) or 0
    return ((u.get("input_tokens") or 0) * p[0] + m5 * p[1] + h1 * p[2]
            + (u.get("cache_read_input_tokens") or 0) * p[3] + (u.get("output_tokens") or 0) * p[4]) / 1e6


def lire(chemin):
    reps, outils, lignes, attente = {}, [], [], 0.0
    prec = None
    for brut in open(chemin, encoding="utf-8", errors="replace"):
        try:
            r = json.loads(brut)
        except ValueError:
            continue
        ts = r.get("timestamp")
        if not ts:
            continue
        lignes.append(ts)
        if r.get("type") == "assistant":
            m = r.get("message") or {}
            mid = m.get("id") or r.get("uuid")
            u = dict(m.get("usage") or {})
            if mid in reps:
                reps[mid]["u"]["output_tokens"] = max(reps[mid]["u"].get("output_tokens") or 0, u.get("output_tokens") or 0)
                reps[mid]["fin"] = ts
            else:
                reps[mid] = dict(debut=ts, fin=ts, u=u, modele=m.get("model"))
                if prec and prec[1] != "assistant":
                    attente += max(0.0, (horo(ts) - horo(prec[0])).total_seconds())
            for b in m.get("content") or []:
                if isinstance(b, dict) and b.get("type") == "tool_use":
                    e = b.get("input") or {}
                    outils.append((ts, b.get("name"), str(e.get("description") or e.get("command") or e.get("file_path") or "")[:70]))
        prec = (ts, r.get("type"))
    return reps, outils, lignes, attente


def resume(chemin):
    reps, outils, lignes, modele_s = lire(chemin)
    if not lignes:
        return None
    debut, fin = horo(min(lignes)), horo(max(lignes))
    duree = (fin - debut).total_seconds()
    relus = sum((r["u"].get("cache_read_input_tokens") or 0) + (r["u"].get("cache_creation_input_tokens") or 0)
                + (r["u"].get("input_tokens") or 0) for r in reps.values())
    meta = chemin[:-6] + ".meta.json"
    desc = ""
    if os.path.exists(meta):
        try:
            desc = json.load(open(meta)).get("description", "")
        except ValueError:
            pass
    return dict(desc=desc or os.path.basename(chemin)[:-6], debut=debut, fin=fin, duree=duree, reponses=len(reps),
                relus=relus, cout=sum(dollars(r["u"], r["modele"]) for r in reps.values()),
                part_modele=modele_s / duree if duree else 0, outils=outils)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    sid = sys.argv[1]
    dossiers = glob.glob(os.path.expanduser(f"~/.claude/projects/*/{sid}*/subagents"))
    if not dossiers:
        sys.exit(f"aucun agent pour la session {sid}")
    chemins = sorted(glob.glob(os.path.join(dossiers[0], "**", "*.jsonl"), recursive=True))
    total = 0.0
    print("| agent | début | durée | réponses | jetons relus | coût $ | temps à attendre le modèle |")
    print("|---|---|---|---|---|---|---|")
    for c in chemins:
        r = resume(c)
        if not r:
            continue
        total += r["cout"]
        print(f"| {r['desc'][:45]} | {r['debut'].astimezone().strftime('%d/%m %H:%M')} | {r['duree'] / 60:.1f} min | "
              f"{r['reponses']} | {r['relus'] / 1e6:.1f} M | {r['cout']:.2f} | {100 * r['part_modele']:.0f} % |")
        if "--detail" in sys.argv:
            for ts, nom, quoi in r["outils"]:
                print(f"|   {horo(ts).astimezone().strftime('%H:%M:%S')} {nom} {quoi} | | | | | | |")
    print(f"\n{len(chemins)} agents, {total:.2f} $ en équivalent API.")


if __name__ == "__main__":
    main()
