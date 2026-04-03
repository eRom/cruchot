# La Stack LLM et l'Intelligence Artificielle

Cruchot est conçu pour être agnostique vis-à-vis des fournisseurs d'Intelligence Artificielle. Au lieu de coder des adaptateurs HTTP spécifiques pour chaque API (OpenAI, Anthropic, Google, etc.), l'application s'appuie sur le **Vercel AI SDK** comme couche de normalisation universelle.

## 1. L'Abstraction : Vercel AI SDK

Le Vercel AI SDK unifie les requêtes (prompts, historique, attachements, appels d'outils) et les réponses (streaming de texte, streaming d'appels d'outils, calcul d'usage) pour tous les modèles.

Dans Cruchot, le flux est le suivant :
```
[Demande UI] -> [Formateur de Prompt] -> [Routeur AI SDK] -> [Provider SDK] -> [API Cloud/Locale]
```

## 2. Les Fournisseurs (Providers)

La configuration des providers se trouve dans `src/main/llm/providers.ts`.
Les clés d'API ne sont **jamais** dans le code frontend. Elles sont récupérées depuis le trousseau sécurisé du système (`safeStorage` d'Electron) et les instances de providers sont mises en cache 5 minutes (`providerCache`) pour éviter des appels répétés au trousseau système. Le cache est invalidé automatiquement lorsque l'utilisateur modifie une clé.

### 2.1 Fournisseurs Cloud Intégrés
Cruchot intègre nativement les packages officiels du Vercel AI SDK pour :
- **OpenAI** (`@ai-sdk/openai`)
- **Anthropic** (`@ai-sdk/anthropic`)
- **Google / Gemini** (`@ai-sdk/google`)
- **Mistral** (`@ai-sdk/mistral`)
- **xAI / Grok** (`@ai-sdk/xai`)
- **DeepSeek** (`@ai-sdk/deepseek`)

### 2.2 Fournisseurs avec SDK dédié
- **Perplexity** (`@perplexity-ai/ai-sdk`) : SDK officiel avec support de la recherche web intégrée.
- **Mistral OCR** (`@mistralai/mistralai`) : SDK officiel Mistral utilisé exclusivement pour l'OCR (endpoint `/v1/ocr`). Distinct du provider Vercel AI SDK (`@ai-sdk/mistral`) utilisé pour le chat. Chargé en **dynamic import** (package ESM-only).

### 2.3 Routeurs et Gateways
- **OpenRouter** (`@openrouter/ai-sdk-provider`) : Permet l'accès à des centaines de modèles via une seule clé API.

### 2.4 Fournisseurs Locaux (Zéro Cloud)
Cruchot peut fonctionner de manière totalement déconnectée via :
- **Ollama** (API OpenAI-Compatible)
- **LM Studio** (API OpenAI-Compatible)

## 3. Le Routeur Interne (`router.ts`)

La fonction `getModel(providerId, modelId)` dans `router.ts` est l'unique point d'entrée pour récupérer une instance de modèle prête à générer du texte. Elle orchestre la sélection du bon provider (selon l'ID) et lui passe le nom du modèle.

## 4. Pipeline de Prompting

Cruchot n'envoie pas les messages de l'utilisateur tels quels. Un pipeline de préparation du contexte construit le **System Prompt** final en combinant dynamiquement :

1.  **Le Rôle Actuel** : Instructions globales de la personnalité choisie.
2.  **Les Instructions de Compétences (Skills)** : Injectées si des skills natifs ou MCP sont actifs, expliquant au modèle comment utiliser ces outils.
3.  **Mémoire Sémantique** : Rappel automatique des anciens messages pertinents via `qdrantMemoryService` (RAG local).
4.  **Fragments de Mémoire** : Règles globales épinglées par l'utilisateur (memory fragments).
5.  **Contexte de la Bibliothèque (RAG)** : Informations spécifiques issues de la recherche vectorielle liées à la conversation en cours.
6.  **Contexte Workspace** : Lecture automatique de `CLAUDE.md` et `README.md` du dossier de travail.

## 5. Tracking de Coûts et Usage

Le SDK renvoie les métriques d'utilisation (tokens entrants, tokens sortants).
Le fichier `cost-calculator.ts` possède une matrice de tarification par modèle permettant de calculer, en temps réel pendant le stream, le coût exact en dollars de la requête. Ces informations sont stockées en base de données pour générer des statistiques globales (coût par jour, par fournisseur).

## 6. OCR — Reconnaissance Optique de Caractères

Le service `src/main/services/ocr.service.ts` (`ocrService` singleton) intègre l'API **Mistral OCR** pour extraire le contenu textuel de documents scannés ou d'images. Il partage la même clé API que le provider Mistral chat.

### 6.1 Formats supportés
- **Documents** : PDF, DOCX, PPTX (envoyés en base64 data URL — l'endpoint `/v1/ocr` n'accepte pas les IDs de fichier uploadés)
- **Images** : JPEG, PNG, WebP, TIFF, BMP, AVIF

Taille maximum : **50 MB** par fichier (limite Mistral).

### 6.2 Points d'intégration
- **Pièces jointes de chat** (`src/main/llm/attachments.ts`) : les PDFs scannés et les images sont OCRisés automatiquement avant d'être envoyés au LLM. Un badge "OCR" est affiché dans l'UI (`MessageItem.tsx`).
- **Bibliothèques RAG** (`src/main/services/library.service.ts`) : les fichiers images ajoutés à une bibliothèque sont OCRisés lors de l'indexation pour alimenter la recherche vectorielle.

### 6.3 Tarification OCR
Les coûts OCR sont calculés via `cost-calculator.ts` et enregistrés en base de données comme les autres requêtes LLM.
