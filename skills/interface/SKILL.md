---
name: interface
description: À utiliser quand on crée ou modifie un écran, une page, un composant visible ou une maquette d'application web ou mobile — avant d'écrire le code d'interface.
---

# Interface

- **Maquette d'abord** pour un écran neuf ou un gros changement ; pas pour un petit changement
  (un bouton, un libellé), qui se vérifie sur le rendu. Une fois validée par Evan, la maquette
  fait référence.
- Dans un dépôt sous `~/Documents/Xeko` : la maquette est celle de l'écran visé, avec le socle,
  le thème et la façon de faire du dépôt. Ailleurs : l'atlas complet (`~/.claude/bin/atlas.py`
  l'amorce depuis les jetons du dépôt).
- **Rien ne manque** : l'implémentation reprend chaque élément de la maquette, pas au pixel
  près. Un défaut visible de la maquette peut être corrigé au passage ; une omission, jamais.
- **La conformité se mesure** : inventaire de la maquette, inventaire de l'écran rendu,
  comparaison des deux avec `~/.claude/bin/ecran.mjs`.
- **La copie locale fait foi** : toute maquette ou atlas publié sur un compte est aussitôt
  écrit en local — `maquettes/` du dépôt s'il en versionne, sinon `evan/maquettes/` ; hors
  dépôt, `~/Documents/artefacts-claude/`. On modifie la copie locale, puis on republie.
- **Vérifier sur le rendu, pas sur le code source** : une app web en prenant la main sur le
  navigateur ; une app mobile sur son rendu web exporté ou sur des captures. Des tests verts ne
  disent pas qu'un écran est lisible.

Si la référence est un site tiers : skill `site-tiers`.
