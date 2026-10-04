---
name: retirer-remplacer
description: À utiliser quand on supprime, retire ou remplace du code, une fonctionnalité, un module, un endpoint, une tâche planifiée, un outil ou un fichier partagé — avant la première suppression.
---

# Retirer ou remplacer

Dans cet ordre, dans un workflow comme en dehors.

1. **Carte avant de couper**, dosée selon le danger : ce qui touche la chose, et ce qu'elle
   touche. Si elle touche la base Mongo partagée ou du code commun, la carte couvre les quatre
   dépôts qui la partagent : `xeko-app`, `xeko-plateforme`, `xeko-backend`, `xeko-mcp`.
   Sinon, le dépôt concerné. La carte s'écrit avant la première suppression.
2. **Plan de retrait**, qui nomme ce qui doit rester intact. Pour un petit retrait, une ligne
   du plan de la tâche suffit.
3. **Archiver** ce qui n'a jamais été poussé (fichiers non suivis, branches locales, notes) en
   `tar.gz` avant de le supprimer. Les archives ne se suppriment jamais.
4. **Supprimer.**
5. **Orphelins** : aides devenues sans appelant, imports morts, constantes, fixtures, tables,
   variables d'environnement, tâches planifiées, entrées de documentation, documents qui citaient
   la chose. Une doctrine qui nomme un outil retiré est un orphelin.
6. **Vérifier que rien d'autre n'a bougé** : diff relu, tests et build du dépôt (commandes lues
   dans `package.json`, la CI ou ses scripts).

Exception : un `.md` de travail de Claude qui ne sert plus se supprime directement, sans carte
ni archive.
