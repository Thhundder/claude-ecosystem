---
name: banc-essai
description: À utiliser quand on compare des modèles, des prompts ou des versions, qu'on monte un banc d'essai ou une eval, ou qu'on mesure un comportement (modèle, coût, durée, sessions) avant d'en tirer une conclusion ou une décision.
---

# Banc d'essai

## Avant tout travail d'évaluation d'un modèle

Lire `~/.claude/references/evals-llm.md` : dataset, baseline, runs, juges. Ce qui suit ne le
remplace pas.

## Reproduire la prod à 100 %

- Lire ce qui tourne vraiment (prod ou staging, pas la copie locale) et dire laquelle.
- Le banc reprend la prod à l'identique : même prompt, mêmes données, même date. Vérifier qu'il
  est identique avant de sortir un seul chiffre ; sinon il ne sert à rien.
- Mêmes conditions pour chaque version comparée. Le banc mesure ce qui est demandé, rien d'autre.
- Avant un push qui déploie : tests contre les versions de dépendances que la CI installe.
- Pour éprouver une liaison entre applications : les vraies clés, lues sans afficher leur
  valeur (`~/.claude/bin/lire-secret.sh`), jamais des clés jetables.

## Mesurer avant de conclure

- Fréquence sur données réelles : combien de fois le défaut arrive, pas une impression.
- Un cas réel de bout en bout, en vraies valeurs.
- Un instrument éprouvé d'abord sur un cas dont on connaît la réponse.

## Lire les mesures

- Toute mesure sur plusieurs éléments (sessions, cas, essais) se montre élément par élément.
- Comparer en médiane, une voix par élément, jamais une somme.
- Vérifier que la conclusion tient sans les plus gros éléments ; sinon le dire.
- Avant de proposer un indicateur, dire ce qu'il risque de mélanger (taille de tâche, type de
  travail, période) et comment on l'évite.

## Contrôle nul

Avant d'attribuer un comportement du modèle à une ligne du prompt : rejouer avec une
modification neutre du prompt (même longueur, sens inchangé). Si le comportement bouge autant,
la ligne n'est pas la cause.
