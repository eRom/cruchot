import { create } from 'zustand'

export interface ArenaMessage {
  id?: string
  content: string
  reasoning?: string
  isStreaming: boolean
  streamPhase: 'processing' | 'reasoning' | 'generating' | null
  modelId?: string
  providerId?: string
  tokensIn?: number
  tokensOut?: number
  cost?: number
  responseTimeMs?: number
  error?: string
}

export interface ArenaRound {
  userContent: string
  leftMessage: ArenaMessage
  rightMessage: ArenaMessage
  vote: string | null
  matchId: string
}

interface ArenaState {
  // Model selection
  leftProviderId: string | null
  leftModelId: string | null
  rightProviderId: string | null
  rightModelId: string | null

  // Current streaming state
  leftMessage: ArenaMessage | null
  rightMessage: ArenaMessage | null

  // Match state
  currentMatchId: string | null
  currentUserContent: string | null
  vote: 'left' | 'right' | 'tie' | null
  isStreaming: boolean

  // Conversation rounds history
  rounds: ArenaRound[]

  // Arena conversation id
  arenaConversationId: string | null

  // Actions
  setLeftModel: (providerId: string, modelId: string) => void
  setRightModel: (providerId: string, modelId: string) => void
  startLeftStream: (modelId: string, providerId: string) => void
  startRightStream: (modelId: string, providerId: string) => void
  appendToLeft: (content: string) => void
  appendToRight: (content: string) => void
  appendReasoningLeft: (text: string) => void
  appendReasoningRight: (text: string) => void
  finishLeft: (data: Partial<ArenaMessage>) => void
  finishRight: (data: Partial<ArenaMessage>) => void
  errorLeft: (error: string) => void
  errorRight: (error: string) => void
  setVote: (vote: 'left' | 'right' | 'tie') => void
  setCurrentMatchId: (id: string | null) => void
  setCurrentUserContent: (content: string | null) => void
  setArenaConversationId: (id: string | null) => void
  archiveCurrentRound: () => void
  setRounds: (rounds: ArenaRound[]) => void
  reset: () => void
  resetStreaming: () => void
}

const emptyMessage = (): ArenaMessage => ({
  content: '',
  isStreaming: true,
  streamPhase: 'processing'
})

export const useArenaStore = create<ArenaState>((set, get) => ({
  leftProviderId: null,
  leftModelId: null,
  rightProviderId: null,
  rightModelId: null,
  leftMessage: null,
  rightMessage: null,
  currentMatchId: null,
  currentUserContent: null,
  vote: null,
  isStreaming: false,
  rounds: [],
  arenaConversationId: null,

  setLeftModel: (providerId, modelId) => set({ leftProviderId: providerId, leftModelId: modelId }),
  setRightModel: (providerId, modelId) => set({ rightProviderId: providerId, rightModelId: modelId }),

  startLeftStream: (modelId, providerId) => set({
    leftMessage: { ...emptyMessage(), modelId, providerId },
    isStreaming: true
  }),
  startRightStream: (modelId, providerId) => set({
    rightMessage: { ...emptyMessage(), modelId, providerId },
    isStreaming: true
  }),

  appendToLeft: (content) => set((s) => ({
    leftMessage: s.leftMessage
      ? { ...s.leftMessage, content: s.leftMessage.content + content, streamPhase: 'generating' }
      : null
  })),
  appendToRight: (content) => set((s) => ({
    rightMessage: s.rightMessage
      ? { ...s.rightMessage, content: s.rightMessage.content + content, streamPhase: 'generating' }
      : null
  })),

  appendReasoningLeft: (text) => set((s) => ({
    leftMessage: s.leftMessage
      ? { ...s.leftMessage, reasoning: (s.leftMessage.reasoning ?? '') + text, streamPhase: 'reasoning' }
      : null
  })),
  appendReasoningRight: (text) => set((s) => ({
    rightMessage: s.rightMessage
      ? { ...s.rightMessage, reasoning: (s.rightMessage.reasoning ?? '') + text, streamPhase: 'reasoning' }
      : null
  })),

  finishLeft: (data) => set((s) => ({
    leftMessage: s.leftMessage
      ? { ...s.leftMessage, ...data, isStreaming: false, streamPhase: null }
      : null,
    isStreaming: s.rightMessage?.isStreaming ?? false
  })),
  finishRight: (data) => set((s) => ({
    rightMessage: s.rightMessage
      ? { ...s.rightMessage, ...data, isStreaming: false, streamPhase: null }
      : null,
    isStreaming: s.leftMessage?.isStreaming ?? false
  })),

  errorLeft: (error) => set((s) => ({
    leftMessage: s.leftMessage
      ? { ...s.leftMessage, error, isStreaming: false, streamPhase: null }
      : { content: '', error, isStreaming: false, streamPhase: null },
    isStreaming: s.rightMessage?.isStreaming ?? false
  })),
  errorRight: (error) => set((s) => ({
    rightMessage: s.rightMessage
      ? { ...s.rightMessage, error, isStreaming: false, streamPhase: null }
      : { content: '', error, isStreaming: false, streamPhase: null },
    isStreaming: s.leftMessage?.isStreaming ?? false
  })),

  setVote: (vote) => set({ vote }),
  setCurrentMatchId: (id) => set({ currentMatchId: id }),
  setCurrentUserContent: (content) => set({ currentUserContent: content }),
  setArenaConversationId: (id) => set({ arenaConversationId: id }),

  archiveCurrentRound: () => {
    const s = get()
    if (!s.leftMessage || !s.rightMessage || !s.currentUserContent || !s.currentMatchId) return

    const round: ArenaRound = {
      userContent: s.currentUserContent,
      leftMessage: { ...s.leftMessage },
      rightMessage: { ...s.rightMessage },
      vote: s.vote,
      matchId: s.currentMatchId
    }
    set((prev) => ({
      rounds: [...prev.rounds, round],
      leftMessage: null,
      rightMessage: null,
      currentMatchId: null,
      currentUserContent: null,
      vote: null,
      isStreaming: false
    }))
  },

  setRounds: (rounds) => set({ rounds }),

  reset: () => set({
    leftMessage: null,
    rightMessage: null,
    currentMatchId: null,
    currentUserContent: null,
    vote: null,
    isStreaming: false,
    rounds: [],
    arenaConversationId: null
  }),

  resetStreaming: () => set({
    leftMessage: null,
    rightMessage: null,
    currentMatchId: null,
    currentUserContent: null,
    vote: null,
    isStreaming: false
  })
}))
