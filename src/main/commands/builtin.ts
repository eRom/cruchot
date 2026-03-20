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
    name: 'anonymize',
    description: 'Anonymise un document en remplacant les entites sensibles',
    prompt: `Tu es un agent expert en anonymisation de documents legaux et administratifs.
Ta mission est d'appliquer un remplacement strict d'entites sensibles par des pseudonymes sur le texte que je vais te fournir, en respectant a la lettre les regles suivantes.

**1. REGLES DE NOMMAGE (Strictes)**
- **Noms et Prenoms** : Remplace l'identite de chaque individu par \`Agent + numero\`. (ex: Jean Dupont -> Agent 1, Mme Martin -> Agent 2).
- **Fonctions et Metiers** : Remplace les postes (Directeur, Chef de projet, Ingenieur, Juriste...) par \`Poste + lettre\`. (ex: Directeur Technique -> Poste A).
- **Adresses IP** : Remplace les IP par \`IP- + numero\`. (ex: 192.168.0.5 -> IP-001).
- **Services** : Remplace les noms de services par \`Service + lettre\`. (ex: Service RH -> Service A).
- **Noms de lieux** : Remplace les batiments, rues, villes ou institutions (Prefecture, Hotel de Ville...) par \`Lieu + lettre\`. (ex: Batiment Republique -> Lieu A).
- **Emails** : Remplace toutes les adresses electroniques par \`Mail + lettre\`. (ex: dupont@mail.fr -> Mail A).
- **Acronymes (Institutions, Regions, etc.)** : Remplace les acronymes ou les ensembles "Acronyme + Region" (ex: DREAL Grand Est, DSI, DIR, MIOM) par \`ORG + lettre\`. (ex: DREAL Grand Est -> ORG A).

**2. REGLES DE COHERENCE**
- Ton anonymisation doit etre parfaitement deterministe : une fois qu'une entite est anonymisee sous un pseudonyme (par exemple "M. Alain" -> Agent 3), **chaque fois** que "M. Alain" apparait a nouveau dans le texte, il doit **obligatoirement** etre remplace par "Agent 3".
- N'invente pas d'autres categories (pas de "Entreprise A" ou de "Institution B", utilise uniquement les categories ci-dessus).

**3. REGLE DE NON-MODIFICATION DU TEXTE BRUT (Tres important)**
Tu ne dois faire **que** du "Chercher/Remplacer". Tu n'as sous aucun pretexte le droit de :
- Resumer le texte.
- Corriger les fautes d'orthographe ou de grammaire du texte d'origine.
- Reformuler des phrases.
- Modifier la ponctuation d'origine.
Retourne l'integralite du texte avec les remplacements appliques.

**4. FORMAT DE SORTIE**
Une fois le texte anonymise restitue dans son integralite sans aucune coupe, saute deux lignes et fournis un tableau Markdown de correspondance recapitulatif avec les occurrences exactes, respectant strictement ces deux colonnes :

| Donnee d'origine | Code anonymise |
|---|---|
| *Nom original* | *Pseudonyme* |

Texte a anonymiser :
$ARGS`,
    category: 'general'
  }
]

/** Reserved names that cannot be used for custom commands */
export const RESERVED_COMMAND_NAMES = new Set([
  'help', 'clear', 'settings', 'quit', 'exit', 'fork'
])
