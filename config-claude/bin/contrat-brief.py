#!/usr/bin/env python3
"""Contrôle du contrat de brief avant le lancement d'un workflow.

Mesuré sur 2125 briefs d'agents réels : le périmètre (89 %), le format de sortie
(92 %) et l'ancrage anti-invention (93 %) sont déjà tenus. Trois dimensions
manquent presque toujours, et ce sont celles des échecs documentés :

  critère de succès    25 %  — une cause présentée comme confirmée sans épreuve
  condition d'arrêt    41 %  — un agent qui ne sait pas quand renoncer
  ce qui a été tenté   21 %  — la conclusion annoncée avant la fin de l'inventaire

Le contrôle ne porte que sur ces trois-là. Justification : les défauts relevés
dans l'audit du 22 août, pas une corrélation statistique — l'hypothèse liant les
briefs pauvres aux agents orphelins a été mesurée et RÉFUTÉE.
"""
import re, sys, json, os, unicodedata

MANQUANTES = {
 # Un critere de succes n'a pas la meme forme selon le travail. Sur du code il est
 # binaire ; sur une cartographie exhaustive il porte sur la COUVERTURE, pas sur la
 # completude, qui n'est pas connaissable. Les deux formes sont acceptees.
 "critère de succès":
   r"(critère|succès|réussi|attendu|doit (rendre|contenir|produire|sortir)|pass/fail|binaire|est valide si"
   r"|on considère que|chaque [a-zéèà]+ (apparaît|figure|est (traité|classé|couvert))"
   r"|tous? les [a-zéèà]+ (sont|est) (traité|couvert|class)|aucun [a-zéèà]+ sans|une (entrée|ligne) par"
   r"|sans exception|exhausti|n'omets|l'intégralité|rien ne doit (manquer|être omis))",
 # Sur une tache exhaustive, la condition d'arret porte sur l'epuisement du perimetre
 # ou sur le renoncement local, pas sur un plafond de tentatives.
 "condition d'arrêt":
   r"(arrête|stop\b|si tu ne trouves|si rien|au-delà de|maximum|plafond|ne dépasse|renonce|abandonne"
   r"|au bout de|tu (t'arrêtes|termines) quand|passes? au suivant|jusqu'à épuisement"
   r"|quand tous les .{0,30} sont traités)",
 "ce qui a été tenté":
   r"(déjà (tenté|essayé|fait|traité|couvert)|précédemment|session précédente|avant toi|historique|acquis"
   r"|ce qui tient|(ronde|passe|vague|lot) précédent|ne (les? )?refais pas|pars de (leur|sa|la) sortie"
   r"|a déjà couvert|reprends (à partir|depuis))",
}
MIN_BRIEF = 200


def pla(t):
    """Sans accents. Les prompts d'agents du chantier sont ecrits en ASCII par convention
    (« REGLES ABSOLUES », « tu t'arretes quand ») : des motifs accentues n'y trouvent rien,
    et le controle declarait manquante une dimension presente. Mesure du 2026-08-22 sur
    `p1-etude.js` : « CONDITION D'ARRET » etait rendue absente.
    """
    return ''.join(c for c in unicodedata.normalize('NFD', t) if not unicodedata.combining(c))

# Une etape de verification doit porter la lentille de completude : c'est la seule
# qui puisse trouver ce qu'aucune autre ne regarde. Mesure sur 81 scripts reels :
# 59 verifient, 11 seulement cherchent ce qui manque.
# La verification se reconnait a sa FONCTION, pas au mot : « si tu ne peux pas
# verifier, dis-le » est une consigne d'ancrage presente dans 93 % des briefs.
VERIF = re.compile(pla(
    r"((vérifie|réfute|audite|contrôle|éprouve|juge|conteste|challenge|invalide)\s+"
    r"(ce|cet|cette|ces|le|la|les|l'|si|leur|chaque|toute?s?)\b"
    r"|audit (adverse|contradictoire|du lot)|lentille|verdict|revue critique"
    r"|(confirme|infirme) (ce|le|la|les|chaque))"), re.I)
COMPLETUDE = re.compile(pla(r"(ce qui manque|qu'est-ce qui manque|non (examiné|regardé|couvert|vérifié|lu|instruit)"
                        r"|angle (mort|manquant)|oubli|passé sous silence|n'a pas été (regardé|vu|traité|lancé)"
                        r"|lacune|ce qu'aucun|point aveugle|sans lentille|quelle (modalité|source|affirmation))"), re.I)

def _appels_agent(script):
    """Le contenu de chaque appel `agent(...)`, parentheses equilibrees.

    Une extraction par chaine litterale isolee juge des FRAGMENTS : un mandat construit
    par concatenation (`SOCLE(sp) + role + format`) est decoupe, et chaque morceau est
    juge seul — la condition d'arret presente dans le troisieme fragment ne sauve pas
    les deux premiers. Elle capture aussi les commentaires de documentation, qui
    contiennent des backticks : deux backticks dans un bloc `/** */` produisent une
    fausse chaine. Mesure du 2026-08-22 sur `p1-etude.js` : 16 briefs rapportes, dont
    au moins 3 etaient des commentaires.
    """
    spans, n = [], len(script)
    for m in re.finditer(r'\bagent\s*\(', script):
        j, depth = m.end(), 1
        while j < n and depth > 0:
            c = script[j]
            if c in '\'"`':
                q, j = c, j + 1
                while j < n:
                    if script[j] == '\\':
                        j += 2; continue
                    if script[j] == q:
                        break
                    if q == '`' and script[j] == '$' and j + 1 < n and script[j + 1] == '{':
                        d, j = 1, j + 2
                        while j < n and d > 0:
                            if script[j] == '{': d += 1
                            elif script[j] == '}': d -= 1
                            j += 1
                        continue
                    j += 1
                j += 1; continue
            if c in '([{': depth += 1
            elif c in ')]}': depth -= 1
            j += 1
        spans.append(script[m.end():max(j - 1, m.end())])
    return spans


