// src/main/live/live-core-tools.ts

import type { CoreToolDeclaration } from './live-plugin.interface'

export const CORE_LIVE_TOOLS: CoreToolDeclaration[] = [
  {
    name: 'navigate_to',
    description: `Naviguer vers une vue ou un onglet de l'application.
Vues: 'settings', 'chat', 'tasks', 'arena', 'images', 'statistics', 'search'.
Onglets Personnaliser: 'customize:prompts', 'customize:roles', 'customize:commands', 'customize:memory', 'customize:libraries', 'customize:mcp', 'customize:brigade', 'customize:applications'.
Pour une conversation spécifique, utiliser son ID (appeler list_conversations d'abord).`,
    parameters: {
      target: { type: 'string', description: "Nom de vue, onglet 'customize:xxx', ou ID de conversation" }
    },
    required: ['target']
  },
  {
    name: 'toggle_ui',
    description: "Afficher/masquer un élément de l'interface ou activer/désactiver un mode.",
    parameters: {
      element: { type: 'string', description: "'sidebar' (volet gauche), 'right-panel' (volet droit)" },
      state: { type: 'string', description: "'on', 'off', ou 'toggle' (défaut: 'toggle')" }
    },
    required: ['element']
  },
  {
    name: 'change_model',
    description: "Changer le modèle LLM actif. Format: 'providerId::modelId' (ex: 'anthropic::claude-sonnet-4-6').",
    parameters: {
      modelId: { type: 'string', description: "ID complet du modèle au format 'providerId::modelId'" }
    },
    required: ['modelId']
  },
  {
    name: 'change_thinking',
    description: "Changer le niveau de réflexion (thinking) du modèle actif.",
    parameters: {
      level: { type: 'string', description: "Niveau: 'off', 'low', 'medium', 'high'" }
    },
    required: ['level']
  },
  {
    name: 'send_prompt',
    description: "Écrire un prompt dans la zone de saisie et l'envoyer au LLM actif. TOUJOURS confirmer avec l'utilisateur avant d'envoyer.",
    parameters: {
      text: { type: 'string', description: "Le texte du prompt à envoyer" }
    },
    required: ['text']
  },
  {
    name: 'summarize_conversation',
    description: "Générer un résumé de la conversation courante et le copier dans le presse-papier.",
    parameters: {},
    required: []
  },
  {
    name: 'fork_conversation',
    description: "Dupliquer (forker) la conversation courante pour en créer une copie indépendante.",
    parameters: {},
    required: []
  },
  {
    name: 'get_current_state',
    description: "Obtenir l'état actuel: vue courante, conversation active, modèle sélectionné.",
    parameters: {},
    required: []
  },
  {
    name: 'list_conversations',
    description: "Lister les conversations récentes avec leur ID, titre, modèle et date.",
    parameters: {
      limit: { type: 'number', description: "Nombre maximum (défaut: 20)" }
    },
    required: []
  },
  {
    name: 'list_models',
    description: "Lister tous les modèles LLM disponibles avec leur ID complet.",
    parameters: {},
    required: []
  },
  {
    name: 'open_app',
    description: `Ouvrir une application ou un site web autorise. Exemples : "ouvre Zed", "lance Gmail", "ouvre mes mails".
Appeler list_allowed_apps d'abord si tu ne connais pas le nom exact.`,
    parameters: {
      name: { type: 'string', description: "Nom de l'application a ouvrir (ex: 'Zed', 'Gmail', 'Slack')" }
    },
    required: ['name']
  },
  {
    name: 'list_allowed_apps',
    description: "Lister les applications et sites web autorises a etre ouverts.",
    parameters: {},
    required: []
  },
  {
    name: 'recall_memory',
    description: "Rechercher dans ta memoire des sessions vocales precedentes. Utilise quand l'utilisateur te demande si tu te souviens de quelque chose, ou quand tu as besoin de contexte d'une conversation passee.",
    parameters: {
      query: { type: 'string', description: "Ce que tu cherches dans ta memoire (sujet, mot-cle, question)" }
    },
    required: ['query']
  },
]
