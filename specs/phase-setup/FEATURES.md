# Multi-LLM Desktop — Liste Exhaustive des Fonctionnalites

> Document de reference — Version 1.0
> Chaque fonctionnalite est categorisee par couche : UI visible, logique metier, infrastructure technique, donnees, securite.

---

## 1. GESTION DES PROVIDERS & MODELES

### 1.1 Configuration des cles API
- [ ] Ecran de configuration des cles API par provider
- [ ] Providers supportes : OpenAI, Anthropic, Google (Gemini), xAI (Grok), Perplexity, Mistral, **OpenRouter**
- [ ] Validation de cle API en temps reel (appel test au endpoint)
- [ ] Indicateur visuel de statut par cle (valide / invalide / expiree)
- [ ] Stockage securise des cles (Electron safeStorage / Keychain macOS)
- [ ] Masquage des cles dans l'UI (affichage partiel sk-*****)
- [ ] Import/export des cles (fichier chiffre)
- [ ] Support des cles avec organisation/projet (OpenAI org ID, Anthropic workspace)
- [ ] Detection automatique des quotas/limites par cle
- [ ] Gestion de cles multiples par provider (perso / pro)

### 1.1b OpenRouter — Provider unifie (gateway)
- [ ] Cle API OpenRouter (format sk-or-v1-xxx, 128 chars)
- [ ] Endpoint unique : https://openrouter.ai/api/v1/
- [ ] Compatible OpenAI SDK (changement de baseURL uniquement)
- [ ] SDK natif disponible (@openrouter/sdk)
- [ ] Acces a 400+ modeles via une seule cle
- [ ] Detection et listing automatique des modeles disponibles (GET /api/v1/models)
- [ ] Affichage des metadonnees par modele (pricing, context window, capabilities, tokenizer)
- [ ] Suivi du solde de credits en temps reel (GET /api/v1/key)
- [ ] Alerte quand le solde de credits est faible
- [ ] Auto-routing intelligent (model "openrouter/auto" — selection automatique du meilleur modele)
- [ ] Fallback automatique entre modeles (liste ordonnee de modeles de secours)
- [ ] Preferences de provider (tri par prix, latence, throughput)
- [ ] Raccourcis de routing (:nitro pour throughput, :floor pour prix mini)
- [ ] Zero Data Retention (option ZDR — aucun stockage des prompts)
- [ ] Indicateur du modele effectivement utilise dans la reponse (response.model)
- [ ] Support streaming SSE complet avec annulation (AbortController)
- [ ] Gestion des erreurs specifiques (402 credits insuffisants, 403 moderation, 408 timeout)
- [ ] Headers HTTP recommandes (HTTP-Referer, X-OpenRouter-Title)
- [ ] Rate limiting : headers X-RateLimit-Remaining / X-RateLimit-Reset
- [ ] Mode debug (echo_upstream_body pour voir la requete transformee)
- [ ] Choix : utiliser OpenRouter OU les cles directes par provider (ou les deux)

### 1.2 Selection de modele
- [ ] Dropdown de selection de modele dans la zone de saisie (Zone B)
- [ ] 3 categories de modeles :
  - **Texte** : GPT-4o, GPT-4o-mini, o1, o3, o4-mini, Claude Opus, Sonnet, Haiku, Gemini Pro, Flash, Grok, Mistral Large/Medium/Small, Codestral
  - **Image** : Gemini 3.1 Flash Image, Gemini 3 Pro Image
  - **Recherche** : Perplexity Sonar, Sonar Pro, Sonar Reasoning, Sonar Reasoning Pro
- [ ] Affichage du nom du modele sur chaque message dans la conversation
- [ ] Switch de modele en cours de conversation (mid-conversation)
- [ ] Indicateur visuel du modele actif
- [ ] Modele par defaut configurable (par categorie)
- [ ] Favoris de modeles (epingler les plus utilises)
- [ ] Affichage des specs du modele (context window, prix input/output, capabilities)
- [ ] Detection automatique des modeles disponibles par provider via API
- [ ] Gestion des modeles deprecies (alerte + suggestion de remplacement)