LITTERAUX = r'`((?:[^`\\]|\\.)*)`|\'((?:[^\'\\]|\\.)*)\'|"((?:[^"\\]|\\.)*)"'


def _textes(fragment):
    return [m.group(1) or m.group(2) or m.group(3) or ''
            for m in re.finditer(LITTERAUX, fragment, re.S)]


def _definitions(script):
    r"""`const NOM = (args) => ...` — un brief est souvent bati par une fonction.

    `agent(mandat(nom))` et `${SOCLE(sp)}` ne portent AUCUN litteral dans l'appel : sans
    resoudre une indirection, le controle ne voyait rien et sortait en succes. Mesure du
    2026-08-22 : `p1-ronde.js` rendait « 0 brief controle » alors qu'il en porte un.
    """
    out = {}
    for m in re.finditer(r'\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)?\s*=>?\s*', script):
        nom, i = m.group(1), m.end()
        fin = script.find('\nconst ', i)
        corps = script[i:fin if fin > 0 else min(i + 20000, len(script))]
        textes = _textes(corps)
        if textes:
            out[nom] = '\n'.join(textes)
    return out


def _appels_agent(script):
    """Le contenu de chaque appel `agent(...)`, parentheses equilibrees.

    Une extraction par chaine litterale isolee juge des FRAGMENTS : un mandat construit
    par concatenation est decoupe, et chaque morceau juge seul — la condition d'arret du
    troisieme fragment ne sauve pas les deux premiers. Elle capture aussi les commentaires
    de documentation, qui contiennent des backticks. Mesure du 2026-08-22 sur
    `p1-etude.js` : 16 briefs rapportes, dont au moins 3 etaient des commentaires.
    """
    spans, n = [], len(script)
    for m in re.finditer(r'\bagent\s*\(', script):
        j, depth = m.end(), 1
        while j < n and depth > 0:
            c = script[j]
            if c in '\'"`':
                q, j = c, j + 1
                while j < n:
                    if script[j] == '\\':
                        j += 2; continue
                    if script[j] == q:
                        break
                    if q == '`' and script[j] == '$' and j + 1 < n and script[j + 1] == '{':
                        d, j = 1, j + 2
                        while j < n and d > 0:
                            if script[j] == '{': d += 1
                            elif script[j] == '}': d -= 1
                            j += 1
                        continue
                    j += 1
                j += 1; continue
            if c in '([{': depth += 1
            elif c in ')]}': depth -= 1
            j += 1
        span = script[m.end():max(j - 1, m.end())]
        if span.strip():
            spans.append(span)
    return spans


def briefs(script):
    """Un brief = tout le texte litteral d'un appel `agent()`, indirections resolues."""
    defs, out = _definitions(script), []
    for appel in _appels_agent(script):
        morceaux = _textes(appel)
        for nom in set(re.findall(r'([A-Za-z_$][\w$]*)\s*\(', appel)) | set(re.findall(r'\$\{\s*([A-Za-z_$][\w$]*)\s*\(', appel)):
            if nom in defs:
                morceaux.append(defs[nom])
        out.append('\n'.join(morceaux))
    return out


def controler(script):
    defauts = []
    vb = [b for b in briefs(script) if VERIF.search(pla(b))]
    if vb and not any(COMPLETUDE.search(pla(b)) for b in vb):
        defauts.append((0, 'étape de vérification', ['lentille de complétude (L1)']))
    for i, b in enumerate(briefs(script), 1):
        if len(b) < MIN_BRIEF:
            # Ecarter un brief trop court le faisait passer en silence. Un mandat que le
            # controle ne peut pas lire n'est pas un mandat conforme : il est incontrolable.
            defauts.append((i, re.sub(r'\s+', ' ', b)[:70] or '(aucun texte litteral)',
                            ['brief illisible par le contrôle — mandat bâti hors littéraux']))
            continue
        absents = [k for k, rx in MANQUANTES.items() if not re.search(pla(rx), pla(b), re.I)]
        if absents:
            debut = re.sub(r'\s+', ' ', b)[:70]
            defauts.append((i, debut, absents))
    return defauts

if __name__ == '__main__':
    src = sys.stdin.read()
    try:
        entree = json.loads(src)
        ti = entree.get('tool_input', {})
        script = ti.get('script', '') or ''
        # Un workflow lance par `scriptPath` ne porte AUCUN script inline : le controle
        # sortait alors en 0 sans rien regarder. Tout un chantier peut n'appeler que par
        # chemin — mesure du 2026-08-22 : `docs/mailbox-v2/` le fait exclusivement, et le
        # contrat de brief n'y a jamais rien controle.
        if not script.strip() and ti.get('scriptPath'):
            base = entree.get('cwd') or os.getcwd()
            chemin = os.path.expanduser(ti['scriptPath'])
            if not os.path.isabs(chemin):
                chemin = os.path.join(base, chemin)
            try:
                script = open(chemin, encoding='utf-8').read()
            except OSError:
                # un chemin illisible ne doit pas valoir absolution : sans ce refus,
                # le controle sortait en succes sur un fichier qui n'existe pas.
                print(f"script introuvable : {chemin}")
                sys.exit(2)
    except Exception:
        script = src
    if not script.strip():
        sys.exit(0)
    d = controler(script)
    if not d:
        print(f"contrat tenu — {len(briefs(script))} brief(s) contrôlé(s)")
        sys.exit(0)
    for i, debut, absents in d:
        print(f"brief {i} « {debut}… » — manque : {', '.join(absents)}")
    sys.exit(2)
