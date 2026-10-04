#!/usr/bin/env python3
"""Garde des identifiants, appelée par guard.sh : la commande (variable CMD_BRUT)
affichera-t-elle la valeur d'un fichier d'identifiants ?

Sortie 1 et l'étape en cause sur stdout si oui ; sortie 0 sinon.

Une lecture ne fuit que si ce qu'elle lit atteint l'écran. Elle n'y arrive pas quand
l'étape elle-même ne rend qu'un compte, un nom ou une empreinte (grep -c/-q/-l,
grep -o '^CLE=', wc, sha256sum, jq keys), quand une étape plus loin dans le même
tube masque les valeurs (cut -d= -f1, awk -F= '{print $1}', sed 's/=.*/…/' — fichiers
CLE=valeur seulement), ou quand la sortie part dans un fichier. Charger les valeurs
dans un programme (source, --env-file, $(…) non masqué) reste refusé : ce programme
peut les afficher. Le refus portait sur le seul nom du fichier jusqu'au 04/10 :
447 refus en un mois, la plupart sur des lectures déjà masquées.
"""
import os
import re
import sys

CRED = re.compile(
    r"(?:^|[/(,{\s=:])("
    r"(?:\.env(?:\.[A-Za-z0-9_-]+)?|\.claude\.json|\.credentials\.json|\.hub-notify\.json|\.netrc|\.npmrc|\.pgpass|id_rsa|id_ecdsa|id_ed25519)"
    r"|(?:[A-Za-z0-9_.-]*(?:[Cc]redential|[Ss]ecret|[Tt]oken|[Aa]pi[-_]?[Kk]ey)[A-Za-z0-9_.-]*\.[A-Za-z0-9]{1,6})"
    r"|(?:[A-Za-z0-9_.~/-]*/[A-Za-z0-9_.-]*(?:[Cc]redential|[Ss]ecret)[A-Za-z0-9_.-]*)"
    r"|(?:[A-Za-z0-9_./-]+\.(?:pem|p12|pfx|key|jks|keystore))"
    r")(?=[\s,;`)}]|$)")
GABARIT = re.compile(r"[A-Za-z0-9_./~-]*\.(?:example|exemple|sample|template|dist)(?=[^A-Za-z0-9]|$)")
SOURCE = re.compile(r"[A-Za-z0-9_./~-]*\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|php|c|h|cpp|css|scss|html|md|sql|sh|vue|svelte)(?=[^A-Za-z0-9]|$)")
FORME_EGAL = re.compile(r"(?:^|/)\.env|\.env$|\.npmrc$|\.(?:ini|properties|conf|cfg)$")

NEUTRES = {'ls', 'stat', 'test', '[', '[[', 'rm', 'mv', 'cp', 'chmod', 'chown', 'touch', 'mkdir', 'find',
           'wc', 'du', 'file', 'basename', 'dirname', 'readlink', 'realpath', 'ln', 'echo', 'printf',
           'export', 'lire-secret.sh', 'remplacer.py', 'md5sum', 'sha1sum', 'sha256sum', 'sha512sum',
           'b2sum', 'cksum', 'cmp', 'rsync', 'scp', 'true', 'false', 'cd', 'pushd', 'unset', 'umask', 'sleep', 'for',
           'case', 'local', 'declare', 'read', 'set'}
COMPTEURS = {'wc', 'md5sum', 'sha1sum', 'sha256sum', 'sha512sum', 'b2sum', 'cksum', 'cmp'}
GIT_NEUTRES = {'add', 'rm', 'mv', 'check-ignore', 'status', 'ls-files', 'commit'}
LECTEURS = {'cat', 'head', 'tail', 'less', 'more', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'sed', 'awk',
            'gawk', 'mawk', 'cut', 'sort', 'uniq', 'strings', 'xxd', 'od', 'hexdump', 'base64', 'diff',
            'tr', 'nl', 'tac', 'rev', 'column', 'bat', 'jq', 'yq', 'tee', 'paste', 'fold', 'iconv', 'dd',
            'source', '.', 'envsubst', 'comm', 'join', 'vim', 'vi', 'nano', 'view'}
