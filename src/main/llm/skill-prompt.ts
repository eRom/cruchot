/**
 * Build the <skill-context> block injected into the system prompt.
 * Reads the SKILL.md, substitutes variables, executes shell blocks via Seatbelt,
 * then wraps the expanded content in XML.
 */
import path from 'node:path'
import fs from 'node:fs'
import { skillService, type ParsedSkill } from '../services/skill.service'
import { execSandboxed } from '../services/seatbelt'

// ── Shell block patterns ───────────────────────────────────────────────────

// Block pattern: lines starting with `!` followed by triple backticks, content, closing backticks
// e.g.:
//   ! ```
//   ls -la
//   ```
const BLOCK_SHELL_REGEX = /^!\s*```\s*\n([\s\S]*?)```/gm

// Inline pattern: `!` followed by backtick-wrapped command
// e.g.: !`date`
const INLINE_SHELL_REGEX = /!`([^`]+)`/g

// ── Sanitization helpers ───────────────────────────────────────────────────

function sanitizeName(name: string): string {
  return name.replace(/["<>&]/g, '')
}

function sanitizeContent(content: string): string {
  return content.replace(/<\/skill-context>/gi, '&lt;/skill-context&gt;')
}

// ── Shell block execution ──────────────────────────────────────────────────

interface ShellMatch {
  index: number
  length: number
  command: string
}

/**
 * Find all block and inline shell patterns in content.
 * Returns matches with their position, length and command string.
 */
function findShellMatches(content: string): ShellMatch[] {
  const matches: ShellMatch[] = []

  // Block matches
  let match: RegExpExecArray | null
  BLOCK_SHELL_REGEX.lastIndex = 0
  while ((match = BLOCK_SHELL_REGEX.exec(content)) !== null) {
    matches.push({
      index: match.index,
      length: match[0].length,
      command: match[1].trim()
    })
  }

  // Inline matches
  INLINE_SHELL_REGEX.lastIndex = 0
  while ((match = INLINE_SHELL_REGEX.exec(content)) !== null) {
    matches.push({
      index: match.index,
      length: match[0].length,
      command: match[1].trim()
    })
  }

  // Sort by position descending for safe reverse-order replacement
  matches.sort((a, b) => b.index - a.index)

  return matches
}

/**
 * Execute all shell blocks found in content via Seatbelt.
 * Processes matches in reverse order to preserve string indices.
 * Each shell block is replaced with its stdout output (+ [stderr] if any).
 */
async function executeShellBlocks(content: string, workspacePath: string): Promise<string> {
  const matches = findShellMatches(content)

  if (matches.length === 0) return content

  let result = content

  for (const shellMatch of matches) {
    let replacement = ''
    try {
      const { stdout, stderr } = await execSandboxed(shellMatch.command, workspacePath, {
        timeout: 30_000
      })
      replacement = stdout
      if (stderr && stderr.trim().length > 0) {
        replacement += `\n[stderr] ${stderr.trim()}`
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      replacement = `[shell error] ${message}`
    }

    result =
      result.slice(0, shellMatch.index) +
      replacement +
      result.slice(shellMatch.index + shellMatch.length)
  }

  return result
}

// ── Main builder ───────────────────────────────────────────────────────────

/**
 * Build a <skill-context> XML block for injection into the system prompt.
 *
 * Steps:
 * 1. Read ~/.cruchot/skills/<skillName>/SKILL.md
 * 2. Parse frontmatter via skillService.parseSkillContent()
 * 3. Substitute ${SKILL_DIR} and ${WORKSPACE_PATH} variables
 * 4. Execute shell blocks via Seatbelt (block + inline patterns)
 * 5. Wrap in <skill-context name="..."> XML
 *
 * Returns null if the skill file cannot be found or read.
 */
export async function buildSkillContextBlock(
  skillName: string,
  args: string,
  workspacePath: string
): Promise<{ block: string; parsedSkill: ParsedSkill } | null> {
  const skillsDir = skillService.getSkillsDir()
  const safeSkillName = path.basename(skillName)
  const skillDir = path.join(skillsDir, safeSkillName)
  const skillMdPath = path.join(skillDir, 'SKILL.md')

  // 1. Read SKILL.md
  let rawContent: string
  try {
    rawContent = fs.readFileSync(skillMdPath, 'utf-8')
  } catch {
    return null
  }

  // 2. Parse frontmatter
  let parsedSkill: ParsedSkill
  try {
    parsedSkill = skillService.parseSkillContent(rawContent)
  } catch {
    return null
  }

  // 3. Substitute variables in body content
  let content = skillService.substituteVariables(parsedSkill.content, skillDir, workspacePath)

  // 4. Execute shell blocks
  content = await executeShellBlocks(content, workspacePath)

  // 5. Sanitize and wrap in XML
  const sanitizedName = sanitizeName(safeSkillName)
  const sanitizedContent = sanitizeContent(content)

  let block = `<skill-context name="${sanitizedName}">\n${sanitizedContent}`

  if (args && args.trim().length > 0) {
    block += `\n\nARGUMENTS: ${args.trim()}`
  }

  block += '\n</skill-context>'

  return { block, parsedSkill }
}
