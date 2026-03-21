/**
 * BardaParserService — Parse les fichiers .barda (Markdown + frontmatter YAML).
 * Format : frontmatter YAML entre --- / --- puis sections ## avec sous-sections ###.
 */
import { z } from 'zod'

// ── Types internes ──────────────────────────────────────────

export interface ParsedBardaInternal {
  metadata: {
    name: string
    namespace: string
    version?: string
    description?: string
    author?: string
  }
  roles: Array<{ name: string; content: string }>
  commands: Array<{ name: string; content: string }>
  prompts: Array<{ name: string; content: string }>
  fragments: Array<{ name: string; content: string }>
  libraries: Array<{ name: string; content: string }>
  mcp: Array<{
    name: string
    content: string
    mcpConfig?: {
      transportType: string
      command?: string
      args?: string[]
      url?: string
      headers?: Record<string, string>
    }
  }>
}

export type ParseResult =
  | { success: true; data: ParsedBardaInternal }
  | { success: false; error: { line: number; message: string } }

// ── Zod schema pour le frontmatter ──────────────────────────

const frontmatterSchema = z.object({
  name: z.string().min(1, 'name is required'),
  namespace: z.string().min(1).regex(/^[a-z][a-z0-9-]*$/, 'namespace must match /^[a-z][a-z0-9-]*$/'),
  version: z.string().optional(),
  description: z.string().optional(),
  author: z.string().optional()
})

// ── Sections reconnues ──────────────────────────────────────

const KNOWN_SECTIONS: Record<string, keyof Pick<ParsedBardaInternal, 'roles' | 'commands' | 'prompts' | 'fragments' | 'libraries' | 'mcp'>> = {
  'Roles': 'roles',
  'Commands': 'commands',
  'Prompts': 'prompts',
  'Memory Fragments': 'fragments',
  'Libraries': 'libraries',
  'MCP': 'mcp'
}

// ── Service ─────────────────────────────────────────────────

