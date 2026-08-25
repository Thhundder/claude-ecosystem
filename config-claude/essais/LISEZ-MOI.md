# Bancs d'essai de la configuration

Trois bancs, tous exécutables sans argument. Chacun a été éprouvé contre la version
d'avant correctif : il en sort rouge. Un banc qui ne peut pas échouer n'en est pas un.

| Banc | Ce qu'il éprouve |
| --- | --- |
| `garde.sh` | 26 cas sur `hooks/guard.sh` — identifiants, substitution non vérifiée, déploiement, gestes git irrattrapables, effacement hors périmètre, transparence sur ssh. |
| `garde-chemins.sh` | Les formes d'invocation d'un déploiement. Toutes doivent demander confirmation, sauf `npm run deploy`, hors du périmètre déclaré de la garde. |
| `secret.sh` | `bin/lire-secret.sh` ne laisse sortir aucune valeur, et laisse lisible la configuration ordinaire. Variable `SECRET=<chemin>` pour éprouver une autre version. |

Non couvert : `hooks/journal-hook.sh`, `hooks/contrat-hook.sh`, `bin/ecran.mjs`,
`bin/atlas.py`, `bin/front-seuil.sh` ont été éprouvés à la main le 2026-08-25 —
aucun banc versionné.
