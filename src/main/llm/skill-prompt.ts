import type { SkillInfo } from '../services/skill.service'

/**
 * Build the <available-skills> block for injection into the system prompt.
 * Returns empty string if no skills are available.
 */
export function buildAvailableSkillsBlock(skills: SkillInfo[]): string {
  if (!skills.length) return ''

  let block = '<available-skills>\n'
  block += 'Skills specialises disponibles. Utilise l\'outil loadSkill(name) pour charger les instructions completes d\'un skill quand la demande de l\'utilisateur correspond.\n\n'
  for (const s of skills) {
    block += `- ${s.name}: ${s.description}\n`
  }
  block += '</available-skills>'
  return block
}
