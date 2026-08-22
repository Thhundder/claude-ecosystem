#!/usr/bin/env bash
# Retire l'enveloppe d'execution d'un artefact telecharge : la page redevient
# un fichier HTML autonome, lisible hors ligne et sans compte.
set -u
python3 - "$1" "$2" <<'PY'
import re, sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8', errors='replace').read()
s = re.sub(r'<!-- frame-runtime -->.*?<!-- /frame-runtime -->', '', s, flags=re.S)
t = re.search(r'<title>(.*?)</title>', s, re.S)
titre = t.group(1).strip() if t else 'sans titre'
if '<title>' in s and '<head>' in s and s.index('<title>') > s.index('</head>'):
    s = s.replace('</head>', f'<title>{titre}</title></head>', 1)   # titre remonte dans l'en-tete
open(dst, 'w', encoding='utf-8').write(s)
print(f"{titre}\t{len(s)}")
PY
