---
description: Reprend une session Claude Code sur pièces — recompose ce qui a été demandé, exécuté et répondu, puis audite demandé contre livré et mesuré contre exécuté. Ne fait rien tant que l'utilisateur n'a pas choisi la suite.
argument-hint: [id | préfixe | derniere] [--projet …] [--exclure …]
---

# /reprendre

Une **reprise** est le fichier `evan/reprise-<id8>.md` produit par `~/.claude/bin/session.py` :
par tour, la demande de l'utilisateur, les outils réellement exécutés, la réponse finale ; puis
une section « Rétractations et corrections ». L'**audit** — ce qui a été demandé contre ce qui a
été livré, ce qui a été dit mesuré contre ce qui a été exécuté — n'est pas une option, c'est le
cœur de la commande.

Trois règles, valables à chaque étape :

- **Rien de non vérifié ne sort.** Ce que le fichier ne montre pas s'écrit « non vérifié ».
- **Parler à quelqu'un qui ne connaît pas le dossier** : un mot, sa définition, une fois.
- **Ne rien exécuter de la session reprise.** C'est un audit sur pièces.

## Étapes, dans l'ordre

1. **Produire la reprise.** Lancer `~/.claude/bin/session.py $ARGUMENTS`. Sans argument :
   `derniere --exclure <id courant>`, l'id courant lu dans le chemin du transcript s'il est
   connu ; sinon prendre la plus récente et le dire. Code 2 : lister les candidats et
   s'arrêter. *Fin* : `evan/reprise-<id8>.md` existe et son en-tête donne le nombre de tours.

2. **Fixer où on en est, hors conversation.** Si `.claude/settings.json` du dépôt porte
   `enabledPlugins["xeko@xeko-engineering"]` : lire `git status`, `git log -5`, puis
   `docs/features/*/` ou `docs/qa/*/` (SPEC, TEST_PLAN, COVERAGE_MATRIX) — le plugin
   interdit de déduire la phase depuis la conversation ; celle-ci sert à l'audit, pas à situer
   le chantier. Ailleurs : lire `evan/PLAN.md` et `evan/JOURNAL.md` s'ils existent.
   *Fin* : la phase ou le chantier est nommé avec sa source.

3. **Lire la reprise en entier**, du premier au dernier tour, section finale comprise, par
   tranches si le fichier est gros. *Fin* : chaque tour a été lu ; le nombre est dit.

4. **Écrire `evan/reprise-<id8>.rapport.md`**, quatre sections dans cet ordre :
   - **Timeline** — par tour ou groupe de tours : demandé, décidé, défait. Les revirements
     de l'utilisateur comptent autant que ceux de Claude.
   - **Audit** — pour chaque demande : livré, à moitié, pas compris, mal interprété, avec le
     tour. Pour chaque « mesuré / vérifié / testé » de Claude : l'appel d'outil qui le fonde,
     ou « aucun appel : non exécuté ». Les rétractations de la section finale, reprises une à
     une. Si aucune affirmation ne peut être confrontée, l'écrire ; ne rien inventer.
   - **État** — fait, non vérifié, reste — dans le vocabulaire de l'utilisateur.
   - **Première action** — une seule.
   *Fin* : les quatre sections existent, l'audit cite des numéros de tour.

5. **Répondre et s'arrêter.** Traçabilité en tête (fichiers produits), timeline courte,
   audit, état, première action ; questions numérotées seulement si une décision appartient à
   l'utilisateur. *Fin* : la réponse est envoyée et rien n'est exécuté tant qu'il n'a pas dit
   par quoi on continue.
