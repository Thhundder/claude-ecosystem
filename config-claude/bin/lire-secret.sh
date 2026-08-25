#!/usr/bin/env bash
# Lit un fichier d'identifiants sans jamais en exposer les valeurs.
# Chaque valeur sensible est remplacee par une empreinte : longueur, debut, fin, condensat court.
# Repond a la seule question legitime : la cle existe-t-elle, et est-ce toujours la meme ?
set -u
f="${1:-}"
motif="${2:-}"
[ -z "$f" ] && { echo "usage: lire-secret.sh <fichier> [motif]"; exit 2; }
[ -r "$f" ] || { echo "illisible : $f"; exit 1; }
python3 - "$f" "$motif" <<'PY'
import sys, json, re, hashlib

SENS = re.compile(r'(token|key|secret|pass|pwd|mdp|mot[-_]?de[-_]?passe|senha|contrase'
                  r'|auth|credential|bearer|api[-_]?key|private|salt|seed|otp|totp|\bpin\b'
                  r'|cert|signing|signature|nonce|cookie|session|dsn|licen[cs]e|webhook'
                  r'|code|hmac|jwt|sig)', re.I)

# Un identifiant court echappe a l'heuristique d'entropie : ce qui le trahit est son
# prefixe d'emetteur. Mesure du 2026-08-25 : DB_PASS, STRIPE_SK et GITHUB_PAT sortaient
# en clair du seul outil cense ne jamais montrer une valeur.
INDICES = re.compile(r'^(sk_|pk_|rk_|ghp_|gho_|ghu_|ghs_|ghr_|github_pat_|xox[abprs]-'
                     r'|AKIA|ASIA|AIza|ya29\.|eyJ|glpat-|dop_v1_|shpat_|sq0csp-|-----BEGIN)')

def empreinte(v):
    s = str(v)
    if not s:
        return "(vide)"
    h = hashlib.sha256(s.encode()).hexdigest()[:8]
    if len(s) <= 8:
        return f"<{len(s)} car · condensat {h}>"
    return f"<{len(s)} car · {s[:3]}…{s[-2:]} · condensat {h}>"

URL_CRED = re.compile(r'([a-zA-Z][a-zA-Z0-9+.\-]*://[^:/\s]*):([^@/\s]+)@')

def masque_url(s):
    return URL_CRED.sub(lambda m: f"{m.group(1)}:{empreinte(m.group(2))}@", str(s))

def sensible(cle, val):
    if SENS.search(str(cle)):
        return True
    s = str(val)
    if INDICES.search(s):
        return True
    return len(s) >= 24 and re.fullmatch(r'[A-Za-z0-9_\-\.\+/=]{24,}', s) is not None

def marche(o, chemin=""):
    if isinstance(o, dict):
        return {k: (empreinte(v) if sensible(k, v) and not isinstance(v, (dict, list))
                    else marche(v, f"{chemin}.{k}")) for k, v in o.items()}
    if isinstance(o, str):
        return masque_url(o)
    if isinstance(o, list):
        return [marche(x, chemin) for x in o]
    return o

path = sys.argv[1]
brut = open(path, encoding='utf-8', errors='replace').read()
try:
    sortie = json.dumps(marche(json.loads(brut)), indent=1, ensure_ascii=False)
    motif = sys.argv[2] if len(sys.argv) > 2 else ""
    if motif == '--json':
        pass                      # fichier entier, valeurs deja caviardees
    elif motif:
        import re as _re
        lignes = sortie.splitlines()
        garde = set()
        for i, l in enumerate(lignes):
            if _re.search(motif, l, _re.I):
                garde.update(range(max(0, i - 1), min(len(lignes), i + 5)))
        sortie = "\n".join(lignes[i] for i in sorted(garde)) or "(aucune correspondance)"
    elif len(sortie) > 6000:
        sortie = sortie[:6000] + "\n… tronqué. Passer un motif en 2e argument, ou --json pour tout."
    print(sortie)
    sys.exit(0)
except json.JSONDecodeError:
    pass

for ligne in brut.splitlines():
    n = ligne.strip()
    if not n or n.startswith('#'):
        print(ligne); continue
    m = re.match(r'^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*[=:]\s*)(.*)$', ligne)
    if m and m.group(2).strip():
        cle = m.group(1)
        val = m.group(2).strip().strip('"\'')
        print(cle + (empreinte(val) if sensible(cle, val) else masque_url(val)))
    else:
        print("<ligne non structurée · " + empreinte(n) + ">")
PY
