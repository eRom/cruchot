import { eq, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDatabase } from '../index'
import { roles } from '../schema'
import { conversations } from '../schema'

export function getAllRoles() {
  const db = getDatabase()
  return db
    .select()
    .from(roles)
    .orderBy(desc(roles.updatedAt))
    .all()
}

export function getRole(id: string) {
  const db = getDatabase()
  return db.select().from(roles).where(eq(roles.id, id)).get()
}

export function createRole(data: {
  name: string
  description?: string
  systemPrompt?: string
  icon?: string
  isBuiltin?: boolean
  category?: string
  tags?: string[]
  variables?: Array<{ name: string; description?: string }>
}) {
  const db = getDatabase()
  const id = nanoid()
  const now = new Date()

  db.insert(roles)
    .values({
      id,
      name: data.name,
      description: data.description ?? null,
      systemPrompt: data.systemPrompt ?? null,
      icon: data.icon ?? null,
      isBuiltin: data.isBuiltin ?? false,
      category: data.category ?? null,
      tags: data.tags ?? null,
      variables: data.variables ?? null,
      createdAt: now,
      updatedAt: now
    })
    .run()

  return getRole(id)!
}

export function updateRole(
  id: string,
  data: {
    name?: string
    description?: string | null
    systemPrompt?: string | null
    icon?: string | null
    category?: string | null
    tags?: string[] | null
    variables?: Array<{ name: string; description?: string }> | null
  }
) {
  const db = getDatabase()
  db.update(roles)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(roles.id, id))
    .run()

  return getRole(id)
}

export function deleteRole(id: string) {
  const db = getDatabase()
  // Clear roleId on conversations that reference this role
  db.update(conversations)
    .set({ roleId: null })
    .where(eq(conversations.roleId, id))
    .run()
  // Then delete the role
  db.delete(roles).where(eq(roles.id, id)).run()
}

const BUILTIN_ROLES = [
  {
    name: 'Dev',
    description: 'Développeur logiciel expert',
    systemPrompt:
      'Tu es un développeur logiciel senior expert. Tu écris du code propre, maintenable et bien documenté. Tu expliques tes choix techniques.',
    icon: 'Code',
    category: 'Technique'
  },
  {
    name: 'Rédacteur',
    description: 'Rédacteur professionnel',
    systemPrompt:
      'Tu es un rédacteur professionnel. Tu écris des textes clairs, bien structurés et adaptés au public cible. Tu maîtrises les règles de grammaire et de style.',
    icon: 'Pen',
    category: 'Rédaction'
  },
  {
    name: 'Analyste',
    description: 'Analyste de données et stratégie',
    systemPrompt:
      'Tu es un analyste expert. Tu examines les données et situations avec rigueur, identifies les tendances et fournis des recommandations argumentées.',
    icon: 'BarChart',
    category: 'Analyse'
  },
  {
    name: 'Traducteur',
    description: 'Traducteur multilingue',
    systemPrompt:
      'Tu es un traducteur professionnel multilingue. Tu traduis avec précision en préservant le sens, le ton et les nuances culturelles du texte original.',
    icon: 'Languages',
    category: 'Rédaction'
  },
  {
    name: 'Coach',
    description: 'Coach et mentor personnel',
    systemPrompt:
      'Tu es un coach professionnel bienveillant. Tu aides à clarifier les objectifs, surmonter les obstacles et développer le potentiel. Tu poses des questions pertinentes.',
    icon: 'Heart',
    category: 'Personnel'
  }
]

export function seedBuiltinRoles() {
  const db = getDatabase()
  const existing = db.select().from(roles).where(eq(roles.isBuiltin, true)).all()

  if (existing.length > 0) return // Déjà seedé

  for (const role of BUILTIN_ROLES) {
    createRole({ ...role, isBuiltin: true })
  }

  console.log('[DB] Built-in roles seeded')
}
