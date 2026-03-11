# Remote Control — Vue d'ensemble

> Feature spec — Multi-LLM Desktop
> Date : 2026-03-11

## Vision

**Remote Control** permet de poursuivre une session de chat LLM locale depuis un smartphone ou tablette, en gardant l'execution sur la machine hote (Desktop Electron). Le transport bidirectionnel passe par **Telegram Bot API** — zero serveur backend, zero port entrant.

Le mobile n'est qu'un terminal d'affichage et de saisie. Toute l'intelligence (LLM, outils, workspace, MCP) reste sur le Desktop.

## Objectifs

1. **Continuite** : quitter le bureau, reprendre la conversation depuis Telegram sur mobile
2. **Approbation mobile** : valider les actions d'outils (bash, fichiers) via boutons inline Telegram
3. **Temps reel** : streaming des reponses LLM token par token dans le chat Telegram
4. **Zero infrastructure** : aucun serveur a deployer, Telegram fait office de relay
5. **Resilience** : reconnexion automatique apres interruption reseau

## Contraintes

| Contrainte | Detail |
|---|---|
| Sessions simultanees | **1 seule** session distante par instance Desktop |
| Machine hote | Doit rester allumee et l'app ouverte (pas de wake-on-LAN) |
| Reseau | Requetes HTTPS sortantes uniquement — zero port entrant |
| Timeout reseau | Interruption > **10 minutes** = expiration de session |
| Transport | Telegram Bot API (long polling) — HTTPS sortant |
| Intelligence mobile | **Aucune** — le mobile est un client bete (affichage + saisie) |
| Limites Telegram | Messages : 4096 chars max, 1 msg/sec par chat, 30 msg/sec global |

## Cas d'usage

### Primaire
- **Travail hybride** : commencer une session de codage au bureau, la poursuivre dans le metro/bus/canape via Telegram mobile

### Secondaires
- **Monitoring** : surveiller une execution longue (multi-step tools) depuis le telephone
- **Approbation distante** : valider un `writeFile` ou `bash` sans retourner a l'ecran Desktop
- **Relecture** : relire les reponses LLM sur mobile pendant un trajet

## Hors scope (v1)

- Multi-sessions (plusieurs mobiles sur une instance)
- Envoi de fichiers/images depuis mobile vers Desktop
- Execution LLM sur mobile
- Voice input/output via Telegram
- Notifications push quand l'app Desktop est fermee
- Telegram Mini App (v2 potentielle pour UI enrichie)

## Prerequis utilisateur

1. Compte Telegram actif
2. Creation d'un bot via [@BotFather](https://t.me/BotFather) (gratuit, 2 minutes)
3. Token du bot saisi dans les Settings de l'app Desktop

## Flux utilisateur resume

```
1. Settings > Remote : coller le token bot Telegram
2. Cliquer "Activer Remote Control"
3. Desktop affiche un code de pairing (6 chiffres, expire 5 min)
4. Sur mobile : ouvrir Telegram, envoyer /pair CODE au bot
5. Desktop confirme le lien → session active
6. Mobile : taper des messages → forwarded au LLM local
7. Desktop : reponses LLM streamees dans le chat Telegram
8. Outils : boutons [Approve] [Deny] inline dans Telegram
9. /stop ou Settings Desktop → ferme la session
```
