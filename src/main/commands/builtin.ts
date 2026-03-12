export interface BuiltinCommand {
  name: string
  description: string
  prompt: string
  category?: string
}

export const BUILTIN_COMMANDS: BuiltinCommand[] = [
  {
    name: 'resume',
    description: 'Resume la conversation en bullet points',
    prompt: 'Resume cette conversation en bullet points clairs et concis. Mets en avant les decisions prises, les actions a faire, et les points importants.',
    category: 'general'
  },
  {
    name: 'explain',
    description: 'Explique du code en detail',
    prompt: 'Explique le code suivant en detail, en decrivant son fonctionnement, sa logique, et les patterns utilises :\n\n$ARGS',
    category: 'code'
  },
  {
    name: 'refactor',
    description: 'Propose un refactoring',
    prompt: 'Propose un refactoring pour le code suivant. Explique les ameliorations en termes de lisibilite, maintenabilite et performance :\n\n$ARGS',
    category: 'code'
  },
  {
    name: 'debug',
    description: 'Aide au debug',
    prompt: 'Aide-moi a debugger ce probleme. Analyse les symptomes, identifie les causes possibles, et propose des solutions :\n\n$ARGS',
    category: 'code'
  },
  {
    name: 'translate',
    description: 'Traduit du texte',
    prompt: 'Traduis le texte suivant en $1 :\n\n$2',
    category: 'general'
  },
  {
    name: 'commit-msg',
    description: 'Genere un message de commit',
    prompt: 'Genere un message de commit conventionnel (format Conventional Commits) pour ces changements. Le message doit etre concis et decrire le "pourquoi" :\n\n$ARGS',
    category: 'git'
  },
  {
    name: 'review',
    description: 'Code review',
    prompt: 'Fais une code review du code suivant. Verifie les bugs potentiels, les problemes de securite, la lisibilite, et les bonnes pratiques. Propose des ameliorations concretes :\n\n$ARGS',
    category: 'code'
  },
  {
    name: 'test',
    description: 'Genere des tests unitaires',
    prompt: 'Genere des tests unitaires complets pour le code suivant. Couvre les cas nominaux, les cas limites et les cas d\'erreur :\n\n$ARGS',
    category: 'code'
  }
]

/** Reserved names that cannot be used for custom commands */
export const RESERVED_COMMAND_NAMES = new Set([
  'help', 'clear', 'settings', 'quit', 'exit'
])
