# Architecture : Multi-LLM Desktop

**Date** : 2026-03-09
**Statut** : Decide
**Contexte** : [FEATURES.md](./FEATURES.md) — ~495 fonctionnalites, 19 sections V1

## Probleme architectural

Application desktop locale de chat multi-LLM (7 providers cloud + OpenRouter + 2 providers locaux) avec generation d'images, recherche web, voix STT/TTS, bibliotheque de prompts, roles, projets, et statistiques de couts. Toutes les donnees restent sur la machine de l'utilisateur. Aucun serveur backend propre.

---

## Flux principal

```
[Utilisateur]
      |
      | saisit un message + selectionne modele
      v
[Zone B (UI)] ---- fichiers joints ----> [Filesystem local]
      |
      | IPC securise (invoke)
      v
[Process Host]
      |
      +---> [Credential Store] recupere cle API
      |
      +---> [Routeur interne] selectionne l'adapter
      |          |
      |     [Adapter provider] construit la requete specifique
      |          |
      |          +---> [API Provider] ou [Serveur local Ollama/LM Studio]
      |          |
      |          | stream SSE
      |          v
      |     [Normaliseur] unifie le format des chunks
      |          |
      +---> [DB] sauvegarde message user + message assistant
      |     +---> calcule tokens, cout, temps de reponse
      |     +---> met a jour les statistiques
      |
      | stream IPC (events)
      v
[Zone A (UI)]
      |
      +---> affiche les tokens en temps reel
      +---> met a jour les compteurs (tokens, cout, temps)
      +---> affiche l'image generee (si modele image)
      +---> affiche les sources (si modele recherche)
```

---

## Decisions architecturales

### Decision 1 : Separation des processus — Trust boundary

**Probleme** : L'application manipule des secrets (cles API) et fait des appels reseau. Ou placer la frontiere de confiance ?

**Options** :
- Option A : Tout dans un seul processus → Simple, mais les secrets sont accessibles depuis l'UI
- Option B : Deux processus avec bridge securise → Le process "host" detient les secrets et fait les appels, le process "UI" ne voit que les resultats

**Recommandation** : Option B — separation stricte Host / UI

**Raison** : Les cles API de 7+ providers representent un risque financier direct. Une faille XSS dans le rendu Markdown ne doit jamais exposer les cles. Le bridge securise est le seul point de passage, avec validation des deux cotes.

---

### Decision 2 : Couche d'abstraction LLM — Le "Routeur interne"

**Probleme** : 7 providers cloud + OpenRouter + 2 providers locaux, chacun avec son format de requete/reponse, ses erreurs, son streaming. Comment unifier sans creer un monstre ?

**Options** :
- Option A : Adapter par provider (1 module par provider, interface commune) → Controle total, mais maintenance N adapters
- Option B : Passer par OpenRouter pour tout → Simple, mais single point of failure, et les modeles locaux ne passent pas par OpenRouter
- Option C : Hybride — interface commune avec adapters, OpenRouter comme "un adapter parmi d'autres"

**Recommandation** : Option C — Hybride

**Raison** : L'utilisateur doit pouvoir choisir "cle directe" ou "via OpenRouter" par provider. Les modeles locaux (Ollama, LM Studio) ne passent jamais par un gateway cloud. L'interface commune normalise : requete unifiee en entree, stream unifie en sortie, erreurs normalisees.

**Implementation** : Le Vercel AI SDK (`ai` + `@ai-sdk/*`) fournit l'interface commune et les adapters. Plus besoin d'ecrire des adapters custom — le SDK normalise streaming, erreurs, thinking tokens, et usage pour tous les providers. Le routeur interne se reduit a un `getModel(provider, modelId)` qui retourne un `LanguageModel` du SDK.

```
                    +-----------------+
                    | Routeur interne |
                    |  (AI SDK Core)  |
                    +--------+--------+
                             |
          +------------------+------------------+
          |         |        |        |         |
     [@ai-sdk/ [@ai-sdk/ [@ai-sdk/ [@ai-sdk/  [Community
      openai]  anthropic] google]  openrouter]  ollama]
          |         |        |        |         |
       API directe  API    API    Gateway    Local
                                             HTTP
```

---

### Decision 3 : Modele de donnees — Messages polymorphes

**Probleme** : Un message peut contenir du texte, une image generee, un resultat de recherche web, ou un mix.

**Options** :
- Option A : Table messages unique avec champ `type` + JSON pour le contenu specifique
- Option B : Tables separees par type (text_messages, image_messages, search_messages)
- Option C : Table messages unique + table `message_parts` pour le contenu polymorphe

