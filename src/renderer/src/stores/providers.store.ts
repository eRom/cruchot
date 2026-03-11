import { create } from 'zustand'

export interface Provider {
  id: string
  name: string
  type: 'cloud' | 'local'
  description: string
  icon: string
  requiresApiKey: boolean
  isConfigured: boolean
  isEnabled: boolean
  isOnline?: boolean
}

export interface Model {
  id: string
  providerId: string
  name: string
  displayName: string
  type: 'text' | 'image'
  contextWindow: number
  inputPrice: number
  outputPrice: number
  supportsImages: boolean
  supportsStreaming: boolean
  supportsThinking: boolean
}

interface ProvidersState {
  providers: Provider[]
  models: Model[]
  selectedModelId: string | null
  selectedProviderId: string | null

  setProviders: (providers: Provider[]) => void
  setModels: (models: Model[]) => void
  selectModel: (providerId: string, modelId: string) => void
  updateProviderStatus: (providerId: string, isConfigured: boolean) => void
  setProviderOnline: (providerId: string, online: boolean) => void
  setLocalModels: (providerId: string, models: Model[]) => void
}

export const useProvidersStore = create<ProvidersState>((set) => ({
  providers: [],
  models: [],
  selectedModelId: null,
  selectedProviderId: null,

  setProviders: (providers) => set({ providers }),
  setModels: (models) => set({ models }),

  selectModel: (providerId, modelId) =>
    set({ selectedProviderId: providerId, selectedModelId: modelId }),

  updateProviderStatus: (providerId, isConfigured) =>
    set((state) => ({
      providers: state.providers.map((p) =>
        p.id === providerId ? { ...p, isConfigured } : p
      )
    })),

  setProviderOnline: (providerId, online) =>
    set((state) => ({
      providers: state.providers.map((p) =>
        p.id === providerId ? { ...p, isOnline: online } : p
      )
    })),

  setLocalModels: (providerId, models) =>
    set((state) => ({
      models: [
        ...state.models.filter((m) => m.providerId !== providerId),
        ...models
      ]
    }))
}))