INTERPRETES = {'python', 'python3', 'node', 'bun', 'deno', 'perl', 'ruby', 'php', 'bash', 'sh', 'zsh', 'dash'}
COQUILLES = {'bash', 'sh', 'zsh', 'dash'}
MOTS_CLES = {'if', 'then', 'do', 'else', 'elif', 'while', 'until', '!', '{', '}', 'fi', 'done', 'esac', 'time', 'function'}
ENVELOPPES = {'sudo', 'timeout', 'nice', 'nohup', 'env', 'command', 'exec', 'stdbuf', 'ionice', 'xargs', 'watch', 'flock'}
SANS_SORTIE = re.compile(r"^/dev/(std(out|err)|tty|fd/\d+)$|^/proc/self/fd/")
SSH_ARG = set('bcDEeFIiJLlmOopQRSWw')


class Etape:
    def __init__(self):
        self.mots, self.entrees, self.sorties, self.heredocs = [], [], [], []


def fin_parenthese(s, i):
    """Index de la parenthèse qui ferme celle ouverte juste avant s[i]."""
    prof, n = 1, len(s)
    while i < n:
        c = s[i]
        if c == '\\':
            i += 2; continue
        if c == "'":
            j = s.find("'", i + 1); i = n if j < 0 else j + 1; continue
        if c == '"':
            i += 1
            while i < n and s[i] != '"':
                i += 2 if s[i] == '\\' else 1
            i += 1; continue
        if c == '(':
            prof += 1
        elif c == ')':
            prof -= 1
            if prof == 0:
                return i
        i += 1
    return n


def lexer(s, subs):
    """Découpe en tubes (listes d'étapes). Les substitutions $(…), `…`, <(…) vont dans subs."""
    tubes, tube, et = [], [], Etape()
    mot, prose, commence, redir, attente = [], False, False, None, []
    i, n = 0, len(s)

    def fin_mot():
        nonlocal mot, prose, commence, redir
        if commence:
            v = ''.join(mot)
            if redir is None:
                et.mots.append((v, prose))
            elif redir.startswith('<<') and redir != '<<<':
                attente.append((v.strip('\'"'), redir == '<<-', et))
            elif redir.startswith('<'):
                et.entrees.append(v)
            else:
                et.sorties.append((redir, v))
            redir = None
        mot, prose, commence = [], False, False

    def fin_etape():
        nonlocal et
        fin_mot()
        tube.append(et); et = Etape()

    def fin_tube():
        nonlocal tube
        fin_etape()
        tubes.append(tube); tube = []

    while i < n:
        c = s[i]
        if c == '\\':
            if i + 1 < n and s[i + 1] == '\n':
                i += 2; continue
            mot.append(s[i + 1:i + 2]); commence = True; i += 2; continue
        if c == "'":
            j = s.find("'", i + 1); j = n if j < 0 else j
            q = s[i + 1:j]; mot.append(q); commence = True
            prose = prose or bool(re.search(r'\s', q)); i = j + 1; continue
        if c == '"':
            i += 1; q = []
            while i < n and s[i] != '"':
                if s[i] == '\\' and i + 1 < n:
                    q.append(s[i + 1]); i += 2; continue
                if s.startswith('$(', i) and not s.startswith('$((', i):
                    f = fin_parenthese(s, i + 2); subs.append(s[i + 2:f]); q.append(f'§{len(subs) - 1}§'); i = f + 1; continue
                if s[i] == '`':
                    f = s.find('`', i + 1); f = n if f < 0 else f; subs.append(s[i + 1:f]); q.append(f'§{len(subs) - 1}§'); i = f + 1; continue
                q.append(s[i]); i += 1
            q = ''.join(q); mot.append(q); commence = True
            prose = prose or bool(re.search(r'\s', q)); i += 1; continue
        if s.startswith('$((', i):
            f = s.find('))', i); i = n if f < 0 else f + 2; mot.append('0'); commence = True; continue
        if s.startswith('$(', i) or (s[i:i + 2] in ('<(', '>(') and not commence):
            f = fin_parenthese(s, i + 2); subs.append(s[i + 2:f]); mot.append(f'§{len(subs) - 1}§'); commence = True; i = f + 1; continue
        if c == '`':
            f = s.find('`', i + 1); f = n if f < 0 else f; subs.append(s[i + 1:f]); mot.append(f'§{len(subs) - 1}§'); commence = True; i = f + 1; continue
        if c == '#' and not commence and (i == 0 or s[i - 1] in ' \t\n;&|('):
            j = s.find('\n', i); i = n if j < 0 else j; continue
        if c in ' \t':
            fin_mot(); i += 1; continue
        if c == '\n':
            fin_tube(); i += 1
            for delim, tabs, cible in attente:
                corps = []
                while i < n:
                    j = s.find('\n', i); j = n if j < 0 else j
                    ligne = s[i:j]; i = j + 1
                    if (ligne.lstrip('\t') if tabs else ligne) == delim:
                        break
                    corps.append(ligne)
                cible.heredocs.append('\n'.join(corps))
            attente.clear(); continue
        if c == '|':
            if s.startswith('||', i):
                fin_tube(); i += 2; continue
            fin_etape(); i += 2 if s.startswith('|&', i) else 1; continue
        if c == '&':
            if s.startswith('&&', i):
                fin_tube(); i += 2; continue
            if s.startswith('&>', i):
                fin_mot(); redir = '>'; i += 3 if s.startswith('&>>', i) else 2; continue
            fin_tube(); i += 1; continue
        if c == ';':
            fin_tube(); i += 2 if s.startswith(';;', i) else 1; continue
        if c in '()':
            fin_tube(); i += 1; continue
        if c in '<>':
            fd = None
            if commence and ''.join(mot).isdigit():
                fd = ''.join(mot); mot, commence = [], False
            else:
                fin_mot()
            for op in ('<<<', '<<-', '<<', '>>', '>&', '<&', '<>', '>|', '<', '>'):
                if s.startswith(op, i):
                    break
            i += len(op)
            if op in ('>&', '<&'):
                m = re.match(r'\s*(\d+|-)', s[i:])
                if m:
                    i += m.end(); continue
                op = '>'
            redir = op if fd in (None, '1') or op.startswith('<') else 'fd' + op
            continue
        mot.append(c); commence = True; i += 1
    fin_tube()
    return tubes


