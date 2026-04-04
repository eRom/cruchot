# Mémoire et Profil Utilisateur

Cruchot apprend à vous connaître au fil du temps grâce à trois couches de mémoire complémentaires, toutes stockées **localement sur votre machine**.

## 1. Les Trois Couches de Mémoire

| Couche | Où | Comment |
|--------|-----|---------|
| **Notes** (fragments manuels) | Onglet Notes de MemoryView | Vous écrivez vous-même des faits à mémoriser |
| **Souvenirs** (mémoire sémantique) | Qdrant (vectoriel) | Cruchot retrouve les passages pertinents de vos anciennes conversations |
| **Profil** (mémoire épisodique) | SQLite | Cruchot distille automatiquement vos préférences et habitudes |

Pour accéder à la MemoryView : ouvrez le panneau **Personnaliser** (`Cmd+U`) > onglet **Mémoire**.

---

## 2. Mémoire Épisodique (Onglet Profil)

### Qu'est-ce que c'est ?

Après chaque conversation (ou quand vous changez de conversation), Cruchot analyse silencieusement l'échange et en tire des "épisodes" — des faits comportementaux sur vous :

- `preference` — "Préfère les réponses courtes", "Déteste les docstrings non demandées"
- `behavior` — "Utilise `trash` au lieu de `rm`", "Code en TypeScript en priorité"
- `context` — "Travaille chez Acme Corp", "Projet principal = MonProjet"
- `skill` — "Expert TypeScript", "Débutant en Rust"
- `style` — "Ton sec et direct", "Humour noir apprécié"

Ces épisodes sont **injectés dans chaque conversation** pour que l'IA vous connaisse dès le premier message, sans que vous ayez à vous répéter.

### Quand l'extraction se déclenche-t-elle ?

L'extraction est entièrement automatique et silencieuse :

1. **Quand vous changez de conversation** — la conversation que vous quittez est analysée.
2. **Après 5 minutes d'inactivité** — si vous n'envoyez pas de message pendant 5 min, la conversation active est analysée.
3. **À la fermeture de l'application** — toutes les conversations avec du contenu non analysé sont traitées.

> La première extraction a lieu dès que la conversation contient au moins 4 nouveaux messages depuis la dernière analyse.

### Gérer vos épisodes

Dans **Personnaliser > Mémoire > Profil** :

- **Activer/désactiver un épisode** : le toggle switch à gauche de chaque épisode. Un épisode désactivé est conservé mais n'est plus injecté dans les conversations.
- **Supprimer un épisode** : icône poubelle. Irréversible.
- **Tout supprimer** : bouton en bas de l'onglet (zone orange).

Chaque épisode affiche :
- La **catégorie** (badge coloré)
- Le **niveau de confiance** (en %, calculé par le LLM)
- Le **nombre d'occurrences** (combien de fois ce fait a été ré-observé)
- La **date** de dernière mise à jour

### Choisir le modèle d'extraction

En haut de l'onglet Profil, un sélecteur vous permet de choisir quel modèle LLM effectue l'analyse comportementale. Un modèle **léger et rapide** est recommandé (ex: `gemini-2.0-flash`, `gpt-4o-mini`, `claude-haiku`) — l'extraction tourne en arrière-plan et ne doit pas mobiliser vos modèles premium.

Le format attendu : `providerId::modelId`.

### Scope par projet

Les épisodes peuvent être globaux (s'appliquent à toutes vos conversations) ou liés à un projet spécifique. Les épisodes injectés lors d'une conversation sont : les globaux + ceux du projet actif de la conversation.

---

## 3. Notes (Fragments Manuels)

L'onglet **Notes** de la MemoryView vous permet de rédiger vous-même des faits à injecter dans toutes vos conversations. Utile pour des informations stables que vous ne voulez pas attendre que l'IA découvre seule :

- Vos préférences de travail
- Des contextes projet permanents
- Des règles ou contraintes que l'IA doit toujours respecter

Contrairement aux épisodes, les notes ne sont pas générées automatiquement — vous les écrivez et les gérez manuellement.

---

## 4. Souvenirs (Mémoire Sémantique)

L'onglet **Souvenirs** donne accès aux statistiques et contrôles de la mémoire vectorielle Qdrant :

- **Nombre de messages indexés** dans la base vectorielle.
- **Toggle** pour activer/désactiver le recall sémantique sur la conversation active.
- **Réindexation** si la base est désynchronisée.
- **Recherche** dans les souvenirs vectoriels.

La mémoire sémantique retrouve les passages de vos **anciennes conversations** qui sont pertinents pour votre question actuelle, et les injecte comme contexte. Elle est complémentaire aux épisodes : les épisodes mémorisent *qui vous êtes*, les souvenirs mémorisent *ce que vous avez dit*.

---

## 5. Nettoyage des Données

Dans **Personnaliser > Mémoire**, deux zones de nettoyage :

- **Zone orange (partiel)** : supprime les épisodes uniquement.
- **Zone rouge (factory reset)** : supprime les épisodes + réinitialise `lastEpisodeMessageId` sur toutes les conversations (la prochaine fermeture de l'app re-analysera tout depuis le début si vous avez un modèle configuré).
