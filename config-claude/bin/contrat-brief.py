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
import re, sys, json

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

# Une etape de verification doit porter la lentille de completude : c'est la seule
# qui puisse trouver ce qu'aucune autre ne regarde. Mesure sur 81 scripts reels :
# 59 verifient, 11 seulement cherchent ce qui manque.
# La verification se reconnait a sa FONCTION, pas au mot : « si tu ne peux pas
# verifier, dis-le » est une consigne d'ancrage presente dans 93 % des briefs.
VERIF = re.compile(
    r"((vérifie|réfute|audite|contrôle|éprouve|juge|conteste|challenge|invalide)\s+"
    r"(ce|cet|cette|ces|le|la|les|l'|si|leur|chaque|toute?s?)\b"
    r"|audit (adverse|contradictoire|du lot)|lentille|verdict|revue critique"
    r"|(confirme|infirme) (ce|le|la|les|chaque))", re.I)
COMPLETUDE = re.compile(r"(ce qui manque|qu'est-ce qui manque|non (examiné|regardé|couvert|vérifié|lu|instruit)"
                        r"|angle (mort|manquant)|oubli|passé sous silence|n'a pas été (regardé|vu|traité|lancé)"
                        r"|lacune|ce qu'aucun|point aveugle|sans lentille|quelle (modalité|source|affirmation))", re.I)

def briefs(script):
    """Les chaînes longues d'un script de workflow : ce sont les briefs."""
    out = []
    for m in re.finditer(r'`((?:[^`\\]|\\.)*)`|\'((?:[^\'\\]|\\.)*)\'|"((?:[^"\\]|\\.)*)"', script, re.S):
        s = m.group(1) or m.group(2) or m.group(3) or ''
        if len(s) >= MIN_BRIEF:
            out.append(s)
    return out

def controler(script):
    defauts = []
    vb = [b for b in briefs(script) if VERIF.search(b)]
    if vb and not any(COMPLETUDE.search(b) for b in vb):
        defauts.append((0, 'étape de vérification', ['lentille de complétude (L1)']))
    for i, b in enumerate(briefs(script), 1):
        absents = [k for k, rx in MANQUANTES.items() if not re.search(rx, b, re.I)]
        if absents:
            debut = re.sub(r'\s+', ' ', b)[:70]
            defauts.append((i, debut, absents))
    return defauts

if __name__ == '__main__':
    src = sys.stdin.read()
    try:
        script = json.loads(src).get('tool_input', {}).get('script', '') or ''
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