def creds(texte):
    t = SOURCE.sub('SOURCE', GABARIT.sub('GABARIT', texte))
    return [m.group(1) for m in CRED.finditer(t)]


def mentions(texte, vars_):
    """Fichiers d'identifiants nommés dans un texte, en clair ou par une variable."""
    noms = creds(texte.replace('"', ' ').replace("'", ' '))
    subs = vars_.get('§', [])
    for k in re.findall(r'§(\d+)§', texte):
        if int(k) < len(subs) and re.match(r'\s*(ls|find|echo|printf|readlink|realpath|basename|dirname)\b', subs[int(k)]):
            noms += mentions(subs[int(k)], vars_)
    for v in re.findall(r'\$\{?([A-Za-z_][A-Za-z0-9_]*)', texte):
        noms += vars_.get(v, [])
    return noms


LECTURE_CODE = re.compile(r'open\(|Path\(|read_text|read_bytes|readFileSync|readFile\(|createReadStream|dotenv|Bun\.file|'
                          r'subprocess|os\.system|popen|execSync|spawn|File\.read|IO\.read|file_get_contents|`')


def mentions_code(code, vars_):
    """Dans un programme, un nom de fichier ne compte que s'il est une chaîne littérale
    sans espace, et un chemin ou un programme qui sait lire un fichier : une phrase qui
    cite le fichier, ou un attribut de code recopié, ne lit rien."""
    lit_api = bool(LECTURE_CODE.search(code))
    noms = []
    for _, lit in re.findall(r"""(['"])([^'"\s]+)\1""", code):
        if lit_api or re.match(r'[./~]|.*/', lit):
            noms += mentions(lit, vars_)
    return noms


def forme_egal(noms):
    return bool(noms) and all(FORME_EGAL.search(os.path.basename(n.rstrip('/')) or n) for n in noms)