### 1.3 Parametres avances par modele
- [ ] Temperature (slider 0-2)
- [ ] Max tokens de sortie
- [ ] Top-P (nucleus sampling)
- [ ] Frequency penalty / Presence penalty (OpenAI)
- [ ] Stop sequences personnalisees
- [ ] Seed pour reproductibilite
- [ ] Presets de parametres (creatif, precis, equilibre)
- [ ] Parametres par defaut configurables par modele
- [ ] Mode JSON / Structured Output (quand supporte)
- [ ] Extended Thinking (Anthropic) — activer/desactiver + budget tokens

---

## 2. CONVERSATIONS

### 2.1 Creer une conversation
- [ ] Bouton "Nouvelle conversation"
- [ ] Raccourci clavier (Cmd+N)
- [ ] Titre auto-genere a partir du premier message
- [ ] Renommer une conversation
- [ ] Icone/emoji personnalisable par conversation
- [ ] Assigner a un projet (optionnel)
- [ ] Selection du modele initial
- [ ] Selection d'un role/persona (optionnel)
- [ ] Application d'un prompt systeme personnalise

### 2.2 Zone de chat (Zone A)
- [ ] Affichage des messages utilisateur (alignes a droite ou avec avatar)
- [ ] Affichage des messages LLM (alignes a gauche avec avatar du provider)
- [ ] Nom du modele affiche sur chaque reponse
- [ ] Badge/icone du provider sur chaque message
- [ ] Phase de raisonnement (thinking) affichable/masquable
- [ ] Formatage riche des reponses :
  - Gras, italique, souligne
  - Listes a puces et numerotees
  - Tableaux
  - Blocs de code avec coloration syntaxique
  - Citations / blockquotes
  - Notes / callouts (info, warning, error)
  - Formules mathematiques (LaTeX/KaTeX)
  - Mermaid diagrams (inline rendering)
  - Liens cliquables
- [ ] Tokens d'entree / sortie / cache affiches par message
- [ ] Cout estime par message (en $ ou EUR)
- [ ] Temps de reponse en secondes
- [ ] Copier un message dans le clipboard
- [ ] Copier le code d'un bloc de code
- [ ] Lecture audio TTS d'une reponse (bouton play)
- [ ] Regenerer une reponse (re-envoyer le meme prompt)
- [ ] Regenerer avec un autre modele
- [ ] Editer un message envoye et re-generer
- [ ] Supprimer un message individuel
- [ ] Resume automatique de la conversation (bouton)
- [ ] Export du message individuel en Markdown
- [ ] Reaction/note sur un message (bookmark, favori)
- [ ] Branching : creer une branche alternative a partir d'un message
- [ ] Streaming en temps reel (affichage token par token)
- [ ] Indicateur "en cours de generation" (typing indicator)
- [ ] Bouton Stop pour interrompre la generation
- [ ] Scroll automatique vers le bas pendant la generation
- [ ] Bouton "scroll to bottom" quand on remonte dans l'historique
- [ ] Recherche dans la conversation courante (Cmd+F)
- [ ] Selection de texte + copie
- [ ] Zoom sur les images generees (lightbox)
- [ ] Affichage inline des images generees

### 2.3 Zone de saisie (Zone B)
- [ ] Zone de texte extensible (auto-grow)
- [ ] Placeholder dynamique selon le modele selectionne
- [ ] Selection de modele texte (dropdown)
- [ ] Selection de modele image (dropdown)
- [ ] Selection de modele recherche (dropdown)
- [ ] Bouton "Ameliorer le prompt" (optimisation magique)
- [ ] Bouton pieces jointes (fichiers, images)
- [ ] Drag & drop de fichiers dans la zone
- [ ] Coller une image depuis le clipboard (Cmd+V)
- [ ] Bouton STT (Speech-to-Text) — dictee vocale
- [ ] Indicateur d'enregistrement vocal (waveform)
- [ ] Bouton Envoyer (et raccourci Enter / Cmd+Enter configurable)
- [ ] Selection de prompt depuis la bibliotheque
- [ ] Selection de complement de prompt
- [ ] Compteur de tokens en temps reel (estimation avant envoi)
- [ ] Historique des messages envoyes (fleche haut pour naviguer)
- [ ] Mentions de fichiers attaches avec preview
- [ ] Multi-ligne avec Shift+Enter
- [ ] Raccourcis de formatage (Cmd+B gras, Cmd+I italique, etc.)
- [ ] Templates de prompt rapides (/)

