# Decision : Export/Import securise des conversations

**Date** : 2026-03-13
**Statut** : Decide

## Idee initiale
Securiser l'export des conversations avec un chiffrement par token d'instance (AES-256-GCM), et permettre l'import natif sur la meme machine ou une autre instance de l'app.

## Hypotheses validees
- Le threat model est "fureteur" (N2) : quelqu'un qui sait decoder du Base64 mais n'a pas acces au Keychain
- Le token d'instance (genere a l'install, stocke via safeStorage) est la cle de chiffrement — zero friction sur la meme machine
- Export = toutes les conversations + projets associes, pas de selection unitaire
- Contenu message = role + content texte + modelId + createdAt (pas de metadata, tools, thinking, MCP, attachments)
- Projets exportes avec leurs infos (nom, description, defaultModelId, settings) mais PAS le workspace path
- Import externe (ChatGPT/Claude/Gemini) est hors scope — a traiter plus tard
- Dedup projets a l'import : creation doublon avec suffixe `-1` (pattern existant)

## Risques identifies
- Perte du token = fichiers .mlx illisibles (pas de recovery possible)
- Token copie-colle entre machines = securite dependante de la vigilance du user
- Export volumineux si beaucoup de conversations (mais JSON compresse bien)

## Alternatives considerees

| Approche | Priorise | Sacrifie |
|----------|----------|---------|
| **N0 — JSON brut** | Simplicite absolue | Securite (lisible par tous) |
| **N1 — Obfuscation Base64** | Zero friction | Securite reelle (decodable en 2 secondes) |
| **N2 — Token instance AES-256-GCM** | Securite solide + UX fluide sur meme machine | Necessite copier le token pour import cross-machine |
| **N3 — Mot de passe** | Securite maximale | Friction a chaque export/import, risque oubli |

## Decision retenue
**N2 — Token instance + AES-256-GCM.** Le meilleur ratio securite/friction. Le token vit dans le Keychain OS (safeStorage), zero friction en local, et un simple copier-coller pour transferer entre machines.

## Specification fonctionnelle

### Token d'instance
- Genere au premier lancement : `crypto.randomBytes(32)`
- Stocke via `safeStorage` (Keychain macOS)
- UI Settings > Donnees : affiche `************` avec bouton "Copier"
- Jamais transmis, jamais affiche en clair dans l'UI

### Export
- Bouton "Exporter" dans Settings > Donnees (existant)
- Collecte toutes les conversations + messages + projets associes
- Structure JSON :
  - `version` : schema version pour compatibilite future
  - `exportedAt` : timestamp
  - `projects[]` : { name, description, defaultModelId, settings (sans workspace) }
  - `conversations[]` : { title, projectName, createdAt, messages[] }
  - `messages[]` : { role, content, modelId, createdAt }
- Chiffrement AES-256-GCM avec le token instance
- Fichier sauvegarde : `multi-llm-export-YYYY-MM-DD.mlx`
- Dialog natif "Enregistrer sous"

### Import natif
- Bouton "Importer" dans Settings > Donnees (existant, a renommer "Importer (natif)")
- Bouton "Importer (externe)" : desactive/grise avec tooltip "Bientot disponible"
- Dialog natif "Ouvrir" filtre `.mlx`
- Dechiffrement avec token local. Si echec → popup "Collez le token d'export de l'instance source"
- Recreation en DB :
  - Projets : creation avec dedup suffixe `-1`, `-2` si nom existe
  - Conversations : creation, rattachees au projet importe (ou sans projet)
  - Messages : insertion bulk, IDs regeneres
- Refresh sidebar apres import
- Toast de confirmation : "X conversations importees (Y projets)"

### Ce qui n'est PAS exporte
- Workspace path / fichiers workspace
- Tokens / couts / statistiques
- Tool calls / reasoning / thinking blocks
- MCP data
- Fichiers attaches / images
- Roles, prompts, slash commands, memory fragments
- Cles API / settings

## Prerequisites avant implementation
1. Verifier que `safeStorage` est disponible au premier lancement (avant onboarding)
2. Definir le schema JSON versionne (v1) pour compatibilite future
3. Identifier les queries DB necessaires (conversations + messages + projets par batch)
4. Prevoir la UI du token dans Settings > Donnees (nouvel encart)

## Hors scope (explicitement exclu)
- Import externe (ChatGPT, Claude, Gemini) — feature future separee
- Export selectif (par conversation ou par projet) — possible evolution future
- Compression du fichier .mlx (AES-GCM suffit, le fichier reste petit)
- Synchronisation entre instances (on reste sur export/import manuel)
- Export des images / attachments