def options(mots, avec_arg=''):
    """Sépare options et opérandes ; les options listées dans avec_arg prennent un argument."""
    opts, ops, i = [], [], 0
    while i < len(mots):
        m = mots[i]
        if m == '--':
            ops += mots[i + 1:]; break
        if m.startswith('-') and len(m) > 1:
            opts.append(m)
            if len(m) == 2 and m[1] in avec_arg and i + 1 < len(mots):
                opts.append(mots[i + 1]); i += 1
        else:
            ops.append(m)
        i += 1
    return opts, ops


def sauter_options(mots, avec_arg=''):
    """Options en tête seulement : ce qui suit la première opérande appartient à la
    commande enveloppée."""
    i = 0
    while i < len(mots) and mots[i].startswith('-') and len(mots[i]) > 1:
        if mots[i] == '--':
            return mots[i + 1:]
        if len(mots[i]) == 2 and mots[i][1] in avec_arg:
            i += 1
        i += 1
    return mots[i:]


def drapeau(opts, courts, longs=()):
    for o in opts:
        if o.startswith('--'):
            if o.split('=')[0] in longs:
                return True
        elif o.startswith('-') and any(c in o[1:] for c in courts):
            return True
    return False


def motif_cle(p):
    """Un motif de grep -o qui ne peut rendre qu'un nom de clé : ancré, sans joker,
    et rien après le signe égal."""
    p = p.strip()
    branches, prof, debut = [], 0, 0
    for k, c in enumerate(p):
        prof += (c == '(') - (c == ')')
        if c == '|' and prof == 0:
            branches.append(p[debut:k]); debut = k + 1
    branches.append(p[debut:])
    if not all(b.startswith('^') for b in branches):
        return False
    if re.search(r'\.|\\[SsWw]|\[\^', p):
        return False
    corps = p[:-1] if p.endswith('=') else p
    return '=' not in corps


def sed_masque(script):
    for cmd in [c.strip() for c in re.split(r';|\n', script) if c.strip()]:
        if re.fullmatch(r'/[^/]*/d', cmd):
            continue
        m = re.fullmatch(r's(.)(.*?)\1(.*?)\1([gpI0-9]*)', cmd)
        if not m:
            return False
        motif, rempl = m.group(2), m.group(3)
        m2 = re.fullmatch(r'(.*)=(?:\\?\))?(\\?\()?\.\*(?:\\?\))?\$?', motif)
        if not m2:
            return False
        avant = re.sub(r'\\?[()]|\^', '', m2.group(1))
        if avant not in ('', '[^=]*', '[^=]+') or '&' in rempl:
            return False
        if m2.group(2) and re.search(r'\\[0-9]', rempl):
            return False
    return True


def awk_masque(opts, programme):
    """awk -F= qui n'imprime que $1, et seulement dans des actions explicites."""
    sep = None
    for k, o in enumerate(opts):
        if o == '-F':
            sep = opts[k + 1] if k + 1 < len(opts) else ''
        elif o.startswith('-F'):
            sep = o[2:]
    if sep != '=' or not re.fullmatch(r'(\s*[^{}]*\{[^{}]*\}\s*;?)+\s*', programme):
        return False
    if re.search(r'print\s*([;}]|$)|getline|system|NF|\$(?!1(?![0-9]))', programme):
        return False
    return '$1' in programme


def cut_masque(opts):
    d = f = None
    for k, o in enumerate(opts):
        if o.startswith('-d'):
            d = o[2:] or (opts[k + 1] if k + 1 < len(opts) else '')
        if o.startswith('-f'):
            f = o[2:] or (opts[k + 1] if k + 1 < len(opts) else '')
        if o.startswith('--delimiter='):
            d = o.split('=', 1)[1]
        if o.startswith('--fields='):
            f = o.split('=', 1)[1]
    return d == '=' and f == '1'


def jq_masque(filtre):
    f = re.sub(r'\s+', '', filtre)
    return bool(re.fullmatch(r'(\.[A-Za-z0-9_."\[\]]*(//\{\})?\|)?(keys|keys_unsorted|length|type|has\("[^"]*"\))(\[\])?(\|(length|sort|\.\[\]|join\("[^"]*"\)))*', f))


