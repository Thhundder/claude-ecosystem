---
name: serveurs-xeko
description: À utiliser avant d'agir sur un serveur ou une infrastructure Xeko — SSH, déploiement, logs, base Mongo, Qdrant, monitoring, domaines, comptes externes — ou pour répondre à une question sur où tourne quoi chez Xeko.
---

# Serveurs Xeko

- Lire `~/Documents/Xeko/evan/infra-xeko.md` avant d'agir sur un serveur : machines, accès,
  stockage partagé, déploiement et ses pièges, monitoring.
- Ne jamais afficher la valeur d'un identifiant, seulement son existence. Un fichier
  d'identifiants distant se lit avec
  `ssh hôte bash -s -- <fichier> < ~/.claude/bin/lire-secret.sh`.
- Un déploiement ou une action sur `dev` ou `main` se fait sur demande seulement.
