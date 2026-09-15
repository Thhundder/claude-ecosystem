# Évaluer un comportement de modèle

> Politique d'évaluation condensée pour chatbot, callbot ou RAG. À lire à la demande : quand on conçoit, lance ou interprète une eval, ou avant de toucher le prompt d'un système en service.

## Principe

**Tester le déterministe, évaluer le probabiliste, faire les deux.** Une fonctionnalité IA n'est jamais exemptée de tests classiques : permissions, isolation tenant, tools, validation d'arguments, parsing, schémas, requêtes, transactions, effets de bord, idempotence, retries, erreurs. L'eval couvre le reste : qualité, grounding, answerability, choix de tool, comportement agentique, utilité finale.

## Dataset

- **Le dataset porte l'attendu, jamais l'observé.** Réponse obtenue, tool utilisé, scores, latence, traces sont des sorties de run ; les mêler au dataset en fait l'enregistrement de ce que le modèle faisait ce jour-là, et l'eval ne détecte plus rien.
- **Préférer de vraies conversations de prod**, lues en lecture seule : elles testent ce que les utilisateurs demandent vraiment. **La réponse du modèle dans la trace est l'observé.** L'attendu — ce qui aurait dû être répondu — est décidé par un humain, jamais recopié. La trace fournit le prompt réel, le contexte, souvent la preuve du défaut.
- **Provenance conservée** : id de la trace source, assistant, version de config, horodatage — pour rejouer le cas et savoir contre quelle KB il a été jugé.
- Écrire à la main ce que la prod ne couvre pas : comportement neuf, cas limite jamais survenu, adversarial ou injection. Un tag distingue cas réels et construits. Source réelle inaccessible : le dire, ne jamais présenter des cas inventés comme réels.
- Colonnes : id, capability, assistant, prompt, comportement attendu, answerability, sévérité, répétitions, taux minimal ; au besoin contexte, must_include / must_not_include, tools requis / permis / interdits, contraintes d'arguments et de trajectoire, effets de bord attendus / interdits, faits de référence, rubrique du juge, trace source.
- **Answerability**, dimension de premier rang : `answerable` (répondre sans tool) · `unanswerable` (dire qu'on ne sait pas ; inventer est l'échec) · `tool_required` (lire avant de répondre) · `action_required` (tools d'action, sûreté renforcée).
- Les cas se versionnent et se relisent en revue ; les runs (réponses, traces : volume et PII) non, sauf rapport et métadonnées des runs de référence.

## Baseline et runs

- **Baseline figée avant toute modification du prompt** d'un système existant. **Un run terminé ne se modifie pas** : on en crée un nouveau.
- **Métadonnées de run**, sans lesquelles une comparaison de scores est une preuve faible : commit, assistant ou config, modèle et paramètres, hash du prompt système, versions de la KB, du toolset et du dataset, modèle et version de rubrique du juge, horodatage, répétitions.
- **Holdout jamais lu par celui qui optimise** : il optimise sur le jeu dev ; le holdout s'exécute depuis un contexte de relecture indépendant.

## Graders

**Le moins cher qui juge correctement.**

1. Déterministe dès qu'il peut trancher : JSON et schéma, IDs, dates, montants, tool obligatoire ou interdit, arguments, effets de bord interdits, invariants de permission et de tenant, règles de sûreté dures.
2. Juge sémantique : exactitude, grounding, pertinence, règle métier. **Une dimension étroite par juge**, jamais un score flou ; modèle et version de rubrique enregistrés ; **calibré sur un échantillon relu par un humain** avant de décider d'une mise en production.
3. Trajectoire, seulement si l'ordre est une exigence (permission vérifiée avant action destructrice). Un chemin différent mais valide n'est pas un échec.
4. Humain : cas ambigus, P0/P1 à jugement matériel, calibration des juges, changement majeur avant/après, ton et UX.

**Répétitions** — un run vert isolé ne prouve rien : 1 en déterministe, 3 en sémantique standard, 5 en P0/P1 ou instable. Taux minimal fixé par cas.

## Verdict

- **Jamais un score moyen comme verdict.**
- P0 à 100 %. P1 à 100 % dès qu'il y a sûreté, argent, permissions, isolation tenant ou action destructrice. Seuils P2/P3 par capability.
- Aucune régression P0/P1 contre la baseline ; le holdout tient ses propres seuils ; revue humaine critique acceptée.
- **Aucune régression critique n'est excusée par une hausse globale.**
- Comparer baseline et candidate par capability, sévérité, cas individuel, assertions déterministes, taux sémantique, sûreté des tools.

## Échecs

**Un échec d'eval est une preuve à instruire**, pas la preuve que le produit a tort. Classer **avant** de modifier quoi que ce soit :

`PROMPT` · `RETRIEVAL` · `KNOWLEDGE_GAP` · `GROUNDING` · `TOOL_SELECTION` · `TOOL_ARGUMENTS` · `TOOL_FAILURE` · `ORCHESTRATION` · `BUSINESS_LOGIC` · `PERMISSION` · `SECURITY` · `CONTEXT` · `MODEL_CAPABILITY` · `OUTPUT_FORMAT` · `UX` · `EVAL_BUG` · `UNKNOWN`

- **Un fait absent de la base de connaissances n'est pas une hallucination** : vérifier ce que la KB contenait à cette version. Absent : `KNOWLEDGE_GAP`. Présent mais trahi ou contredit : `GROUNDING`.
- `EVAL_BUG` est une issue légitime : l'eval elle-même peut avoir tort.
