import { Type } from '@google/genai'

export const CRUCHOT_TOOLS = [
  {
    name: 'navigate_to',
    description: `Naviguer vers une vue ou un onglet de l'application.
Vues: 'settings', 'chat', 'tasks', 'arena', 'images', 'statistics', 'search'.
Onglets Personnaliser: 'customize:prompts', 'customize:roles', 'customize:commands', 'customize:memory', 'customize:libraries', 'customize:mcp', 'customize:brigade'.
Pour une conversation spécifique, utiliser son ID (appeler list_conversations d'abord).`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        target: {
          type: Type.STRING,
          description: "Nom de vue, onglet 'customize:xxx', ou ID de conversation"
        }
      },
      required: ['target']
    }
  },
  {
    name: 'toggle_ui',
    description: "Afficher/masquer un élément de l'interface ou activer/désactiver un mode.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        element: {
          type: Type.STRING,
          description: "'sidebar' (volet gauche), 'right-panel' (volet droit)"
        },
        state: {
          type: Type.STRING,
          description: "'on', 'off', ou 'toggle' (défaut: 'toggle')"
        }
      },
      required: ['element']
    }
  },
  {
    name: 'change_model',
    description: "Changer le modèle LLM actif. Format: 'providerId::modelId' (ex: 'anthropic::claude-sonnet-4-6').",
    parameters: {
      type: Type.OBJECT,
      properties: {
        modelId: {
          type: Type.STRING,
          description: "ID complet du modèle au format 'providerId::modelId'"
        }
      },
      required: ['modelId']
    }
  },
  {
    name: 'change_thinking',
    description: "Changer le niveau de réflexion (thinking) du modèle actif.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        level: {
          type: Type.STRING,
          description: "Niveau: 'off', 'low', 'medium', 'high'"
        }
      },
      required: ['level']
    }
  },
  {
    name: 'send_prompt',
    description: "Écrire un prompt dans la zone de saisie et l'envoyer au LLM actif. TOUJOURS confirmer avec l'utilisateur avant d'envoyer.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: {
          type: Type.STRING,
          description: "Le texte du prompt à envoyer"
        }
      },
      required: ['text']
    }
  },
  {
    name: 'summarize_conversation',
    description: "Générer un résumé de la conversation courante et le copier dans le presse-papier.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  },
  {
    name: 'fork_conversation',
    description: "Dupliquer (forker) la conversation courante pour en créer une copie indépendante.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  },
  {
    name: 'get_current_state',
    description: "Obtenir l'état actuel: vue courante, conversation active, modèle sélectionné.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  },
  {
    name: 'list_conversations',
    description: "Lister les conversations récentes avec leur ID, titre, modèle et date.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        limit: {
          type: Type.NUMBER,
          description: "Nombre maximum (défaut: 20)"
        }
      },
      required: []
    }
  },
  {
    name: 'list_models',
    description: "Lister tous les modèles LLM disponibles avec leur ID complet.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  },
  {
    name: 'recall_memory',
    description: "Rechercher dans ta memoire des sessions vocales precedentes. Utilise quand l'utilisateur te demande si tu te souviens de quelque chose, ou quand tu as besoin de contexte d'une conversation passee.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: "Ce que tu cherches dans ta memoire (sujet, mot-cle, question)"
        }
      },
      required: ['query']
    }
  }
]
