import { create } from 'zustand'

export interface DailyStat {
  date: string
  cost: number
  messages: number
  tokensIn: number
  tokensOut: number
}

export interface ProviderStat {
  provider: string
  cost: number
  messages: number
}

export interface ModelStat {
  model: string
  provider: string
  messages: number
  tokens: number
}

export interface ProjectStat {
  projectId: string | null
  projectName: string
  projectColor: string | null
  cost: number
  messages: number
  tokensIn: number
  tokensOut: number
  conversations: number
}

export type StatsPeriod = '7d' | '30d' | '90d' | 'all'

function periodToDays(period: StatsPeriod): number {
  switch (period) {
    case '7d': return 7
    case '30d': return 30
    case '90d': return 90
    case 'all': return 0
  }
}

interface StatsState {
  dailyStats: DailyStat[]
  providerStats: ProviderStat[]
  modelStats: ModelStat[]
  projectStats: ProjectStat[]
  totalCost: number
  totalMessages: number
  totalTokensIn: number
  totalTokensOut: number
  totalResponseTimeMs: number
  totalConversations: number
  totalTtsCost: number
  selectedPeriod: StatsPeriod
  isLoading: boolean
  error: string | null

  setSelectedPeriod: (period: StatsPeriod) => void
  loadStats: () => Promise<void>
}

export const useStatsStore = create<StatsState>((set, get) => ({
  dailyStats: [],
  providerStats: [],
  modelStats: [],
  projectStats: [],
  totalCost: 0,
  totalMessages: 0,
  totalTokensIn: 0,
  totalTokensOut: 0,
  totalResponseTimeMs: 0,
  totalConversations: 0,
  totalTtsCost: 0,
  selectedPeriod: '30d',
  isLoading: false,
  error: null,

  setSelectedPeriod: (selectedPeriod) => {
    set({ selectedPeriod })
    get().loadStats()
  },

  loadStats: async () => {
    set({ isLoading: true, error: null })

    try {
      const days = periodToDays(get().selectedPeriod)

      const [rawDaily, rawProviders, rawModels, rawGlobal, rawProjects] = await Promise.all([
        window.api.getDailyStats(days || undefined),
        window.api.getProviderStats(days || undefined),
        window.api.getModelStats(days || undefined),
        window.api.getGlobalStats(days || undefined),
        window.api.getProjectStats(days || undefined)
      ])

      const dailyStats: DailyStat[] = (rawDaily ?? []).map((d) => ({
        date: d.date,
        cost: d.totalCost ?? 0,
        messages: d.messagesCount ?? 0,
        tokensIn: d.tokensIn ?? 0,
        tokensOut: d.tokensOut ?? 0
      }))

      const providerStats: ProviderStat[] = (rawProviders ?? []).map((p) => ({
        provider: p.providerId ?? 'unknown',
        cost: p.totalCost ?? 0,
        messages: p.messagesCount ?? 0
      }))

      const modelStats: ModelStat[] = (rawModels ?? []).map((m) => ({
        model: m.modelId ?? 'unknown',
        provider: m.providerId ?? 'unknown',
        messages: m.messagesCount ?? 0,
        tokens: (m.tokensIn ?? 0) + (m.tokensOut ?? 0)
      }))

      const projectStats: ProjectStat[] = (rawProjects ?? []).map((p) => ({
        projectId: p.projectId,
        projectName: p.projectName ?? 'Sans projet',
        projectColor: p.projectColor,
        cost: p.totalCost ?? 0,
        messages: p.messagesCount ?? 0,
        tokensIn: p.tokensIn ?? 0,
        tokensOut: p.tokensOut ?? 0,
        conversations: p.conversationsCount ?? 0
      }))

      set({
        dailyStats,
        providerStats,
        modelStats,
        projectStats,
        totalCost: rawGlobal?.totalCost ?? 0,
        totalMessages: rawGlobal?.totalMessages ?? 0,
        totalTokensIn: rawGlobal?.totalTokensIn ?? 0,
        totalTokensOut: rawGlobal?.totalTokensOut ?? 0,
        totalResponseTimeMs: rawGlobal?.totalResponseTimeMs ?? 0,
        totalConversations: rawGlobal?.totalConversations ?? 0,
        totalTtsCost: rawGlobal?.totalTtsCost ?? 0,
        isLoading: false
      })
    } catch (error) {
      console.error('[Stats] Failed to load statistics:', error)
      set({
        dailyStats: [],
        providerStats: [],
        modelStats: [],
        projectStats: [],
        totalCost: 0,
        totalMessages: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
        totalResponseTimeMs: 0,
        totalConversations: 0,
        totalTtsCost: 0,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load statistics'
      })
    }
  }
}))
