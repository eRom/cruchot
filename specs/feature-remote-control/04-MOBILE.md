# Remote Control — Specifications Mobile

> Feature spec — Multi-LLM Desktop
> Date : 2026-03-11

## Principe fondamental

**Le mobile n'a AUCUNE intelligence.** C'est un terminal de saisie et d'affichage. Toute la logique (LLM, outils, workspace, MCP) reste sur le Desktop.

Le "client mobile" est **l'application Telegram elle-meme**. Pas de developpement mobile custom pour la v1.

## Option retenue : Telegram Chat natif

### Pourquoi pas d'app mobile custom

| Critere | Telegram natif | App custom (React Native) |
|---|---|---|
| Temps de dev | **0** (deja fait) | 2-4 semaines |
| Installation | **Deja installe** | Store + review |
| Notifications | **Natives** | A implementer |
| Offline | **Gere par Telegram** | A implementer |
| Maintenance | **Zero** | 2 plateformes |
| UX chat | **Excellente** | A construire |
| Rendu code | Basique (monospace) | Custom (syntax highlight) |
| Approbation | **Inline keyboards** | UI custom |

**Verdict** : Telegram natif couvre 95% du besoin. Le 5% manquant (syntax highlighting) ne justifie pas un projet mobile complet.

## Experience utilisateur mobile

### 1. Setup initial (une seule fois)

```
1. Ouvrir Telegram
2. Chercher le bot : @mon_coding_bot
3. Taper /start
4. Le bot repond :
   "Bienvenue ! Pour lier ce chat a votre Desktop,
    ouvrez Settings > Remote dans l'app et notez le code de pairing.
    Puis envoyez /pair CODE ici."
```

### 2. Pairing

```
User:  /pair 482917

Bot:   ✅ Pairing reussi !
       Desktop connecte. Vous pouvez maintenant
       envoyer des messages au LLM.

       Modele actif : claude-sonnet-4-6
       Projet : mon-projet

       /help pour voir les commandes disponibles.
```

### 3. Conversation standard

```
User:  explique la fonction calculateCost dans cost-calculator.ts

Bot:   ▍                          ← message initial (curseur)

Bot:   (edit) La fonction `calculateCost`  ← streaming par edits
       prend en parametres...

Bot:   (edit final)
       La fonction `calculateCost` prend en parametres
       `inputTokens`, `outputTokens` et `modelId`.

       Elle consulte la table `PRICING` pour trouver
       les tarifs du modele, puis calcule :

       ```
       cost = (inputTokens * pricing.input +
               outputTokens * pricing.output) / 1_000_000
       ```

       Le cout est retourne en dollars USD.
```

### 4. Approbation d'outils

```
Bot:   🔧 bash
       npm test

       [✅ Approve]  [❌ Deny]

User:  (tape ✅ Approve)

Bot:   ✅ Executing...

Bot:   📋 Resultat bash :
       ```
       PASS  src/tests/cost.test.ts
       Tests: 12 passed, 12 total
       ```
```

### 5. Ecriture de fichier

```
Bot:   📝 writeFile
       src/utils/helpers.ts

       [✅ Approve]  [❌ Deny]

User:  (tape ✅ Approve)

Bot:   ✅ Fichier ecrit : src/utils/helpers.ts (42 lignes)
```

### 6. Messages longs (split automatique)

```
Bot:   (message 1/3)
       Voici l'analyse complete du module...
       [4000 chars de contenu]

Bot:   (message 2/3)
       ... suite de l'analyse ...
       [4000 chars de contenu]

Bot:   (message 3/3)
       ... conclusion et recommandations.

       💰 Cout : $0.0234 | ⏱️ 4.2s | 📊 claude-sonnet-4-6
```

### 7. Commandes

```
User:  /status

Bot:   📡 Session Remote Control
       Status : 🟢 Connecte
       Desktop : en ligne depuis 2h34
       Modele : claude-sonnet-4-6
       Projet : mon-projet
       Messages : 23 (cette session)
       Cout total : $0.47
```

```
User:  /model

Bot:   Modele actif : claude-sonnet-4-6
       Provider : Anthropic
       Thinking : medium
```

```
User:  /clear

Bot:   🔄 Nouvelle conversation creee.
       Contexte reinitialise.
```

```
User:  /stop

Bot:   ⏹️ Session terminee.
       Resume :
       - Duree : 2h34
       - Messages : 23
       - Cout total : $0.47

       Pour reprendre : /pair CODE
```

## Formatage des messages Telegram

### Template de reponse LLM

```
{texte de la reponse en MarkdownV2}

💰 $0.0234 | ⏱️ 2.1s | 📊 claude-sonnet-4-6
```

Le footer cout/temps/modele est optionnel (configurable dans Settings Desktop).

### Template tool call

```
{emoji} *{tool_name}*
{detail tronque a 200 chars}

[✅ Approve]  [❌ Deny]
```

### Template tool result

```
📋 Resultat {tool_name} :
```{langage}
{output tronque a 3000 chars}
```

{si tronque : "... (tronque, 12KB total)"}
```

### Template erreur

```
⚠️ Erreur :
{message d'erreur}

{si actionable : suggestion}
```

### Template session

```
📡 *Remote Control*
Status : {emoji} {status}
Desktop : {uptime}
Modele : {modelId}
```

## Limites du rendu Telegram

| Feature Desktop | Rendu Telegram | Compromis |
|---|---|---|
| Syntax highlighting | Bloc `code` monospace | Pas de couleurs |
| Mermaid diagrams | Non rendu | Texte brut du code |
| LaTeX / KaTeX | Non rendu | Texte brut |
| Images generees | Envoi comme photo | OK (jusqu'a 5MB) |
| File tree | Texte indente | OK |
| ReasoningBlock | Bloc italique | Simplifie |
| Hover actions | Inline keyboards | Adapte |

## Evolution future (v2) — Telegram Mini App

Si les limites de rendu deviennent bloquantes, une **Telegram Mini App** (web app embedded dans Telegram) pourrait fournir :

- Syntax highlighting (Shiki/Prism)
- Rendu Mermaid / KaTeX
- File tree interactif
- Meilleur formatage des tool calls

### Architecture Mini App

```
┌─────────────┐    WebSocket     ┌──────────────┐    Bot API    ┌─────────┐
│  Mini App   │ ←──────────────→ │ Relay Worker │ ←───────────→ │ Desktop │
│  (React)    │                  │ (Cloudflare) │               │         │
└─────────────┘                  └──────────────┘               └─────────┘
```

- **Mini App** : React + Vite, deploye sur Cloudflare Pages (gratuit)
- **Relay** : Cloudflare Durable Object (WebSocket relay, quasi-gratuit)
- **Desktop** : connecte au relay via WebSocket sortant

**Hors scope v1** — A evaluer apres retour d'experience sur le chat Telegram natif.

## Ce qui n'est PAS sur mobile

- Aucun appel LLM
- Aucun acces au workspace local
- Aucun stockage de donnees de session
- Aucun cache de messages (Telegram gere)
- Aucune logique metier
- Aucune cle API
- Zero code a deployer cote mobile (v1)
