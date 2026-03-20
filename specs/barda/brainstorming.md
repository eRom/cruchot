# Brainstorming : Barda (Gestion de Brigade)

**Date** : 2026-03-20
**Statut** : Decide
**Mode** : Ajout de fonctionnalite

## Idee initiale

Systeme de "Bardas" — des fichiers Markdown (.md) lisibles et editables a la main, contenant un ensemble pre-package de ressources (roles, slash commands, prompts, memory fragments, definitions de referentiels RAG, serveurs MCP) regroupees sous un namespace. L'utilisateur importe un `.md`, Cruchot parse les sections, propage le namespace automatiquement, et injecte toutes les ressources d'un coup. Ex: `barda-ecrivain.md`, `barda-philosophe.md`, `barda-dev-react.md`.

## Hypotheses validees

- Le format Markdown est suffisant — un barda est du texte structure, pas de binaire
- Le heading `###` suffit comme nom de ressource, le body comme contenu — pas de metadonnees supplementaires par ressource
- Extension `.md` simple (pas d'extension custom `.barda`)
- Le namespace du frontmatter YAML se propage a toutes les ressources (`ecrivain:resume-chapitre`)
- Les referentiels RAG sont des definitions uniquement (nom, description) — les fichiers physiques sont ajoutes manuellement apres import
- Les serveurs MCP sont des definitions texte (nom, transport, commande, arguments) — pas de secrets
- Le projet est hors scope — un barda n'est PAS un projet, il injecte des ressources globales
- ON/OFF global sur un barda entier (masque toutes les ressources du namespace sans les supprimer)
- Desinstallation complete : supprime toutes les ressources du namespace, les conversations restent (roles orphelins acceptes)
- Conflits namespace : rejet de l'import si le namespace existe deja
- Conflits MCP : skip silencieux si un serveur MCP du meme nom existe deja
- Parsing strict : fichier rejete en entier si format invalide, avec message d'erreur localise
- Pas d'export de barda depuis l'app en v1
- Pas de catalogue integre en v1

## Hypotheses rejetees

- Extension `.barda` custom → trop de friction, `.md` est universellement editable
- Pack lourd avec fichiers RAG physiques → complexite disproportionnee pour la v1
- Barda lie a un projet → contre-productif, l'utilisateur veut les outils dans SES projets
- Cherry-pick partiel a l'import → tout ou rien, la granularite est le ON/OFF apres import
- Dedup suffixe sur les noms (comme le bulk import .mlx) → le namespace elimine les collisions

## Risques identifies

- **Parsing Markdown fragile** : un utilisateur qui edite a la main peut casser la structure. Mitigation : validation stricte + message d'erreur precis (ligne, section)
- **Proliferation de namespaces** : avec 10 bardas importes, les listes de commands/roles deviennent longues. Mitigation : filtre par namespace dans les vues existantes + ON/OFF global
- **Memory fragments overflow** : un barda peut amener des fragments qui depassent la limite de 50. Mitigation : verifier l'espace disponible avant import, rejeter si depasse
- **MCP skip silencieux** : l'utilisateur ne sait pas qu'un serveur MCP n'a pas ete importe. Mitigation : rapport post-import listant les skips
- **System prompts malicieux** : un barda partage peut contenir des instructions malicieuses dans les roles. Mitigation : sanitization (pas d'injection XML/HTML), et c'est du texte visible que l'utilisateur peut inspecter

## Alternatives considerees

| Approche | Priorise | Sacrifie |
|----------|----------|----------|
| A — JSON unique | Simplicite max, validation Zod triviale | Pas editable a la main, pas Git-friendly |
| B — Archive ZIP + manifest | Extensible, cherry-pick, pret pour fichiers RAG | Complexite parsing, lib ZIP, overhead |
| **C — Markdown structure** | **Lisible, editable, Git-friendly, zero dep** | Parsing plus fragile, pas de binaire |

## Decision retenue

**Approche C — Markdown structure avec frontmatter YAML.** Le barda est du texte — un fichier Markdown est le format naturel. Lisible dans n'importe quel editeur, versionnable dans Git, partageable par email/Discord sans friction. La fragilite du parsing est mitigee par un rejet strict avec message d'erreur precis.

## Prerequis avant implementation

1. Ajouter une colonne `namespace` (nullable) sur les tables : `roles`, `slash_commands`, `prompts`, `memory_fragments`, `libraries`, `mcp_servers`
2. Ajouter une table `bardas` (registre des bardas importes, avec namespace, metadata, statut ON/OFF)
3. Definir le parseur Markdown → structure de donnees intermediaire
4. Definir la validation stricte du format (frontmatter + sections + headings)
5. Definir le rapport post-import (succes, skips MCP, warnings)

## Hors scope (explicitement exclu)

- Export de barda depuis l'app (v1 = import only)
- Catalogue / marketplace de bardas integre
- Fichiers RAG physiques dans le barda (definitions seulement)
- Secrets MCP (env vars chiffrees) dans le barda
- Cherry-pick partiel a l'import (tout ou rien)
- Versioning / mise a jour de barda (re-import = ecrasement)
- Association barda ↔ projet (les ressources sont globales)

## Contraintes de securite identifiees

- **System prompts** : contenu texte libre, potentiellement malicieux si partage. Sanitization XML/HTML, pas d'execution de code
- **MCP definitions** : commande + arguments texte, pas de secrets. L'utilisateur doit configurer ses propres env vars apres import
- **Injection namespace** : le namespace doit etre valide (regex alphanumerique + tiret), pas de caracteres speciaux
- **Taille fichier** : limite max pour eviter un DoS (ex: 1 MB)
- **Path traversal** : le barda ne contient que du texte, pas de chemins de fichiers a resoudre