**Recommandation** : Option A — Table unique avec JSON

**Raison** : Pour une app desktop locale, la simplicite prime. Pas de concurrent access, pas de scaling. Le JSON dans une colonne `content_data` permet de stocker n'importe quel type sans migration de schema. Le typage est assure au niveau applicatif.

---

### Decision 4 : Stockage des donnees — Local-first

**Probleme** : Toutes les donnees doivent rester sur la machine. Quel type de stockage pour ~12 tables, des fichiers binaires, et des secrets ?

**Options** :
- Option A : Fichiers JSON sur disque
- Option B : Base relationnelle embarquee
- Option C : Base documents (LevelDB/PouchDB)

**Recommandation** : Option B — Base relationnelle embarquee

**Raison** : Les entites sont clairement relationnelles (projets → conversations → messages). La recherche full-text est un besoin V1 critique. Les statistiques necessitent des aggregations SQL. Les fichiers binaires sont stockes sur le filesystem avec reference en DB.

```
~/AppData/MultiLLM/
  +-- db/
  |   +-- main.db          (base relationnelle)
  |   +-- main.db-wal       (write-ahead log)
  +-- backups/
  |   +-- 2026-03-09.db
  +-- attachments/
  |   +-- {uuid}.pdf
  +-- images/
  |   +-- {uuid}.png
  +-- exports/
```

---

### Decision 5 : Streaming et flux temps reel

**Probleme** : Les reponses LLM arrivent token par token. L'UI doit les afficher en temps reel ET permettre l'annulation.

**Options** :
- Option A : Le host accumule tout et envoie la reponse complete
- Option B : Le host forward chaque chunk via canal unidirectionnel
- Option C : Canal bidirectionnel (chunks + annulation)

**Recommandation** : Option C — Canal bidirectionnel

**Raison** : L'utilisateur doit pouvoir annuler (bouton Stop) pendant le streaming. L'etat partiel est accumule cote UI dans un buffer de message en construction.

```
[UI] --invoke("send-message", payload)--> [Host]
[Host] --stream("chunk", {token, meta})--> [UI]    (x N)
[UI] --invoke("cancel-stream")--> [Host]            (optionnel)
[Host] --stream("done", {usage, cost})--> [UI]
```

---

### Decision 6 : Gestion des erreurs et resilience

**Probleme** : 9+ endpoints externes, chacun peut tomber, rate-limiter, ou retourner des erreurs specifiques.

**Options** :
- Option A : Erreur = message d'erreur dans le chat, c'est tout
- Option B : Retry automatique + fallback + notification
- Option C : Classification des erreurs (transitoire vs fatale) avec comportement adapte

**Recommandation** : Option C — Classification

**Raison** : Une 429 est transitoire → retry automatique. Une 401 est fatale → notification. Une 402 est actionnable → notification avec lien. L'utilisateur ne voit que les erreurs qui necessitent son action.

```
Erreur API
  +-- Transitoire (429, 500, 503, timeout, reseau)
  |     → Retry automatique (backoff exponentiel + jitter, max 3)
  |     → Puis notification si echec
  +-- Fatale (401, 403)
  |     → Notification immediate + suggestion d'action
  +-- Actionnable (402 credits, modele deprecie)
        → Notification avec action (ajouter credits, changer modele)
```

---

### Decision 7 : Recherche full-text

**Probleme** : Recherche dans toutes les conversations (potentiellement des milliers).

**Options** :
- Option A : LIKE '%terme%' en SQL
- Option B : FTS integre a la base relationnelle
- Option C : Index de recherche externe (Lunr.js, MiniSearch)

**Recommandation** : Option B — FTS integre

**Raison** : La base choisie supporte nativement le FTS avec tokenization, stemming, ranking. Zero dependance supplementaire. L'index porte sur messages.content + conversations.title.

---

### Decision 8 : Architecture de la couche voix (STT/TTS)

**Probleme** : La voix implique des APIs tierces couteuses avec un fallback navigateur gratuit.

**Options** :
- Option A : Tout dans le process UI (Web Speech API natif)
- Option B : Tout dans le process host (APIs cloud)
- Option C : Cascade — tenter le cloud, fallback sur navigateur

**Recommandation** : Option C — Cascade avec fallback

**Raison** : L'utilisateur configure son provider prefere. Si le cloud echoue (pas de cle, pas de reseau), fallback automatique. Le flux audio est capture dans l'UI (acces micro), transmis au host pour transcription cloud si configure.

