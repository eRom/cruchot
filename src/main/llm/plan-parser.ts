import type { PlanData, PlanStep } from '../../preload/types'

const PLAN_BLOCK_RE = /\[PLAN:start(?::(\w+))?\](.*?)\[PLAN:title\](.*?)\[PLAN:end\]/s
const STEP_TOOLS_RE = /\[STEP:tools:([^\]]+)\]/

export function parsePlanMarkers(text: string): PlanData | null {
  const match = PLAN_BLOCK_RE.exec(text)
  if (!match) return null

  const level = (match[1] === 'light' ? 'light' : 'full') as 'light' | 'full'
  const title = match[2].trim()
  const stepsBlock = match[3]

  const steps: PlanStep[] = []
  // Create a fresh regex each call to avoid lastIndex state issues.
  // Lookahead stops at next numbered step or end of string (tools markers like
  // [STEP:tools:...] must NOT trigger the lookahead, hence \d+ not just \w+).
  const stepDefRe = /\[STEP:(\d+)\](.*?)(?=\[STEP:\d+\]|$)/gs

  let stepMatch: RegExpExecArray | null
  while ((stepMatch = stepDefRe.exec(stepsBlock)) !== null) {
    const id = parseInt(stepMatch[1], 10)
    let label = stepMatch[2].trim()
    const toolsMatch = STEP_TOOLS_RE.exec(label)
    let tools: string[] | undefined

    if (toolsMatch) {
      tools = toolsMatch[1].split(',').map(t => t.trim())
      label = label.replace(STEP_TOOLS_RE, '').trim()
    }

    steps.push({ id, label, tools, status: 'pending', enabled: true })
  }

  if (steps.length === 0) return null

  return {
    title,
    steps,
    status: 'proposed',
    level
  }
}

export function parseStepMarker(
  text: string
): { index: number; status: 'running' | 'done' | 'failed' | 'skipped' }[] {
  // Use a fresh regex each call to avoid lastIndex state issues
  const re = /\[STEP:(\d+):(start|done|failed|skipped)\]/g
  const results: { index: number; status: 'running' | 'done' | 'failed' | 'skipped' }[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const index = parseInt(match[1], 10)
    if (index < 1) continue
    const rawStatus = match[2]
    const status = (rawStatus === 'start' ? 'running' : rawStatus) as
      | 'running'
      | 'done'
      | 'failed'
      | 'skipped'
    results.push({ index, status })
  }
  return results
}

export function stripPlanMarkers(text: string): string {
  // Use inline regexes to avoid lastIndex state issues with module-level /g regexes
  return text
    .replace(/\[PLAN:start(?::(\w+))?\](.*?)\[PLAN:title\](.*?)\[PLAN:end\]/gs, '')
    .replace(/\[(?:PLAN|STEP):[^\]]*\]/g, '')
}
