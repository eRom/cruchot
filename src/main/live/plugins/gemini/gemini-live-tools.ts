import type { PluginToolDeclaration } from '../../live-plugin.interface'

export const GEMINI_PLUGIN_TOOLS: PluginToolDeclaration[] = [
  {
    name: 'request_screenshot',
    description: "Capturer un screenshot haute qualite de l'ecran partage. Utilise quand l'utilisateur demande d'analyser en detail ce qu'il voit a l'ecran.",
    parameters: {},
    required: []
  },
  {
    name: 'pause_screen_share',
    description: "Mettre en pause le partage d'ecran. Les frames ne sont plus envoyees mais la source reste selectionnee.",
    parameters: {},
    required: []
  },
  {
    name: 'resume_screen_share',
    description: "Reprendre le partage d'ecran apres une pause.",
    parameters: {},
    required: []
  },
]