class BardaParserService {
  parse(content: string): ParseResult {
    const lines = content.split('\n')

    // 1. Extraire le frontmatter
    if (lines.length < 3 || lines[0].trim() !== '---') {
      return { success: false, error: { line: 1, message: 'Frontmatter absent : le fichier doit commencer par ---' } }
    }

    let frontmatterEndLine = -1
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        frontmatterEndLine = i
        break
      }
    }

    if (frontmatterEndLine === -1) {
      return { success: false, error: { line: 1, message: 'Frontmatter non ferme : second --- manquant' } }
    }

    // 2. Parser le YAML du frontmatter (simple key: value)
    const frontmatterLines = lines.slice(1, frontmatterEndLine)
    const frontmatterData: Record<string, string> = {}
    for (const fmLine of frontmatterLines) {
      const trimmed = fmLine.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const colonIdx = trimmed.indexOf(':')
      if (colonIdx === -1) continue
      const key = trimmed.slice(0, colonIdx).trim()
      let value = trimmed.slice(colonIdx + 1).trim()
      // Remove surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      frontmatterData[key] = value
    }

    // 3. Valider via Zod
    const parsed = frontmatterSchema.safeParse(frontmatterData)
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]
      return { success: false, error: { line: 2, message: `Frontmatter invalide : ${firstError.path.join('.')} — ${firstError.message}` } }
    }

    // 4. Splitter le body par ## headings
    const bodyLines = lines.slice(frontmatterEndLine + 1)
    const body = bodyLines.join('\n')
    const sections = this.splitBySections(body)

    // 5. Construire le resultat
    const result: ParsedBardaInternal = {
      metadata: parsed.data,
      roles: [],
      commands: [],
      prompts: [],
      fragments: [],
      libraries: [],
      mcp: []
    }

    let hasContent = false

    for (const [sectionName, sectionBody] of sections) {
      const key = KNOWN_SECTIONS[sectionName]
      if (!key) continue // Section inconnue — ignore silencieusement

      const items = this.splitBySubsections(sectionBody)
      if (items.length === 0) continue

      hasContent = true

      for (const item of items) {
        const sanitizedContent = key === 'mcp'
          ? item.content.trim()
          : this.sanitizeContent(item.content.trim())

        if (key === 'mcp') {
          const mcpConfig = this.extractMcpConfig(sanitizedContent)
          result.mcp.push({
            name: item.name,
            content: sanitizedContent,
            mcpConfig: mcpConfig ?? undefined
          })
        } else {
          result[key].push({ name: item.name, content: sanitizedContent })
        }
      }
    }

    // 10. Rejeter si aucune section non-vide
    if (!hasContent) {
      return { success: false, error: { line: frontmatterEndLine + 1, message: 'Aucune section non-vide trouvee dans le fichier' } }
    }

    return { success: true, data: result }
  }

  /**
   * Split body text by ## headings into Map<sectionName, sectionBody>
   */
  private splitBySections(body: string): Map<string, string> {
    const sections = new Map<string, string>()
    const regex = /^## (.+)$/gm
    let match: RegExpExecArray | null
    const positions: Array<{ name: string; contentStart: number; matchStart: number }> = []

    while ((match = regex.exec(body)) !== null) {
      positions.push({
        name: match[1].trim(),
        contentStart: match.index + match[0].length,
        matchStart: match.index
      })
    }

    for (let i = 0; i < positions.length; i++) {
      const end = i + 1 < positions.length
        ? positions[i + 1].matchStart
        : body.length
      const content = body.slice(positions[i].contentStart, end).trim()
      sections.set(positions[i].name, content)
    }

    return sections
  }

  /**
   * Split section body by ### headings into Array<{ name, content }>
   */
  private splitBySubsections(sectionBody: string): Array<{ name: string; content: string }> {
    const items: Array<{ name: string; content: string }> = []
    const regex = /^### (.+)$/gm
    let match: RegExpExecArray | null
    const positions: Array<{ name: string; contentStart: number; matchStart: number }> = []

    while ((match = regex.exec(sectionBody)) !== null) {
      positions.push({
        name: match[1].trim(),
        contentStart: match.index + match[0].length,
        matchStart: match.index
      })
    }

    for (let i = 0; i < positions.length; i++) {
      const end = i + 1 < positions.length
        ? positions[i + 1].matchStart
        : sectionBody.length
      const content = sectionBody.slice(positions[i].contentStart, end)
      // Trim leading/trailing empty lines
      const trimmed = content.replace(/^\n+/, '').replace(/\n+$/, '')
      if (trimmed) {
        items.push({ name: positions[i].name, content: trimmed })
      }
    }

    return items
  }

  /**
   * Sanitize text content: escape XML special characters
   */
  private sanitizeContent(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  /**
   * Extract MCP config from fenced YAML block in content
   */
  private extractMcpConfig(content: string): {
    transportType: string
    command?: string
    args?: string[]
    url?: string
    headers?: Record<string, string>
  } | null {
    const yamlMatch = content.match(/```yaml\s*\n([\s\S]*?)```/)
    if (!yamlMatch) return null

    const yamlContent = yamlMatch[1]
    const config: Record<string, unknown> = {}

    // Simple YAML parser for flat + array values
    const lines = yamlContent.split('\n')
    let currentKey = ''
    let currentArray: string[] | null = null

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        if (currentArray && currentKey) {
          config[currentKey] = currentArray
          currentArray = null
          currentKey = ''
        }
        continue
      }

      // Array item
      if (trimmed.startsWith('- ') && currentArray !== null) {
        let value = trimmed.slice(2).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        currentArray.push(value)
        continue
      }

      // Flush pending array
      if (currentArray && currentKey) {
        config[currentKey] = currentArray
        currentArray = null
        currentKey = ''
      }

      const colonIdx = trimmed.indexOf(':')
      if (colonIdx === -1) continue

      const key = trimmed.slice(0, colonIdx).trim()
      let value = trimmed.slice(colonIdx + 1).trim()

      if (!value) {
        // Next lines might be array items
        currentKey = key
        currentArray = []
        continue
      }

      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }

      config[key] = value
    }

    // Flush last pending array
    if (currentArray && currentKey) {
      config[currentKey] = currentArray
    }

    if (!config.transportType && !config.transport_type) return null

    const transportType = String(config.transportType ?? config.transport_type ?? 'stdio')

    const result: {
      transportType: string
      command?: string
      args?: string[]
      url?: string
      headers?: Record<string, string>
    } = { transportType }

    if (config.command) result.command = String(config.command)
    if (Array.isArray(config.args)) result.args = config.args.map(String)
    if (config.url) result.url = String(config.url)
    if (config.headers && typeof config.headers === 'object') {
      result.headers = config.headers as Record<string, string>
    }

    return result
  }
}

export const bardaParserService = new BardaParserService()
