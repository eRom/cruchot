# Dossiers de Travail et Bibliothèques (RAG)

Cruchot organise votre travail autour de deux concepts majeurs : les **Dossiers de Travail** (Workspaces) et les **Bibliothèques Documentaires** (Libraries).

## 1. Dossiers de Travail (Workspace)

Chaque conversation dans Cruchot est associée à un dossier spécifique sur votre ordinateur. Cela limite la portée d'action de l'IA.

### Changer de Dossier
1. Ouvrez une conversation.
2. Ouvrez le **Panneau de Droite** (`Opt+Cmd+B`).
3. Dans la section **Dossier de travail**, cliquez sur le chemin affiché pour sélectionner un autre dossier.
4. L'IA ne pourra lire, écrire ou exécuter des commandes **que** dans ce dossier (et ses sous-dossiers).

> **Mode YOLO** : Un switch (icone eclair) dans cette section permet de bypasser les demandes d'approbation pour les outils. Les vérifications de sécurité (bash checks, deny rules) restent actives. Utilisez avec précaution.

*Note macOS : Le confinement est strict. L'IA ne peut physiquement pas sortir de ce dossier, même en cas de bug.*

## 2. Bibliothèques Documentaires (RAG)

Les bibliothèques permettent à l'IA de lire des centaines de documents en quelques secondes pour répondre à des questions précises sur vos données, sans avoir à tout envoyer dans la conversation.

### Créer une Bibliothèque
1. Allez dans **Personnaliser** (`Cmd+U`) > onglet **Referentiels**.
2. Cliquez sur **Créer une Bibliothèque**.
3. Donnez-lui un nom (ex: "Documentation Projet XYZ").
4. Glissez-déposez des fichiers (`.txt`, `.md`, `.pdf`, `.docx`) ou sélectionnez un dossier complet.

### Comment ça marche ?
Cruchot va découper vos documents, les analyser localement (sans les envoyer sur Internet), et les stocker dans une base de données vectorielle interne (Qdrant).

### Utiliser une Bibliothèque
1. Retournez dans votre conversation.
2. Ouvrez le **Panneau de Droite**.
3. Dans la section **Options**, sous **Bibliothèque RAG**, sélectionnez la bibliothèque que vous venez de créer.
4. Posez votre question. L'IA cherchera d'abord les informations pertinentes dans vos documents avant de vous répondre.

### OCR sur les images et PDFs scannés

Si vous avez une **clé API Mistral** configurée, Cruchot peut automatiquement extraire le texte de :
- **Images** (JPEG, PNG, WebP…) ajoutées à une bibliothèque ou envoyées en pièce jointe dans le chat.
- **PDFs scannés** (sans couche texte) : l'OCR reconstruit le contenu page par page avant indexation.

Les PDFs natifs (avec texte sélectionnable) sont traités directement sans OCR.

Un badge **OCR** est affiché sur les pièces jointes traitées pour indiquer que le texte a été extrait automatiquement. Le coût OCR est comptabilisé dans vos statistiques comme toute autre requête Mistral.
