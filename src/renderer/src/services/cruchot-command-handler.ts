import type { LiveCommandResult } from '../../../preload/types'

type CommandHandler = (args: Record<string, unknown>) => Promise<LiveCommandResult>

const VIEWS = ['settings', 'arena', 'customize', 'statistics', 'search', 'images', 'tasks', 'chat']
const CUSTOMIZE_TABS = ['prompts', 'roles', 'commands', 'memory', 'libraries', 'mcp', 'brigade']

class CruchotCommandHandler {
  private commands = new Map<string, CommandHandler>()

  constructor() {
    this.commands.set('navigate_to', this.navigateTo.bind(this))
    this.commands.set('toggle_ui', this.toggleUi.bind(this))
    this.commands.set('change_model', this.changeModel.bind(this))
    this.commands.set('change_thinking', this.changeThinking.bind(this))
    this.commands.set('send_prompt', this.sendPrompt.bind(this))
    this.commands.set('summarize_conversation', this.summarizeConversation.bind(this))
    this.commands.set('fork_conversation', this.forkConversation.bind(this))
    this.commands.set('get_current_state', this.getCurrentState.bind(this))
    this.commands.set('list_conversations', this.listConversations.bind(this))
    this.commands.set('list_models', this.listModels.bind(this))
  }

  async execute(name: string, args: Record<string, unknown>): Promise<LiveCommandResult> {
    const handler = this.commands.get(name)
    if (!handler) return { success: false, error: `Unknown command: ${name}` }
    try {
      return await handler(args)
    } catch (err: any) {
      return { success: false, error: err.message || String(err) }
    }
  }

  private async navigateTo(args: Record<string, unknown>): Promise<LiveCommandResult> {
    const target = args.target as string
    if (!target) return { success: false, error: 'Missing target' }

    // Customize sub-tabs: "customize:prompts", "customize:roles", etc.
    if (target.startsWith('customize:')) {
      const tab = target.split(':')[1]
      if (!CUSTOMIZE_TABS.includes(tab)) {
        return { success: false, error: `Unknown customize tab: ${tab}. Available: ${CUSTOMIZE_TABS.join(', ')}` }
      }
      window.dispatchEvent(new CustomEvent('cruchot:navigate', { detail: { view: 'customize', tab } }))
      return { success: true, data: { navigatedTo: target } }
    }

    // Top-level views
    if (VIEWS.includes(target)) {
      window.dispatchEvent(new CustomEvent('cruchot:navigate', { detail: { view: target } }))
      return { success: true, data: { navigatedTo: target } }
    }

    // Assume it's a conversation ID
    window.dispatchEvent(new CustomEvent('cruchot:navigate', { detail: { conversationId: target } }))
    return { success: true, data: { navigatedTo: `conversation:${target}` } }
  }

  private async toggleUi(args: Record<string, unknown>): Promise<LiveCommandResult> {
    const element = args.element as string
    const state = (args.state as string) || 'toggle'

    // Security: YOLO mode toggle is blocked from voice commands to prevent
    // voice-injected prompt execution without approval
    if (element === 'yolo') {
      return { success: false, error: 'YOLO mode cannot be toggled via voice commands (security restriction)' }
    }

    if (!['sidebar', 'right-panel'].includes(element)) {
      return { success: false, error: `Unknown element: ${element}. Available: sidebar, right-panel` }
    }

    window.dispatchEvent(new CustomEvent('cruchot:toggle-ui', { detail: { element, state } }))
    return { success: true, data: { element, state } }
  }

  private async changeModel(args: Record<string, unknown>): Promise<LiveCommandResult> {
    const modelId = args.modelId as string
    if (!modelId) return { success: false, error: 'Missing modelId' }
    if (!modelId.includes('::')) return { success: false, error: 'Invalid modelId format, expected providerId::modelId' }

    window.dispatchEvent(new CustomEvent('cruchot:change-model', { detail: { modelId } }))
    return { success: true, data: { modelId } }
  }

  private async changeThinking(args: Record<string, unknown>): Promise<LiveCommandResult> {
    const level = args.level as string
    if (!['off', 'low', 'medium', 'high'].includes(level)) {
      return { success: false, error: 'Invalid level. Expected: off, low, medium, high' }
    }

    window.dispatchEvent(new CustomEvent('cruchot:change-thinking', { detail: { level } }))
    return { success: true, data: { level } }
  }

  private async sendPrompt(args: Record<string, unknown>): Promise<LiveCommandResult> {
    const text = args.text as string
    if (!text) return { success: false, error: 'Missing text' }

    window.dispatchEvent(new CustomEvent('cruchot:send-prompt', { detail: { text } }))
    return { success: true, data: { sent: true, textLength: text.length } }
  }

  private async summarizeConversation(): Promise<LiveCommandResult> {
    window.dispatchEvent(new CustomEvent('cruchot:summarize'))
    return { success: true, data: { message: 'Résumé en cours de génération' } }
  }

  private async forkConversation(): Promise<LiveCommandResult> {
    window.dispatchEvent(new CustomEvent('cruchot:fork'))
    return { success: true, data: { message: 'Conversation dupliquée' } }
  }

  private async getCurrentState(): Promise<LiveCommandResult> {
    const { useUiStore } = await import('@/stores/ui.store')
    const { useProvidersStore } = await import('@/stores/providers.store')
    const { useConversationsStore } = await import('@/stores/conversations.store')

    const currentView = useUiStore.getState().currentView
    const selectedModelId = useProvidersStore.getState().getSelectedModelId()
    const conversations = useConversationsStore.getState().conversations

    return {
      success: true,
      data: {
        currentView,
        selectedModelId,
        conversations: conversations.slice(0, 20).map(c => ({
          id: c.id,
          title: c.title,
          modelId: c.modelId,
        }))
      }
    }
  }

  private async listConversations(args: Record<string, unknown>): Promise<LiveCommandResult> {
    const limit = (args.limit as number) || 20
    const { useConversationsStore } = await import('@/stores/conversations.store')
    const conversations = useConversationsStore.getState().conversations

    return {
      success: true,
      data: conversations.slice(0, limit).map(c => ({
        id: c.id,
        title: c.title,
        modelId: c.modelId,
        updatedAt: c.updatedAt,
      }))
    }
  }

  private async listModels(): Promise<LiveCommandResult> {
    const { useProvidersStore } = await import('@/stores/providers.store')
    const models = useProvidersStore.getState().models

    return {
      success: true,
      data: models.map(m => ({
        id: `${m.providerId}::${m.id}`,
        name: m.name,
        provider: m.providerId,
      }))
    }
  }
}

export const cruchotCommandHandler = new CruchotCommandHandler()