### 2.4 Gestion des conversations
- [ ] Liste des conversations dans la sidebar
- [ ] Tri par date, nom, projet
- [ ] Recherche parmi les conversations (full-text search)
- [ ] Filtrer par projet
- [ ] Filtrer par modele utilise
- [ ] Filtrer par date (aujourd'hui, cette semaine, ce mois)
- [ ] Supprimer une conversation
- [ ] Supprimer en lot (selection multiple)
- [ ] Archiver une conversation
- [ ] Epingler une conversation en haut
- [ ] Deplacer vers un projet
- [ ] Dupliquer une conversation
- [ ] Fusionner des conversations

### 2.5 Export / Import de conversations
- [ ] Export individuel en Markdown (.md)
- [ ] Export individuel en PDF
- [ ] Export d'un resume de conversation
- [ ] Export en lot (selection multiple)
- [ ] Export total (toutes les conversations)
- [ ] Formats d'export : MD, PDF, JSON, TXT, HTML
- [ ] Import de conversations (JSON)
- [ ] Import depuis d'autres apps (ChatGPT export, Claude export)
- [ ] Choix du contenu a exporter (messages seulement, avec metadata, avec images)

---

## 3. PROJETS

### 3.1 Gestion des projets
- [ ] Creer un projet (nom, description, icone/couleur)
- [ ] Modifier un projet (nom, description, icone)
- [ ] Supprimer un projet (avec confirmation)
- [ ] Archiver un projet
- [ ] Liste des projets dans la sidebar
- [ ] Projet par defaut (conversations non assignees)
- [ ] Compteur de conversations par projet
- [ ] Derniere activite par projet
- [ ] Tri des projets (alpha, date, activite)
- [ ] Recherche parmi les projets

### 3.2 Contexte de projet
- [ ] Instructions systeme par projet (prompt systeme persistant)
- [ ] Fichiers de contexte attaches au projet (knowledge base)
- [ ] Modele par defaut par projet
- [ ] Role par defaut par projet
- [ ] Parametres de modele par defaut par projet
- [ ] Tags/categories par projet

### 3.3 Export/Import de projets
- [ ] Export complet d'un projet (conversations + config + fichiers)
- [ ] Import d'un projet
- [ ] Partage de projet (fichier exportable)

---

## 4. BIBLIOTHEQUE DE PROMPTS

### 4.1 Gestion des prompts
- [ ] Creer un prompt (titre, contenu, categorie, tags)
- [ ] Modifier un prompt
- [ ] Supprimer un prompt
- [ ] Dupliquer un prompt
- [ ] Categories personnalisables (dev, marketing, redaction, analyse...)
- [ ] Tags libres sur les prompts
- [ ] Recherche dans la bibliotheque (titre + contenu)
- [ ] Filtrer par categorie/tag
- [ ] Tri (alpha, date creation, frequence d'utilisation)
- [ ] Favoris / epingler des prompts
- [ ] Compteur d'utilisation par prompt

### 4.2 Types de prompts
- [ ] Prompts complets (remplace le message)
- [ ] Complements de prompts (s'ajoute au message — prefixe ou suffixe)
- [ ] Prompts avec variables ({{nom}}, {{sujet}}) — remplacement dynamique
- [ ] Prompts systeme (utilises comme instructions de conversation)

### 4.3 Utilisation
- [ ] Insertion rapide depuis la zone de saisie (bouton ou raccourci /)
- [ ] Preview du prompt avant insertion
- [ ] Formulaire de saisie des variables
- [ ] Historique des prompts recemment utilises

### 4.4 Import/Export
- [ ] Export de la bibliotheque complete (JSON)
- [ ] Export d'un prompt individuel
- [ ] Import de prompts (JSON)
- [ ] Import en lot

---

## 5. ROLES / PERSONAS

### 5.1 Gestion des roles
- [ ] Creer un role (nom, description, prompt systeme, avatar)
- [ ] Modifier un role
- [ ] Supprimer un role
- [ ] Dupliquer un role
- [ ] Roles pre-definis (Developpeur, Redacteur, Analyste, Traducteur, Coach...)
- [ ] Roles personnalises illimites
- [ ] Categories de roles

### 5.2 Optimisation des roles
- [ ] Optimisation automatique du prompt de role (bouton "ameliorer")
- [ ] Preview du comportement du role (message test)
- [ ] Version historique du role (revenir a une version precedente)

### 5.3 Application
- [ ] Selectionner un role au demarrage d'une conversation
- [ ] Changer de role en cours de conversation
- [ ] Role par defaut par projet
- [ ] Indicateur visuel du role actif

### 5.4 Import/Export
- [ ] Export d'un role (JSON)
- [ ] Export de tous les roles
- [ ] Import de roles (JSON)
- [ ] Partage de roles (fichier exportable)

---

## 6. PIECES JOINTES & FICHIERS

### 6.1 Upload de fichiers
- [ ] Bouton d'ajout de fichier dans Zone B
- [ ] Drag & drop dans la zone de chat
- [ ] Coller une image depuis le clipboard
- [ ] Types supportes : PDF, DOCX, TXT, CSV, XLSX, JSON, XML, images (JPG, PNG, GIF, WebP, SVG), code source
- [ ] Limite de taille par fichier (configurable, defaut 30 MB)
- [ ] Limite du nombre de fichiers par message (configurable)
- [ ] Preview des fichiers avant envoi (miniature image, nom fichier)
- [ ] Suppression d'une piece jointe avant envoi
- [ ] Barre de progression de l'upload
- [ ] Compression automatique des images trop grandes

### 6.2 Traitement des fichiers
- [ ] Extraction de texte des PDF (OCR si necessaire)
- [ ] Analyse d'images (vision multimodale)
- [ ] Parsing de fichiers structurees (CSV, JSON, XLSX)
- [ ] Preview inline des images dans le chat
- [ ] Telechargement des fichiers attaches

---

## 7. GENERATION D'IMAGES

### 7.1 Modeles d'images
- [ ] Google Gemini 3.1 Flash Image Preview (gemini-3.1-flash-image-preview) — rapide/economique
- [ ] Google Gemini 3 Pro Image Preview (gemini-3-pro-image-preview) — qualite superieure
- [ ] Selection du modele image dans Zone B

### 7.2 Parametres de generation
- [ ] Prompt de generation (texte libre)
- [ ] Taille de l'image (1024x1024, 1792x1024, 1024x1792, etc.)
- [ ] Qualite (standard, HD)
- [ ] Style (naturel, vivid) — selon provider
- [ ] Nombre d'images a generer (1-4)
- [ ] Seed pour reproductibilite (si supporte)

### 7.3 Affichage et actions
- [ ] Affichage inline dans le chat
- [ ] Zoom / lightbox plein ecran
- [ ] Telecharger l'image (PNG, JPG)
- [ ] Copier l'image dans le clipboard
- [ ] Re-generer avec le meme prompt
- [ ] Varier (generer des variantes)
- [ ] Historique des images generees
- [ ] Galerie d'images (vue grille)

---

## 8. RECHERCHE WEB

### 8.1 Modeles de recherche
- [ ] Perplexity Sonar
- [ ] Perplexity Sonar Pro
- [ ] Perplexity Sonar Reasoning
- [ ] Perplexity Sonar Reasoning Pro
- [ ] Selection dans Zone B

### 8.2 Fonctionnalites
- [ ] Requete de recherche depuis le chat
- [ ] Affichage des sources/citations dans la reponse (avec numeros de reference)
- [ ] Liens cliquables vers les sources
- [ ] Indicateur visuel "recherche web" sur le message
- [ ] Mode recherche active/desactive par conversation
- [ ] Preview des liens sources (titre, favicon, extrait)
- [ ] Nombre de sources affiche
- [ ] Fiabilite/pertinence des sources (score si disponible)

---

## 9. VOIX — DICTEE & LECTURE

### 9.1 Speech-to-Text (STT) — Dictee vocale
- [ ] Bouton microphone dans Zone B
- [ ] Enregistrement avec indicateur visuel (waveform animee)
- [ ] Transcription en temps reel (affichage progressif)
- [ ] Choix du provider STT :
  - Deepgram Nova-3 (recommande)
  - OpenAI Whisper
  - Web Speech API (fallback navigateur)
- [ ] Selection de la langue de dictee
- [ ] Annuler l'enregistrement
- [ ] Envoi automatique apres la dictee (optionnel)
- [ ] Raccourci clavier pour activer/desactiver

### 9.2 Text-to-Speech (TTS) — Lecture audio
- [ ] Bouton lecture sur chaque reponse LLM
- [ ] Choix du provider TTS :
  - ElevenLabs (haute qualite)
  - OpenAI TTS (TTS-1, TTS-1-HD)
  - Web Speech API (fallback)
- [ ] Selection de la voix
- [ ] Vitesse de lecture (0.5x - 2x)
- [ ] Pause / Reprendre / Stop
- [ ] Lecture continue (enchainer les messages)
- [ ] Barre de progression de lecture
- [ ] Volume (controle dedie ou systeme)
- [ ] Raccourci clavier play/pause

---

## 10. OPTIMISATION DE PROMPTS

### 10.1 Amelioration magique
- [ ] Bouton "Ameliorer" dans Zone B
- [ ] Re-ecriture du prompt pour plus de clarte, precision, structure
- [ ] Preview avant/apres (diff)
- [ ] Choix du niveau d'amelioration (leger, moyen, agressif)
- [ ] Annuler l'amelioration (revenir au prompt original)
- [ ] LLM utilise pour l'amelioration configurable

### 10.2 Suggestions
- [ ] Suggestions de prompts de suivi (apres une reponse)
- [ ] Auto-completion de prompts (predictive)
- [ ] Correction orthographique dans la zone de saisie

---

## 11. STATISTIQUES & ANALYTICS

### 11.1 Dashboard de statistiques
- [ ] Cout total (par periode : jour, semaine, mois, custom)
- [ ] Cout par provider
- [ ] Cout par modele
- [ ] Cout par projet
- [ ] Cout par categorie (texte, image, recherche, TTS, STT)
- [ ] Nombre de conversations (par periode)
- [ ] Nombre de messages envoyes / recus
- [ ] Tokens consommes (entree / sortie / cache)
- [ ] Tokens par provider / modele
- [ ] Temps de reponse moyen par modele
- [ ] Modeles les plus utilises (classement)
- [ ] Evolution dans le temps (graphiques)
- [ ] Images generees (nombre, cout)

### 11.2 Graphiques et visualisations
- [ ] Graphique d'evolution des couts dans le temps
- [ ] Repartition par provider (camembert)
- [ ] Repartition par modele (barres)
- [ ] Heatmap d'utilisation (jours/heures)
- [ ] Top prompts utilises
- [ ] Tendances d'utilisation

### 11.3 Export
- [ ] Export des statistiques en CSV
- [ ] Export en PDF (rapport)
- [ ] Periode personnalisable

---

## 12. INTERFACE UTILISATEUR

### 12.1 Layout general
- [ ] Sidebar gauche (projets, conversations, navigation)
- [ ] Zone centrale (chat — Zone A + Zone B)
- [ ] Panel lateral droit optionnel (details, settings contextuels)
- [ ] Header avec titre de conversation + actions
- [ ] Footer avec Zone B (saisie)

### 12.2 Sidebar
- [ ] Liste des projets (pliable)
- [ ] Liste des conversations (par projet ou global)
- [ ] Barre de recherche
- [ ] Bouton "Nouvelle conversation"
- [ ] Acces rapide : Bibliotheque de prompts, Roles, Statistiques, Settings
- [ ] Sidebar retractable (Cmd+\)
- [ ] Redimensionnable
- [ ] Compteurs (non lus, en cours)
- [ ] Drag & drop pour reorganiser

### 12.3 Theming et apparence
- [ ] Theme clair
- [ ] Theme sombre
- [ ] Theme systeme (auto)
- [ ] Themes personnalises (couleurs primaires, secondaires)
- [ ] Taille de police configurable
- [ ] Police configurable (monospace pour le code)
- [ ] Densite d'affichage (compact, normal, confortable)
- [ ] Largeur du chat configurable (centree, pleine largeur)
- [ ] Animations activables/desactivables

### 12.4 Raccourcis clavier
- [ ] Cmd+N : Nouvelle conversation
- [ ] Cmd+\ : Toggle sidebar
- [ ] Cmd+F : Recherche dans la conversation
- [ ] Cmd+Shift+F : Recherche globale
- [ ] Cmd+K : Palette de commandes (command palette)
- [ ] Cmd+, : Parametres
- [ ] Cmd+E : Export conversation
- [ ] Echap : Annuler la generation en cours
- [ ] Haut/Bas : Naviguer dans l'historique de saisie
- [ ] Raccourcis personnalisables (fichier keybindings)

### 12.5 Accessibilite
- [ ] Navigation clavier complete
- [ ] Lecteur d'ecran compatible (ARIA labels)
- [ ] Contraste suffisant (WCAG AA)
- [ ] Focus visible sur tous les elements interactifs
- [ ] Taille de police ajustable
- [ ] Reduction des animations (prefers-reduced-motion)

### 12.6 Notifications
- [ ] Notification de fin de generation (si app en arriere-plan)
- [ ] Notification d'erreur API
- [ ] Notification de cle API expiree/invalide
- [ ] Badge sur l'icone dock (macOS)
- [ ] Son de notification (configurable)

### 12.7 Internationalisation (i18n)
- [ ] Francais
- [ ] Anglais
- [ ] Detection automatique de la langue systeme
- [ ] Changement de langue dans les parametres

---

## 13. SECURITE

### 13.1 Stockage des secrets
- [ ] Cles API stockees dans Electron safeStorage (chiffre via Keychain macOS)
- [ ] Jamais de cle en clair dans les fichiers de config
- [ ] Jamais de cle dans le renderer process
- [ ] Chiffrement de la base de donnees locale (optionnel)

### 13.2 Architecture securisee
- [ ] Toutes les requetes API depuis le Main process uniquement
- [ ] contextIsolation active
- [ ] nodeIntegration desactive
- [ ] Content Security Policy (CSP) stricte
- [ ] Validation de tous les inputs IPC
- [ ] Sanitization du HTML rendu (protection XSS)
- [ ] Pas d'eval() ni de code dynamique

### 13.3 Donnees utilisateur
- [ ] Toutes les donnees stockees localement (pas de serveur tiers)
- [ ] Aucune telemetrie sans consentement
- [ ] Option de purge complete des donnees
- [ ] Pas de tracking analytics externe

### 13.4 Reseau
- [ ] HTTPS uniquement pour les appels API
- [ ] Certificat pinning (optionnel)
- [ ] Timeout sur les requetes
- [ ] Pas de requete reseau non explicite

---

## 14. STOCKAGE & DONNEES

### 14.1 Base de donnees locale
- [ ] SQLite via better-sqlite3
- [ ] WAL mode pour performances
- [ ] Schema versionne avec migrations
- [ ] Backup automatique periodique
- [ ] Backup avant mise a jour
- [ ] Restauration depuis backup

### 14.2 Tables principales
- [ ] providers (id, name, api_key_ref, status, config)
- [ ] models (id, provider_id, name, type, capabilities, pricing)
- [ ] projects (id, name, description, icon, color, system_prompt, default_model, created_at, updated_at, archived)
- [ ] conversations (id, project_id, title, model_id, role_id, created_at, updated_at, pinned, archived)
- [ ] messages (id, conversation_id, role, content, model_id, tokens_in, tokens_out, tokens_cache, cost, response_time_ms, created_at)
- [ ] attachments (id, message_id, type, path, name, size, mime_type)
- [ ] prompts (id, title, content, category, tags, type, variables, usage_count, created_at, updated_at)
- [ ] roles (id, name, description, system_prompt, avatar, category, created_at, updated_at)
- [ ] settings (key, value)
- [ ] statistics (id, date, provider_id, model_id, project_id, category, tokens_in, tokens_out, cost, request_count)
- [ ] images (id, message_id, prompt, provider, model, url, local_path, params, created_at)

### 14.3 Fichiers locaux
- [ ] Repertoire de donnees : ~/Library/Application Support/MultiLLM/
- [ ] Sous-repertoires : db/, backups/, attachments/, images/, exports/
- [ ] Nettoyage periodique des fichiers temporaires
- [ ] Gestion de l'espace disque (alerte si > X Go)

---

## 15. INFRASTRUCTURE TECHNIQUE

### 15.1 Architecture Electron
- [ ] Main process : API calls, DB, securite, fichiers
- [ ] Renderer process : UI React uniquement
- [ ] Preload script : bridge IPC securise (contextBridge)
- [ ] IPC handlers types et valides

### 15.2 Communication avec les LLM
- [ ] Couche d'abstraction unifiee (Vercel AI SDK)
- [ ] Streaming SSE pour toutes les reponses texte
- [ ] Gestion des erreurs par provider (codes specifiques)
- [ ] Retry avec backoff exponentiel + jitter
- [ ] Rate limiting respecte (headers Retry-After)
- [ ] Timeout configurable par requete
- [ ] Annulation de requete (AbortController)
- [ ] File d'attente des requetes (eviter les requetes paralleles non voulues)
- [ ] Fallback automatique vers un modele secondaire (optionnel)
- [ ] Normalisation des reponses (format unifie interne)

### 15.3 SDKs et clients API
- [ ] `ai` (npm) — Vercel AI SDK Core (streamText, generateImage, generateObject)
- [ ] `@ai-sdk/openai` — OpenAI provider
- [ ] `@ai-sdk/anthropic` — Anthropic provider (Extended Thinking natif)
- [ ] `@ai-sdk/google` — Google Gemini provider (chat + image generation)
- [ ] `@ai-sdk/mistral` — Mistral provider
- [ ] `@ai-sdk/xai` — xAI Grok provider
- [ ] `@ai-sdk/openrouter` — OpenRouter provider
- [ ] `createOpenAICompatible()` — Perplexity, LM Studio (via AI SDK)
- [ ] Community provider — Ollama
- [ ] Deepgram SDK (@deepgram/sdk) — STT
- [ ] ElevenLabs SDK — TTS
- [ ] Web Speech API — fallback STT/TTS

### 15.4 Performance
- [ ] Virtualisation des longues listes de messages (react-window ou react-virtualized)
- [ ] Lazy loading des composants lourds (code splitting)
- [ ] Buffer de messages en memoire (cap a N messages visibles)
- [ ] Debounce sur la recherche et le compteur de tokens
- [ ] Mise en cache des reponses de l'API models list
- [ ] Compression des images attachees avant stockage
- [ ] Garbage collection des conversations archivees

### 15.5 Mise a jour automatique
- [ ] electron-updater (via GitHub Releases ou S3)
- [ ] Verification periodique des mises a jour
- [ ] Notification de mise a jour disponible
- [ ] Telechargement en arriere-plan
- [ ] Installation au prochain demarrage
- [ ] Changelog affiche a l'utilisateur
- [ ] Rollback en cas d'echec

### 15.6 Gestion hors-ligne
- [ ] Detection de l'etat de connexion
- [ ] File d'attente des messages hors-ligne
- [ ] Re-envoi automatique a la reconnexion
- [ ] Indicateur visuel "hors-ligne"
- [ ] Acces a l'historique hors-ligne (donnees locales)
- [ ] Mode lecture seule hors-ligne

---

## 16. FONCTIONNALITES TRANSVERSALES

### 16.1 Palette de commandes (Command Palette)
- [ ] Cmd+K pour ouvrir
- [ ] Recherche fuzzy dans : conversations, projets, prompts, roles, commandes
- [ ] Actions rapides (nouvelle conversation, changer de modele, ouvrir settings...)
- [ ] Navigation clavier
- [ ] Raccourcis affiches a cote des commandes

### 16.2 Onboarding / Premier lancement
- [ ] Assistant de configuration initiale
- [ ] Saisie des cles API provider par provider
- [ ] Selection du theme
- [ ] Import depuis une autre app (optionnel)
- [ ] Conversation de demo
- [ ] Tooltips sur les fonctionnalites cles

### 16.3 Gestion des erreurs
- [ ] Messages d'erreur clairs et actionnables
- [ ] Erreurs API : affichage du code + message + suggestion
- [ ] Retry automatique sur erreurs transitoires (429, 500, 503)
- [ ] Log des erreurs en local (pour debug)
- [ ] Rapport de bug integre (optionnel)

### 16.4 Sauvegarde et restauration
- [ ] Backup automatique de la DB (quotidien)
- [ ] Backup manuel (bouton dans settings)
- [ ] Restauration depuis un backup
- [ ] Export complet de toutes les donnees (conversations, prompts, roles, settings)
- [ ] Import complet (restauration)

### 16.5 Context window management
- [ ] Tracking du nombre de tokens dans la conversation
- [ ] Indicateur visuel du remplissage de la context window
- [ ] Alerte quand on approche de la limite
- [ ] Troncature automatique des anciens messages (configurable)
- [ ] Resume automatique des messages tronques
- [ ] Option "envoyer seulement les N derniers messages"

---

## 17. FONCTIONNALITES FUTURES (BACKLOG V2+)

> Non prioritaires pour la V1, mais a garder en tete pour l'architecture.

### ~~17.1 Collaboration~~ → Deplace en V1 (section 18)

### 17.2 Plugins / Extensions
- [ ] Systeme de plugins
- [ ] MCP Server support
- [ ] Marketplace de plugins

### 17.3 Agents & Automatisation
- [ ] Tool use / function calling
- [ ] Chaines de prompts (workflows)
- [ ] Taches planifiees
- [ ] Agents autonomes

### 17.4 RAG & Knowledge Base
- [ ] Indexation de documents locaux
- [ ] Recherche semantique dans les documents
- [ ] Vectorstore local (embeddings)

### 17.5 Comparaison de modeles (Mode Arena / Beam)
- [ ] Envoyer le meme prompt a N modeles en parallele
- [ ] Affichage cote a cote des reponses
- [ ] Comparaison des couts et temps de reponse
- [ ] Vote/classement des reponses
- [ ] Synthese/fusion des meilleures reponses (a la Big-AGI Beam)
- [ ] Presets de comparaison (groupes de modeles favoris)

### ~~17.6 Modeles locaux~~ → Deplace en V1 (section 19)

### 17.7 Conversation vocale bidirectionnelle
- [ ] Mode conversation vocale continue (hands-free)
- [ ] Push-to-talk
- [ ] Integration OpenAI Realtime API (WebSocket)
- [ ] Voix de reponse configurable

---

## 18. COLLABORATION & PARTAGE

### 18.1 Partage de conversations
- [ ] Exporter une conversation en fichier partageable (JSON, MD, PDF)
- [ ] Generer un lien de partage (fichier local ou via service)
- [ ] Partage par email (piece jointe)
- [ ] Partage via clipboard (copier le lien/contenu)
- [ ] Choix du contenu a partager (messages seulement, avec metadata, avec images)
- [ ] Anonymisation optionnelle (masquer les noms, cles, donnees sensibles)

### 18.2 Partage de projets
- [ ] Export complet d'un projet (conversations + config + fichiers + roles)
- [ ] Import d'un projet partage
- [ ] Versionning du projet exporte (date, hash)

### 18.3 Partage de ressources
- [ ] Export/import de la bibliotheque de prompts (total ou selection)
- [ ] Export/import de roles/personas
- [ ] Export/import de presets de modeles
- [ ] Format d'echange standardise (JSON structure)

---

## 19. MODELES LOCAUX

### 19.1 Support Ollama
- [ ] Detection automatique d'Ollama en cours d'execution (port 11434)
- [ ] Listing des modeles locaux installes via API Ollama
- [ ] Chat avec modeles Ollama (streaming)
- [ ] Affichage des specs du modele local (taille, quantization, context window)
- [ ] Indicateur visuel "local" sur les modeles Ollama
- [ ] Gestion d'erreur si Ollama n'est pas demarre
- [ ] Lien/bouton pour telecharger Ollama si absent

### 19.2 Support LM Studio
- [ ] Detection automatique de LM Studio (endpoint configurable)
- [ ] Compatible OpenAI SDK (LM Studio expose un endpoint OpenAI-compatible)
- [ ] Listing des modeles charges dans LM Studio
- [ ] Indicateur visuel "local" sur les modeles LM Studio

### 19.3 Fonctionnalites communes modeles locaux
- [ ] Pas de cle API requise (connexion locale)
- [ ] Fonctionnement 100% hors-ligne
- [ ] Indicateur "local" vs "cloud" dans le selecteur de modele
- [ ] Aucune donnee envoyee sur Internet
- [ ] Temps de reponse et tokens affiches comme pour les modeles cloud
- [ ] Cout = 0$ affiche dans les statistiques
- [ ] Configuration de l'endpoint local (host, port)
- [ ] Test de connexion au serveur local

---

## RESUME QUANTITATIF

| Categorie | Nombre de fonctionnalites |
|-----------|--------------------------|
| Providers & Modeles (+ OpenRouter) | ~55 |
| Conversations | ~75 |
| Projets | ~25 |
| Bibliotheque de prompts | ~25 |
| Roles / Personas | ~20 |
| Pieces jointes | ~15 |
| Generation d'images | ~20 |
| Recherche web | ~11 |
| Voix (STT/TTS) | ~25 |
| Optimisation de prompts | ~8 |
| Statistiques | ~20 |
| Interface utilisateur | ~45 |
| Securite | ~15 |
| Stockage & Donnees | ~25 |
| Infrastructure technique | ~40 |
| Fonctionnalites transversales | ~25 |
| Collaboration & Partage | ~12 |
| Modeles locaux (Ollama, LM Studio) | ~15 |
| **TOTAL V1** | **~475** |
| Backlog V2+ | ~20 |
| **TOTAL GLOBAL** | **~495** |