```
STT : [Micro UI] → buffer audio → [Host: cloud STT] ou [UI: Web Speech API]
TTS : [Host: cloud TTS] → buffer audio → [UI: playback] ou [UI: Web Speech API]
```

---

### Decision 9 : Export/Import et interoperabilite

**Probleme** : Export en plusieurs formats (JSON, MD, PDF) et import depuis d'autres apps.

**Options** :
- Option A : Format interne proprietaire
- Option B : Formats standards par type d'export
- Option C : Format interne JSON + transformateurs vers formats cibles

**Recommandation** : Option C — Format interne + transformateurs

**Raison** : Le format interne JSON est le format de reference (complet, reversible). Les transformateurs vers MD, PDF, TXT, HTML sont des fonctions pures. L'import depuis ChatGPT/Claude est un transformateur inverse.

```
[DB] → [JSON interne] → [Transformateur MD/PDF/HTML/TXT]
[fichier_externe.json] → [Transformateur import] → [JSON interne] → [DB]
```

---

### Decision 10 : Statistiques et calcul des couts

**Probleme** : Chaque message a un cout. Les stats doivent etre aggregeables par periode, provider, modele, projet.

**Options** :
- Option A : Calcul a la volee sur les messages
- Option B : Table de statistiques pre-aggregees
- Option C : Hybride — pre-aggregation par jour + volee pour aujourd'hui

**Recommandation** : Option C — Hybride

**Raison** : Les stats des jours passes ne changent plus → pre-aggregees, lues instantanement. Le jour en cours est calcule a la volee (peu de donnees). Consolidation au demarrage de l'app.

---

## Contraintes pour le choix de stack

- Doit tourner comme **application desktop native** avec acces filesystem, Keychain, et notifications systeme
- Doit supporter un **modele 2 processus** (host securise + UI isolee) avec communication bidirectionnelle
- Doit embarquer une **base relationnelle avec FTS** sans serveur externe
- Doit supporter le **streaming SSE** cote client pour les reponses LLM
- Doit pouvoir **capturer le micro** et jouer de l'audio dans le process UI
- Doit **generer du PDF** cote client (export)
- Doit rendre du **Markdown riche** avec coloration syntaxique, LaTeX, Mermaid, tableaux
- Doit supporter l'**i18n** (francais/anglais minimum)
- Doit supporter le **theming** (clair/sombre/custom) sans rechargement
- Doit supporter les **raccourcis clavier personnalisables**
- Doit pouvoir **auto-updater** l'application sans store (distribution directe)
- Doit tourner sur **macOS** (prioritaire), Windows et Linux souhaitables a terme
- Doit supporter des **listes longues** (1000+ messages) sans degradation de performance
- **Aucun serveur backend propre** — tout est local ou appel direct aux APIs tierces

---

## Risques architecturaux

| Risque | Probabilite | Impact | Mitigation |
|--------|-------------|--------|------------|
| Changement d'API d'un provider (breaking change) | Eleve | Moyen | Vercel AI SDK absorbe les breaking changes des providers. Un seul package a mettre a jour. |
| Corruption de la base locale | Faible | Eleve | WAL mode, backups automatiques quotidiens, backup avant update |
| Fuite de cle API via faille XSS dans le rendu Markdown | Moyen | Eleve | Cles jamais dans le process UI. Sanitization du HTML. CSP stricte. |
| Performance degradee sur conversations tres longues (10k+ msg) | Moyen | Moyen | Virtualisation des listes, buffer en memoire, troncature optionnelle |
| Cout imprevu (appels API non maitrises) | Moyen | Moyen | Compteur de tokens pre-envoi, alertes de cout, confirmation si > seuil |
| Provider local (Ollama) non demarre | Eleve | Faible | Detection au demarrage, message clair, pas de crash |
| Rate limiting simultane sur plusieurs providers | Faible | Moyen | File d'attente par provider, retry independant |
| Taille de la DB locale qui explose (images, PJ) | Moyen | Moyen | Images sur filesystem (pas en DB), alerte espace disque, nettoyage |
| Desynchronisation des stats pre-aggregees | Faible | Faible | Recalcul au demarrage, bouton "recalculer" dans settings |

---

## Hors scope architectural

- Pas de serveur backend propre (pas de SaaS, pas de BaaS)
- Pas de multi-utilisateur en V1 (collaboration = export/import de fichiers)
- Pas de RAG/vectorstore en V1 (backlog V2)
- Pas d'agents autonomes / tool use en V1
- Pas de modele de facturation (l'app est gratuite, l'utilisateur paie ses propres cles API)
- Pas de marketplace de plugins en V1
- Pas d'application mobile
