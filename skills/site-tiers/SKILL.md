---
name: site-tiers
description: À utiliser quand un site ou une app tierce sert de référence visuelle — reproduire, imiter ou s'inspirer d'une page existante (« fais comme tel site », une URL donnée en modèle).
---

# Site tiers comme référence

- **Le mesurer avant d'écrire une ligne** : DOM, styles calculés, captures à la même taille
  d'écran que le rendu visé.
- **Le livrable est l'inventaire comparé zone par zone** (référence contre rendu). Chaque écart
  se ferme avant d'ouvrir la zone suivante.
- **Nommer d'avance ce qui vient du dépôt d'accueil** — typographie, couleurs, icônes — pour
  que ces écarts-là soient voulus, pas oubliés.
- La comparaison se fait sur le rendu (`~/.claude/bin/ecran.mjs`), pas sur le code.

Le reste du travail d'écran suit la skill `interface`.
