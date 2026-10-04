---
name: corriger-ia-xeko
description: À utiliser quand un modèle IA de Xeko (chatbot, callbot, copilote, outil IA du Hub) se comporte mal — mauvaise réponse, question redemandée, outil mal appelé, info oubliée — et qu'il faut corriger ce comportement.
---

# Corriger une IA Xeko

## Code first

- Chercher la correction dans le code d'abord : boucle de chat, état de conversation, serveur
  MCP, consignes renvoyées par l'outil. Le prompt en dernier recours : ses règles sont suivies
  inégalement selon le modèle.
- Laisser le moins de choix possible au modèle ; le code décide.
- Le code garde et renvoie tout ce que le visiteur a dit. Le visiteur ne redonne jamais une
  information déjà donnée. Critère : « le visiteur a-t-il dû se répéter ? », pas « y a-t-il eu
  une question de plus ? ».
- Dans une comparaison de modèles, compter aussi les erreurs du modèle de référence.

## Corriger la classe, pas le cas

- Un exemple donné par Evan est un test, pas le périmètre : trouver la cause générale, la
  comprendre, l'empêcher pour toute la classe de cas.
- Cause prouvée : déclenchée, puis éteinte par la correction.
- Aucune liste de mots, de lieux, de campings ou de phrases propres au cas vu. Relire le diff
  en y cherchant les mots du cas d'origine.
- Prouver la correction sur au moins un autre cas que celui où le défaut est apparu.

Pour mesurer avant et après : skill `banc-essai`.
