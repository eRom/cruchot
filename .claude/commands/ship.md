# /ship — Publier une version (docs + commit + release + memoire)

Pipeline complet de publication en une commande. Analyse les changements, met a jour la documentation, commit, push, release, et met a jour la memoire.

## Syntaxe

```
/ship              -> analyse automatique (minor si feature, patch sinon)
/ship patch        -> force patch
/ship minor        -> force minor
```

**REGLE ABSOLUE** : ne JAMAIS bump major sauf si Romain le demande explicitement avec `/ship major`.

---


## Etape 1 : Mettre a jour la documentation

### 1.1 Evaluer le besoin

Pour chaque changement significatif, verifier si la documentation existante doit etre mise a jour.

Fichiers a verifier :
- `documentations/tech/` : les fichiers techniques
- `documentations/user/` : les guides utilisateur
- `documentations/README.md` : le sommaire (seulement si ajout/suppression de fichier)

### 1.2 Regles de mise a jour

- **Feature UI** : mettre a jour le guide utilisateur concerne
- **Feature technique** (tools, security, DB) : mettre a jour le fichier tech concerne
- **Fix/improvement mineur** : PAS de mise a jour doc (sauf si ca change un comportement documente)
- **Nouveau concept majeur** : creer un nouveau fichier si aucun existant ne couvre le sujet, et mettre a jour `documentations/README.md`

### 1.3 Style documentation

- Tech : factuel, precis, avec noms de fichiers et patterns de code
- User : accessible, orient usage, pas de jargon interne
- Garder la structure existante de chaque fichier (ne pas reorganiser)
- Ajouter du contenu, ne pas supprimer l'existant sauf s'il est devenu faux

---


## Etape 2 : Resume final

Afficher :

```
Update complete !
Docs : N fichiers mis a jour (ou "aucun changement")

┌─────┬───────────────────────────────────────────────────────────────────────────────────────┐
│  #  │                                   Document                │         Comments          │
├─────┼───────────────────────────────────────────────────────────┼───────────────────────────┤
│ 1   │ documentations/tech/01-CORE_ARCHITECTURE.md               │                           │
├─────┼───────────────────────────────────────────────────────────┼───────────────────────────┤
│ 2   │ documentations/tech/03-DATA_AND_VECTOR_STORAGE.md         │                           │
├─────┼───────────────────────────────────────────────────────────┼───────────────────────────┤
│ 3   │ documentations/user/USING_SKILLS_AND_MCP.md               │                           │           
└─────┴───────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Gestion d'erreurs

- **Rien a shipper** (0 commits depuis le dernier tag) : "Rien a shipper. Aucun commit depuis vX.Y.Z."
- **Working tree dirty avant debut** : proposer de commiter d'abord ou d'inclure les changements
- **Pas sur main** : STOP immediat
- **Push echoue** : STOP, afficher l'erreur
- **CI echoue** : afficher le lien, la release reste en draft
