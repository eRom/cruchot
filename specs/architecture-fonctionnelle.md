# Architecture Fonctionnelle — Cruchot (Multi-LLM Desktop)

**Date de creation** : 2026-03-09
**Derniere mise a jour** : 2026-03-20
**Chantiers integres** : phase-setup, barda

## Vision produit

Application desktop locale de chat multi-LLM (10 providers cloud + 2 locaux), generation d'images, TTS cloud, statistiques de couts, workspace co-work, integration Git, taches planifiees, integration MCP, memory fragments, memoire semantique (RAG local Qdrant), referentiels RAG custom, Remote Telegram, Remote Web, export/import securise (.mlx), slash commands, @mention fichiers, prompt optimizer, drag & drop fichiers, conversations favorites, mode Arena (LLM vs LLM), **systeme de bardas thematiques (Gestion de Brigade)**. Zero serveur backend.

## Personas

### Romain (Utilisateur principal)
- **Qui** : Developpeur senior, power user
- **Objectif** : Centraliser toutes les interactions LLM dans une seule app desktop souveraine
- **Frustration actuelle** : Jongler entre ChatGPT, Claude, Gemini, etc.
- **Frequence d'usage** : Quotidien, intensif

### Utilisateur lambda (beneficiaire des bardas)
- **Qui** : Ami/collegue de Romain, pas forcement technique
- **Objectif** : Utiliser Cruchot avec un kit d'outils pre-configure pour son metier/passion
- **Frustration actuelle** : Ne sait pas par ou commencer, doit tout configurer a la main
- **Frequence d'usage** : Variable, guide par le barda importe

## Parcours utilisateurs

### Parcours principal — Chat multi-LLM
```
Utilisateur → Selectionne modele → Saisit message → IPC → Main: streamText()
→ Forward chunks → Affichage temps reel → Save DB + cout
```

### Parcours Barda — Import d'un kit thematique (NOUVEAU)
```
Utilisateur → Gestion de Brigade → "Importer un barda"
→ Selectionne fichier .md → Parsing + validation stricte
    ↓ (erreur)                    ↓ (valide)
  Message d'erreur precis    Preview du contenu (roles, commands, prompts, etc.)
                                  ↓
                              Confirmation → Import atomique (namespace propage)
                                  ↓
                              Rapport post-import (succes, MCP skips, warnings)
                                  ↓
                              Ressources visibles dans les vues existantes (filtrees par namespace)
```

### Parcours Barda — Toggle ON/OFF
```
Utilisateur → Gestion de Brigade → Toggle switch sur un barda
→ Toutes les ressources du namespace masquees/revelees
→ Pas de suppression, juste visibilite
```

### Parcours Barda — Desinstallation
```
Utilisateur → Gestion de Brigade → "Desinstaller" sur un barda
→ Confirmation → Suppression atomique de toutes les ressources du namespace
→ Conversations intactes (roles orphelins acceptes)
→ Ligne barda supprimee du registre
```

## Cas d'usage

### [CU-01] Importer un barda
- **Acteur** : Utilisateur
- **Precondition** : Possede un fichier `.md` au format barda valide
- **Scenario nominal** :
  1. Ouvre la vue "Gestion de Brigade"
  2. Clique "Importer un barda"
  3. Selectionne le fichier `.md` via dialog natif
  4. L'app parse et valide le fichier
  5. Preview du contenu avec compteurs par section
  6. Confirme l'import
  7. Les ressources sont creees avec le namespace propage
  8. Rapport post-import affiche
- **Scenarios alternatifs** :
  - [SA-01] Fichier invalide → message d'erreur precis (ligne, section) + rejet complet
  - [SA-02] Namespace deja existant → erreur "Ce barda est deja installe" + stop
  - [SA-03] Memory fragments overflow (50 max) → erreur + stop
  - [SA-04] Serveur MCP existant → skip silencieux + mentionne dans le rapport
- **Postcondition** : Barda enregistre dans le registre, ressources disponibles
- **Regles metier** : RM-01, RM-02, RM-03, RM-04, RM-05

