import { tool } from 'ai'
import { z } from 'zod'
import { skillService } from '../services/skill.service'

/**
 * Build the AI SDK tool for loading skills.
 * Returns empty object if no skills are available.
 */
export function buildSkillTool(): Record<string, unknown> {
  const skills = skillService.getAll()
  if (skills.length === 0) return {}

  const skillList = skills.map(s => `${s.name} (${s.description})`).join(', ')

  return {
    loadSkill: tool({
      description: `Charge un skill specialise avec ses instructions completes. Utilise cet outil quand la demande de l'utilisateur correspond a un skill disponible. Skills disponibles : ${skillList}`,
      inputSchema: z.object({
        name: z.string().describe('Nom du skill a charger')
      }),
      execute: async ({ name }) => {
        const skill = skillService.get(name)
        if (!skill) return `Skill "${name}" introuvable.`

        let output = `<skill_content name="${name}">\n`
        output += `# Skill: ${name}\n\n`
        output += skill.content.trim() + '\n\n'
        output += `Base directory for this skill: ${skill.baseDir}\n`
        output += `Relative paths in this skill are relative to this base directory.\n`

        if (skill.companionFiles.length > 0) {
          output += '\n<skill_files>\n'
          for (const f of skill.companionFiles) {
            output += `<file>${skill.baseDir}/${f}</file>\n`
          }
          output += '</skill_files>\n'
        }

        output += '</skill_content>'
        return output
      }
    })
  }
}
