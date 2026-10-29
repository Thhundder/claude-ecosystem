# Evan

Plans, cahier des charges, journal, mesures et études vivent dans `evan/` à la racine du dépôt
(ignoré par git : cherche-le sur le disque, pas avec git). Le coût d'un lancement se fonde sur la
consommation mesurée d'un lancement précédent (`~/.claude/bin/cout-vol.py`), pas au jugé.

- Un chantier ou une fonctionnalité dont Claude propose le contenu : plan posé, GO attendu, jamais
  lancé dans le même tour.
- Avant d'envoyer sur `dev` ou `main` : la liste de ce qui part, un commit par ligne, nos commits
  seuls ; tests verts ; GO d'Evan ; puis vérifier que le distant correspond.
- Un cahier des charges validé ouvre le plan, pas le code : le plan attend lui aussi son GO.
- Un coût s'écrit en jetons (lus en cache, écrits, produits), jamais en dollars ni en euros pour
  l'abonnement Claude.
- Un plan : une ligne « Chantier : <numéro ou titre du chantier du cahier> » sous le titre (le panneau lie la
  session à ce chantier), puis une case `- [ ]` par étape (cochée `- [x]` une fois finie), chaque étape commence par un
  titre court lisible seul, ses sous-étapes en dessous, décalées ; chaque étape dit « fini quand » et
  « on arrête si ».
- Cahier des charges : un par dépôt, `evan/CAHIER-DES-CHARGES.txt`, une section par chantier (objectif,
  inclus, exclu, fini quand), écrit depuis les mots d'Evan et validé par lui avant le plan ; on n'en
  sort jamais de soi-même.
- Chaque nouvelle demande d'Evan est notée dans le même tour : au cahier si elle change le périmètre,
  et une ligne au plan.
- Une question à Evan, même sur un commit ou un envoi, porte la recommandation de Claude ; une
  correction ponctuelle sans plan n'a pas de ligne « Plan ».
- Navigateur : seulement Claude in Chrome sur le Chrome de ce PC (Thundder). S'il est fermé, l'ouvrir
  (`google-chrome` en tâche de fond) puis s'y connecter ; jamais un autre navigateur ni un autre
  appareil connecté, jamais le navigateur intégré.
