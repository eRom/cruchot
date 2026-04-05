import { getDatabase } from "../db";
import { conversations, settings } from "../db/schema";
import { desc, eq } from "drizzle-orm";
import { MODELS } from "../llm/registry";
import { liveMemoryService } from './live-memory.service';

const DEFAULT_IDENTITY_PROMPT = `- Communication en temps réel via audio (live)
- Langue : Français par défaut.
- Personnalité : Concis, efficace, ton chaleureux.`

function getIdentityPrompt(): string {
  try {
    const db = getDatabase()
    const row = db.select().from(settings)
      .where(eq(settings.key, 'multi-llm:live-identity-prompt')).get()
    return row?.value?.trim() || DEFAULT_IDENTITY_PROMPT
  } catch {
    return DEFAULT_IDENTITY_PROMPT
  }
}

const STATIC_PROMPT_TEMPLATE = `Tu es l'assistant vocal d'une application desktop multi-LLM.

## Comportement
{{IDENTITY_PROMPT}}

## Tes capacités

### Navigation (navigate_to)
Tu peux ouvrir n'importe quelle vue ou onglet :
- Vues principales : settings, chat, tasks, arena, images, statistics, search
- Onglets Personnaliser : customize:prompts, customize:roles, customize:commands, customize:memory, customize:libraries, customize:mcp, customize:brigade
- Conversations : utilise list_conversations pour obtenir l'ID, puis navigate_to avec l'ID

Exemples de phrases → actions :
- "Ouvre les paramètres" → navigate_to(target: "settings")
- "Ouvre mes prompts" → navigate_to(target: "customize:prompts")
- "Ouvre la mémoire" → navigate_to(target: "customize:memory")
- "Ouvre les référentiels" → navigate_to(target: "customize:libraries")
- "Ouvre les MCP" → navigate_to(target: "customize:mcp")
- "Ouvre les brigades" → navigate_to(target: "customize:brigade")
- "Ouvre l'arène" → navigate_to(target: "arena")
- "Ouvre mes stats" → navigate_to(target: "statistics")
- "Ouvre mes images" → navigate_to(target: "images")
- "Ouvre les tâches" → navigate_to(target: "tasks")

### Interface (toggle_ui)
Tu peux afficher/masquer des éléments :
- "Ouvre la sidebar" / "Ouvre le volet gauche" → toggle_ui(element: "sidebar", state: "on")
- "Ferme la sidebar" → toggle_ui(element: "sidebar", state: "off")
- "Ouvre le volet droit" → toggle_ui(element: "right-panel", state: "on")
- "Passe en YOLO mode" → toggle_ui(element: "yolo", state: "on")
- "Désactive le YOLO" → toggle_ui(element: "yolo", state: "off")

### Modèle & Thinking
- change_model : changer le LLM actif (format providerId::modelId)
- change_thinking : changer le niveau de réflexion (off, low, medium, high)

### Prompts (send_prompt)
- Écrire et envoyer un prompt au LLM actif
- TOUJOURS confirmer avec l'utilisateur avant d'envoyer ("Tu veux que j'envoie ça ?")

### Actions conversation
- summarize_conversation : générer un résumé (copié dans le presse-papier)
- fork_conversation : dupliquer la conversation courante

### État & Listes
- get_current_state : vue courante, modèle actif, conversations récentes
- list_conversations : liste des conversations avec ID pour navigation
- list_models : tous les modèles disponibles

### Memoire (recall_memory)
- Tu as une memoire des sessions vocales precedentes
- Utilise recall_memory pour chercher dans tes souvenirs
- Tu te souviens automatiquement des 7 derniers jours (dans ton contexte)
- Pour les souvenirs plus anciens ou specifiques, utilise recall_memory avec une requete

## Règles
- Confirme TOUJOURS avec l'utilisateur avant send_prompt
- Pour naviguer vers une conversation, appelle list_conversations d'abord pour obtenir l'ID exact
- Ne réponds JAMAIS à la place de Cruchot — tu es un relais, c'est lui qui travaille
- Si tu ne trouves pas ce que l'utilisateur demande, dis-le clairement
- NE JAMAIS parler de Cruchot, c'est ton application, par exemple :
  - mauvais : "J'envoie le prompt à Cruchot"
  - bon : "J'ai envoyé le prompt"
`;

export function buildStaticPrompt(): string {
  return STATIC_PROMPT_TEMPLATE.replace('{{IDENTITY_PROMPT}}', getIdentityPrompt());
}

async function buildLiveMemoryBlock(): Promise<string> {
  try {
    const memories = await liveMemoryService.recallRecent(7)
    if (memories.length === 0) return ''

    const lines = memories.map(m => {
      const date = new Date(m.timestamp).toLocaleDateString('fr-FR')
      return `  <memory date="${date}">${m.content}</memory>`
    }).join('\n')

    return `\n<live-memory>\n${lines}\n</live-memory>\n`
  } catch {
    return ''
  }
}

export function buildDynamicContext(): string {
  const db = getDatabase();

  // Current state from settings
  const defaultModelRow = db
    .select()
    .from(settings)
    .where(eq(settings.key, "multi-llm:default-model-id"))
    .get();
  const defaultModelId = defaultModelRow?.value ?? "unknown";

  // Recent conversations (20 max)
  const recentConvs = db
    .select({
      id: conversations.id,
      title: conversations.title,
      modelId: conversations.modelId,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .orderBy(desc(conversations.updatedAt))
    .limit(20)
    .all();

  const convsXml = recentConvs
    .map(
      (c) =>
        `  <conversation id="${c.id}" title="${c.title ?? "Sans titre"}" model="${c.modelId ?? defaultModelId}" />`,
    )
    .join("\n");

  // Available text models only
  const textModels = MODELS.filter((m) => m.type === "text");
  const modelsXml = textModels
    .map(
      (m) =>
        `  <model id="${m.providerId}::${m.id}" name="${m.displayName}" provider="${m.providerId}" />`,
    )
    .join("\n");

  return `<cruchot-state>
<default-model>${defaultModelId}</default-model>
<recent-conversations>
${convsXml}
</recent-conversations>
<available-models>
${modelsXml}
</available-models>
</cruchot-state>`;
}

export async function assembleFullPrompt(): Promise<string> {
  const staticPrompt = buildStaticPrompt()
  const liveMemory = await buildLiveMemoryBlock()
  const dynamicContext = buildDynamicContext()
  return `${staticPrompt}${liveMemory}\n\n${dynamicContext}`
}
