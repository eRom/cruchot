# Gemini Live Voice — Conversation vocale temps-réel

Cruchot intègre une conversation vocale bidirectionnelle basée sur l'API **Gemini Live** de Google. Parlez directement à l'IA, elle vous répond à voix haute en temps réel — sans délai de frappe, sans attente de génération texte.

## 1. Prérequis

- Une clé API **Google** (Gemini) configurée dans les Paramètres > Providers.
- Un microphone fonctionnel (autorisé par le système d'exploitation).
- Connexion internet (l'API Gemini Live est une API cloud).

> Gemini Live utilise le modèle `gemini-3.1-flash-live-preview` via l'API `v1alpha`. Ce modèle est distinct des modèles Gemini disponibles dans le chat texte.

## 2. Démarrer une conversation vocale

La **NotchBar** est la petite pill grise discrète affichée au centre du bord supérieur de la fenêtre (dans la barre de titre).

1. **Survolez** la NotchBar — elle s'étend et affiche le label "LIVE".
2. **Cliquez** pour démarrer la connexion.
3. L'indicateur passe en gris "CONNECTING…" pendant l'établissement de la session WebSocket.
4. Une fois connecté, la pill devient **bleue "LISTENING"** avec des barres de waveform animées dès que vous parlez.

## 3. Les états de la NotchBar

| Etat | Couleur | Signification |
|------|---------|---------------|
| **Off** | Grise minuscule | Inactif — cliquer pour démarrer |
| **Connecting** | Grise | Connexion en cours |
| **Connected** | Slate | Connecté, en attente de voix |
| **Listening** | Bleue + barres | Vous parlez, Gemini écoute |
| **Speaking** | Ambrée + barres | Gemini répond à voix haute |
| **Dormant** | Grise + pastille ambrée | Session fermée après 5 min d'inactivité |
| **Error** | Rouge | Erreur de connexion — vérifier la clé API |

## 4. Parler et interrompre

- Parlez naturellement — la détection d'activité vocale (VAD) est automatique.
- **Pour interrompre** Gemini pendant qu'il parle, parlez simplement. La lecture audio s'arrête immédiatement et Gemini écoute de nouveau.
- Des silences courts (< 500 ms) ne déclenchent pas la fin de votre tour — le VAD attend une pause franche.

## 5. Commandes vocales — contrôler l'application

Gemini Live peut contrôler Cruchot pendant la conversation. Vous pouvez demander à voix haute :

| Ce que vous dites (exemple) | Ce qui se passe |
|-----------------------------|-----------------|
| "Navigue vers les statistiques" | Cruchot ouvre la vue Statistiques |
| "Ouvre les paramètres MCP" | Cruchot va dans Personnaliser > MCP |
| "Change le modèle pour claude-sonnet" | Le modèle actif est mis à jour |
| "Ouvre/ferme le panneau droit" | Le right-panel est affiché ou masqué |
| "Envoie un prompt : résume ce projet" | Le texte est envoyé dans le chat actif |
| "Forke la conversation" | La conversation courante est dupliquée |
| "Quelles sont mes conversations récentes ?" | Gemini vous liste les conversations |
| "Ouvre Zed" / "Lance Gmail" | Ouvre l'application ou le site autorisé |
| "Quelles apps tu peux ouvrir ?" | Gemini liste les applications autorisées |

> **Note :** Gemini confirmera toujours avant d'envoyer un prompt dans votre nom (`send_prompt`).

## 5.1 Ouvrir des applications par la voix

Cruchot peut ouvrir des **applications locales** (ex: Zed, Terminal, Slack) et des **sites web** (ex: Gmail, GitHub) sur simple demande vocale — à condition qu'ils soient dans votre liste d'applications autorisées.

**Configurer les applications autorisées :**

1. Allez dans **Personnaliser > Applications**.
2. Cliquez sur **Ajouter**.
3. Choisissez le type : *Application locale* (chemin `.app`) ou *Site web* (URL HTTPS).
4. Renseignez le nom (tel que vous l'appellerez à voix haute), le chemin ou l'URL, et une description optionnelle pour aider la reconnaissance.

**Exemples de demandes vocales :**
- "Ouvre Zed"
- "Lance mon éditeur de code"
- "Ouvre Gmail"
- "Lance mes mails pro"

> Seules les applications présentes dans la liste autorisée peuvent être ouvertes. Aucune app non listée ne peut être lancée, même par erreur.

## 6. Mémoire des sessions vocales

Cruchot retient les faits importants évoqués pendant vos sessions vocales. À la fin de chaque session, l'IA extrait automatiquement les sujets abordés, les décisions prises et les informations partagées, puis les stocke dans sa mémoire.

**À la prochaine session**, les souvenirs des 7 derniers jours sont automatiquement injectés dans le contexte. Vous pouvez aussi demander vocalement :
- "Qu'est-ce qu'on avait discuté hier ?"
- "Tu te souviens de ce qu'on avait prévu pour le projet X ?"

> La mémoire vocale est stockée localement dans Qdrant (collection `live_memories`) — rien ne quitte votre machine.

## 6.1 Personnaliser l'assistant vocal

Vous pouvez configurer le comportement de l'assistant dans **Personnaliser > Audio Live** :

- **Modèle Live** : sélectionner le modèle vocal actif (Gemini 3.1 Flash Live, d'autres à venir).
- **Prompt Identité** : personnaliser la langue, le ton et la personnalité de l'agent vocal. Ce texte est injecté au début du system prompt à chaque connexion.

## 6.2 Partager votre écran pendant une session vocale

Cruchot permet à Gemini de **voir votre écran en temps réel** pendant une conversation vocale. L'agent peut ainsi commenter, analyser ou vous assister sur ce qui est affiché — une fenêtre, une application, ou l'intégralité de l'écran.

### Activer le partage d'écran

1. Démarrez une session vocale (la NotchBar doit être en état **Connected**, **Listening** ou **Speaking**).
2. Une **icône écran** (moniteur) apparaît à droite du label dans la NotchBar.
3. Cliquez dessus — un sélecteur de source s'affiche.
4. Choisissez un **écran entier** ou une **fenêtre applicative**.
5. Le partage démarre. L'icône passe en vert avec un point pulsant.

> La première utilisation du partage d'écran affiche un avertissement "macOS Screen Recording". Accordez la permission dans Préférences Système > Sécurité et confidentialité > Enregistrement d'écran, puis relancez.

### Pendant le partage

- Gemini reçoit des captures de votre écran en temps réel (environ 0–2 images/seconde selon l'activité).
- Si rien ne bouge à l'écran, **aucune image n'est envoyée** (détection automatique des changements).
- Vous pouvez demander vocalement à Gemini : "Regarde ce que je fais" ou "Qu'est-ce que tu vois ?"
- Gemini peut prendre un **screenshot haute qualité** si vous demandez plus de détail.

### Arrêter le partage

- **Cliquez à nouveau** sur l'icône écran (verte) dans la NotchBar.
- Fermer la fenêtre ou couper la session vocale stoppe également le partage automatiquement.

### Commandes vocales liées au partage

| Ce que vous dites | Ce qui se passe |
|-------------------|-----------------|
| "Pause le partage d'écran" | L'envoi de frames est suspendu (stream reste ouvert) |
| "Reprends le partage" | L'envoi de frames reprend |
| "Prends un screenshot" | Gemini capture une image haute qualité de l'écran |

### Confidentialité

- Les frames vidéo transitent **uniquement en RAM** — aucune image n'est écrite sur le disque.
- Le contenu visuel n'est pas loggé ni stocké dans la base de données locale.
- Le partage est **toujours déclenché explicitement** par l'utilisateur — jamais automatiquement.

## 7. Inactivité et reconnexion

Si aucune activité audio n'est détectée pendant **5 minutes**, la session est fermée automatiquement (état **Dormant**). La NotchBar affiche une pastille ambrée pour signaler cet état.

Pour reprendre, il suffit de **cliquer sur la NotchBar** — Cruchot se reconnecte.

## 8. Arrêter la conversation

Cliquez sur la NotchBar en état actif (Listening / Speaking / Connected) pour déconnecter et arrêter l'audio.

## 9. Dépannage

| Problème | Solution |
|----------|----------|
| La NotchBar reste en "CONNECTING..." | Vérifiez votre clé API Google dans Paramètres > Providers |
| L'état passe en "ERROR" | Clé API invalide ou pas de réseau — relancer après correction |
| Gemini ne vous entend pas | Vérifiez les permissions microphone macOS (Préférences Système > Sécurité > Microphone) |
| La voix de Gemini est robotique / saccadée | Latence réseau élevée — aucune action côté Cruchot |
| Gemini répète sa propre réponse | Problème résolu en v0.8.2 (anti-écho 3x). Si récurrent, déconnecter/reconnecter |
| L'icône écran n'apparaît pas | La session doit être connectée (état Connected, Listening ou Speaking) |
| Le SourcePicker s'ouvre mais rien ne démarre | Permission Screen Recording manquante — vérifier Préférences Système > Sécurité > Enregistrement d'écran |
| Gemini ne voit pas l'écran alors que le partage est actif | Vérifier que l'écran bouge — 0 frame envoyée si statique. Demander vocalement "prends un screenshot" |