class Analyse:
    def __init__(self):
        self.vars = {}
        self.fuites = []

    def commande(self, s, prof=0):
        if prof > 6:
            return
        subs = []
        tubes = lexer(s, subs)
        self.vars['§'] = subs
        for tube in tubes:
            self.tube(tube, prof)
        for sub in subs:
            self.commande(sub, prof + 1)

    def tube(self, tube, prof):
        bilans = [self.etape(e, prof, tube[:k]) for k, e in enumerate(tube)]
        if os.environ.get('GARDE_DEBUG'):
            for e, b in zip(tube, bilans):
                tout = ' '.join(m for m, _ in e.mots) + ' ' + ' '.join(e.entrees) + ' ' + ' '.join(h for h in e.heredocs)
                if mentions(tout, self.vars) or b[0]:
                    print(f'  [{b[1]:<6}] {",".join(b[0])[:40]:<40} | {b[2][:150]}', file=sys.stderr)
        for k, (noms, nature, texte) in enumerate(bilans):
            if nature == 'fuite':
                bilans[k] = (['sortie détournée'], 'lit', texte)
                if any(b[0] and b[1] == 'lit' for b in bilans[:k]):
                    self.fuites.append(texte)
                continue
            if nature == 'charge':
                self.fuites.append(texte)
                continue
            if not noms or nature in ('neutre', 'compte', 'cache'):
                continue
            if nature == 'masque' and forme_egal(noms):
                continue
            aval = bilans[k + 1:]
            if any(b[1] in ('compte', 'cache') for b in aval):
                continue
            if forme_egal(noms) and any(b[1] == 'masque' for b in aval):
                continue
            self.fuites.append(texte)

    def etape(self, et, prof, amont):
        """Renvoie (fichiers lus, nature, texte) ; nature : neutre, compte, masque, cache,
        charge (valeurs chargées dans un programme, qu'aucune redirection ne couvre), lit."""
        mots = [m for m, _ in et.mots]
        prose = [p for _, p in et.mots]
        texte = ' '.join(mots)[:160]
        while mots and mots[0] in MOTS_CLES:
            mots, prose = mots[1:], prose[1:]
        environnement = []
        while mots and re.match(r'^[A-Za-z_][A-Za-z0-9_]*=', mots[0]):
            nom, val = mots[0].split('=', 1)
            self.vars[nom] = mentions(val, self.vars)
            self.vars['$' + nom] = [val]
            environnement += self.vars[nom]
            mots, prose = mots[1:], prose[1:]
        cache = any(op in ('>', '>>', '>|') and not SANS_SORTIE.search(cible) for op, cible in et.sorties)
        lus = []
        for e in et.entrees:
            lus += mentions(e, self.vars)
        if any('lire-secret.sh' in re.sub(r'\$\{?(\w+)\}?', lambda m: ''.join(self.vars.get('$' + m.group(1), [])), e) for e in et.entrees):
            return [], 'neutre', texte
        if not mots:
            return lus, 'cache' if cache else 'lit', texte
        entrees = lus

        if mots[0] == 'for' and len(mots) > 2:
            liste = mots[3:] if len(mots) > 3 and mots[2] == 'in' else []
            self.vars[mots[1]] = sum((mentions(m, self.vars) for m in liste), [])
            return [], 'neutre', texte

        while mots:
            p = os.path.basename(mots[0])
            if p in ENVELOPPES:
                if p == 'xargs':
                    reste = sauter_options(mots[1:], 'aEeIiLlnPsd')
                    lus_amont = any(mentions(' '.join(m for m, _ in a.mots), self.vars) for a in amont)
                    if lus_amont and reste and os.path.basename(reste[0]) not in NEUTRES:
                        return ['xargs'], 'lit', texte
                    mots = reste; prose = [False] * len(reste); continue
                reste = sauter_options(mots[1:], 'uCgkspnoeiw')
                if p == 'timeout' and reste and re.fullmatch(r'[0-9.]+[smhd]?', reste[0]):
                    reste = reste[1:]
                while p == 'env' and reste and '=' in reste[0]:
                    reste = reste[1:]
                mots = reste; prose = [False] * len(reste); continue
            if p == 'docker' and len(mots) > 2 and mots[1] == 'exec':
                reste = sauter_options(mots[2:], 'euw')
                mots = reste[1:]; prose = [False] * len(mots); continue
            break
        if not mots:
            return lus, 'cache' if cache else 'lit', texte
        p = os.path.basename(mots[0])
        args, prose = mots[1:], prose[1:]

        charges = [] if p in NEUTRES or p in COMPTEURS else list(environnement)
        if p in ('source', '.'):
            charges += sum((mentions(a, self.vars) for a in args), [])
        for k, a in enumerate(args):
            if a.startswith('--env-file'):
                charges += mentions(a.split('=', 1)[1] if '=' in a else ' '.join(args[k + 1:k + 2]), self.vars)
        if charges:
            return charges, 'charge', texte

        if p == 'ssh':
            _, reste = self.ssh(args)
            fuites = self.sous(' '.join(reste), prof) if reste else []
            for h in et.heredocs:
                fuites += self.code(h, reste[0] if reste else 'bash', prof)
            return self.bilan_sous(fuites, cache, texte)
        if p in COQUILLES and '-c' in args:
            k = args.index('-c')
            fuites = self.sous(args[k + 1], prof) if k + 1 < len(args) else []
            return self.bilan_sous(fuites, cache, texte)
        if p == 'eval':
            return self.bilan_sous(self.sous(' '.join(args), prof), cache, texte)

        if p in INTERPRETES and args and os.path.basename(args[0]) in ('remplacer.py', 'lire-secret.sh'):
            return [], 'neutre', texte
        if p in INTERPRETES:
            noms = list(entrees)
            for h in et.heredocs:
                if p in COQUILLES:
                    self.commande(h, prof + 1)
                else:
                    noms += mentions_code(h, self.vars)
            for k, (a, pr) in enumerate(zip(args, prose)):
                if k > 0 and args[k - 1] in ('-c', '-e', '-E', '-r', '-pe', '-ne', 'eval', '--eval', '-p', '--print'):
                    noms += mentions_code(a, self.vars)
                elif not pr:
                    noms += mentions(a, self.vars)
            return noms, 'cache' if cache else 'lit', texte

        if p in COMPTEURS:
            return entrees, 'compte', texte
        if p in NEUTRES:
            if p == 'find':
                return self.find(args, texte)
            return [], 'neutre', texte
        if p == 'git':
            sous = [a for a in sauter_options(args, 'Cc') if not a.startswith('-')]
            if sous and sous[0] in GIT_NEUTRES:
                return [], 'neutre', texte
            if sous and sous[0] == 'log' and not drapeau(args, 'pu', ('--patch',)):
                return [], 'neutre', texte

        if p in ('grep', 'egrep', 'fgrep', 'rg'):
            opts, ops = options(args, 'efmABCd')
            if not any(o in ('-e', '-f') or o.startswith('--regexp') for o in opts) and ops:
                motifs, ops = [ops[0]], ops[1:]
            else:
                motifs = [opts[k + 1] for k, o in enumerate(opts) if o == '-e' and k + 1 < len(opts)] or ['']
            fichiers = ops + ([opts[opts.index('-f') + 1]] if '-f' in opts else [])
            noms = entrees + sum((mentions(a, self.vars) for a in fichiers), [])
            if drapeau(opts, 'cqlL', ('--count', '--quiet', '--silent', '--files-with-matches', '--files-without-match')):
                return noms, 'compte', texte
            if drapeau(opts, 'o', ('--only-matching',)) and all(motif_cle(m) for m in motifs) and forme_egal(noms):
                return noms, 'compte', texte
            return noms, 'cache' if cache else 'lit', texte
        if p == 'sed':
            opts, ops = options(args, 'ef')
            scripts = [opts[k + 1] for k, o in enumerate(opts) if o == '-e' and k + 1 < len(opts)]
            if not scripts and ops:
                scripts, ops = [ops[0]], ops[1:]
            noms = entrees + sum((mentions(a, self.vars) for a in ops), [])
            if drapeau(opts, 'i', ('--in-place',)):
                return noms, 'compte', texte
            if scripts and all(sed_masque(sc) for sc in scripts):
                return noms, 'cache' if cache else 'masque', texte
            return noms, 'cache' if cache else 'lit', texte
        if p in ('awk', 'gawk', 'mawk'):
            opts, ops = options(args, 'Fvf')
            programme, ops = (ops[0], ops[1:]) if ops else ('', [])
            noms = entrees + sum((mentions(a, self.vars) for a in ops), [])
            if awk_masque(opts, programme):
                return noms, 'cache' if cache else 'masque', texte
            return noms, 'cache' if cache else 'lit', texte
        if p == 'cut':
            opts, ops = options(args, 'dfcb')
            noms = entrees + sum((mentions(a, self.vars) for a in ops), [])
            return noms, 'cache' if cache else ('masque' if cut_masque(opts) else 'lit'), texte
        if p == 'jq':
            ops, lus_jq, k = [], [], 0
            while k < len(args):
                if args[k] in ('--arg', '--argjson'):
                    k += 3; continue
                if args[k] in ('--rawfile', '--slurpfile'):
                    lus_jq += args[k + 2:k + 3]; k += 3; continue
                if args[k] == '-f':
                    k += 2; continue
                if not args[k].startswith('-') or args[k] == '-':
                    ops.append(args[k])
                k += 1
            if '-f' in args:
                filtre = ''
            else:
                filtre, ops = (ops[0], ops[1:]) if ops else ('', [])
            noms = entrees + sum((mentions(a, self.vars) for a in ops + lus_jq), [])
            if lus_jq and mentions(' '.join(lus_jq), self.vars):
                return noms, 'cache' if cache else 'lit', texte
            return noms, 'cache' if cache else ('compte' if jq_masque(filtre) else 'lit'), texte
        if p == 'diff' and drapeau(args, 'q', ('--brief',)):
            return [], 'neutre', texte
        if p == 'tee' and any(SANS_SORTIE.search(a) for a in args):
            return [], 'fuite', texte

        if p in LECTEURS:
            noms = entrees + sum((mentions(a, self.vars) for a in args), [])
        else:
            noms = entrees + sum((mentions(a, self.vars) for a, pr in zip(args, prose) if not pr), [])
        return noms, 'cache' if cache else 'lit', texte

    def sous(self, s, prof):
        """Commande imbriquée (ssh, bash -c, eval) : sa sortie est celle de l'étape,
        un masquage ou une redirection en aval la couvre aussi."""
        a = Analyse()
        a.vars = dict(self.vars)
        a.commande(re.sub(r'§\d+§', '§', s), prof + 1)
        return a.fuites

    @staticmethod
    def bilan_sous(fuites, cache, texte):
        if not fuites:
            return [], 'neutre', texte
        return ['imbriqué'], 'cache' if cache else 'lit', fuites[0]

    def ssh(self, args):
        i = 0
        while i < len(args) and args[i].startswith('-'):
            if len(args[i]) == 2 and args[i][1] in SSH_ARG:
                i += 1
            i += 1
        return args[i:i + 1], args[i + 1:]

    def code(self, corps, interprete, prof):
        p = os.path.basename(interprete)
        if p in COQUILLES:
            return self.sous(corps, prof)
        if mentions_code(corps, self.vars):
            return [f"{p} <<… (code qui nomme un fichier d'identifiants)"]
        return []

    def find(self, args, texte):
        for drap in ('-exec', '-execdir', '-ok', '-okdir'):
            if drap in args:
                k = args.index(drap)
                cmd = args[k + 1:]
                if cmd and os.path.basename(cmd[0]) not in NEUTRES:
                    if re.search(r'env|secret|credential|token|key|pem|netrc|npmrc|pgpass|id_(rsa|ec|ed)', ' '.join(args[:k]), re.I):
                        return ['find -exec'], 'lit', texte
        return [], 'neutre', texte


def main():
    cmd = os.environ.get('CMD_BRUT', '')
    a = Analyse()
    try:
        a.commande(cmd)
    except Exception as e:
        print(f'analyse impossible ({type(e).__name__})')
        return 1
    if a.fuites:
        print(a.fuites[0])
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
