import { create } from 'zustand'

export interface PromptVariable {
  name: string
  description?: string
}

export interface Prompt {
  id: string
  title: string
  content: string
  category?: string | null
  tags?: string[] | null
  type: 'complet' | 'complement' | 'system'
  variables?: PromptVariable[] | null
  namespace?: string | null
  createdAt: Date
  updatedAt: Date
}

interface PromptsState {
  prompts: Prompt[]
  selectedPromptId: string | null

  setPrompts: (prompts: Prompt[]) => void
  setSelectedPrompt: (id: string | null) => void
  addPrompt: (prompt: Prompt) => void
  updatePrompt: (id: string, updates: Partial<Prompt>) => void
  removePrompt: (id: string) => void
}

export const usePromptsStore = create<PromptsState>((set) => ({
  prompts: [],
  selectedPromptId: null,

  setPrompts: (prompts) => set({ prompts }),

  setSelectedPrompt: (id) => set({ selectedPromptId: id }),

  addPrompt: (prompt) =>
    set((state) => ({
      prompts: [prompt, ...state.prompts]
    })),

  updatePrompt: (id, updates) =>
    set((state) => ({
      prompts: state.prompts.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      )
    })),

  removePrompt: (id) =>
    set((state) => ({
      prompts: state.prompts.filter((p) => p.id !== id),
      selectedPromptId:
        state.selectedPromptId === id ? null : state.selectedPromptId
    }))
}))