### [CU-02] Toggle ON/OFF un barda
- **Acteur** : Utilisateur
- **Precondition** : Au moins un barda importe
- **Scenario nominal** :
  1. Ouvre la vue "Gestion de Brigade"
  2. Toggle le switch d'un barda
  3. Toutes les ressources du namespace sont masquees/revelees dans les vues
- **Postcondition** : Barda ON ou OFF, ressources filtrees dans les listes

### [CU-03] Desinstaller un barda
- **Acteur** : Utilisateur
- **Precondition** : Barda importe
- **Scenario nominal** :
  1. Ouvre la vue "Gestion de Brigade"
  2. Clique "Desinstaller" sur un barda
  3. Confirmation (dialog)
  4. Suppression atomique de toutes les ressources du namespace
  5. Barda retire du registre
- **Postcondition** : Ressources supprimees, conversations intactes

## Regles metier

| ID | Regle | Justification |
|----|-------|---------------|
| RM-01 | Le namespace est unique dans l'app | Evite les collisions entre bardas et entre barda/custom |
| RM-02 | Le namespace se propage a toutes les ressources du barda | Identification claire de l'origine (ex: `ecrivain:resume-chapitre`) |
| RM-03 | Un barda est importe en tout ou rien (atomique) | Pas d'etat intermediaire, pas de ressources orphelines du barda |
| RM-04 | Les serveurs MCP existants ne sont pas ecrases | Le MCP est un systeme critique, l'utilisateur l'a peut-etre configure manuellement |
| RM-05 | La desinstallation ne touche pas aux conversations | Les conversations ont une valeur superieure aux outils |
| RM-06 | Le namespace doit matcher `/^[a-z][a-z0-9-]*$/` | Coherence avec les noms de slash commands, pas de caracteres speciaux |
| RM-07 | Taille max du fichier barda : 1 MB | Prevention DoS sur le parsing |
| RM-08 | Memory fragments limites a 50 total (barda + custom) | Limite existante du system prompt |
| RM-09 | Le toggle ON/OFF masque TOUTES les ressources du namespace | Pas de granularite par type, c'est tout ou rien |

## Modele de donnees metier

```
[Barda] 1──N [Role]
         1──N [SlashCommand]
         1──N [Prompt]
         1──N [MemoryFragment]
         1──N [Library (definition)]
         1──N [McpServer (definition)]
```

Relations :
- Un barda est identifie par son namespace (unique)
- Chaque ressource porte le namespace de son barda source
- Les ressources custom (sans namespace) coexistent avec les ressources de bardas
- La desinstallation supprime par namespace (pas par FK — le namespace est le lien)

## Exigences non-fonctionnelles

| Categorie | Exigence | Priorite |
|-----------|----------|----------|
| Performance | Le parsing d'un barda doit prendre < 100ms | P1 |
| Performance | L'import atomique doit etre transactionnel (rollback si echec) | P0 |
| Securite | Les system prompts sont sanitises (pas d'injection XML/HTML) | P0 |
| Securite | Le namespace est valide strictement (regex) | P0 |
| Securite | Taille max 1 MB pour le fichier | P0 |
| Robustesse | Rejet strict du fichier si format invalide, avec message precis | P0 |
| UX | Preview du contenu avant import | P1 |
| UX | Rapport post-import listant succes et skips | P1 |
| UX | Filtre par namespace dans les vues existantes | P0 |

## Contraintes de securite (Security by Design)

- **Donnees sensibles** : les system prompts peuvent contenir du contenu malicieux (prompt injection). Sanitization XML/HTML a l'import
- **Authentification** : non applicable (mono-utilisateur)
- **Autorisation** : non applicable
- **Surface d'attaque** : fichier .md fourni par un tiers → parsing strict, taille limitee, namespace valide
- **Conformite** : aucune
- **Chiffrement** : non applicable (pas de secrets dans un barda)

## Priorites

| Priorite | Fonctionnalites |
|----------|----------------|
| P0 (MVP) | Parseur Markdown, validation, import atomique, table `bardas`, namespace sur les tables existantes, vue "Gestion de Brigade" (liste + import + desinstaller), filtre namespace dans vues existantes |
| P1 (confort) | Preview avant import, rapport post-import detaille, toggle ON/OFF global, indicateur visuel namespace dans les listes |
| P2 (nice-to-have) | Export barda depuis l'app, catalogue de bardas exemple |
