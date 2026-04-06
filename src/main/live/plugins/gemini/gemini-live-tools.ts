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
    description: "Arreter le partage d'ecran. Le flux est ferme. L'utilisateur devra re-selectionner une source via l'UI pour partager a nouveau.",
    parameters: {},
    required: []
  },
]
