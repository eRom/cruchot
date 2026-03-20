import { create } from 'zustand'

export interface RoleVariable {
  name: string
  description?: string
}

export interface Role {
  id: string
  name: string
  description?: string | null
  systemPrompt?: string | null
  icon?: string | null
  isBuiltin: boolean
  category?: string | null
  tags?: string[] | null
  variables?: RoleVariable[] | null
  namespace?: string | null
  createdAt: Date
  updatedAt: Date
}

interface RolesState {
  roles: Role[]
  activeRoleId: string | null
  activeSystemPrompt: string | null

  setRoles: (roles: Role[]) => void
  setActiveRole: (id: string | null) => void
  setActiveSystemPrompt: (prompt: string | null) => void
  addRole: (role: Role) => void
  updateRole: (id: string, updates: Partial<Role>) => void
  removeRole: (id: string) => void
}

export const useRolesStore = create<RolesState>((set) => ({
  roles: [],
  activeRoleId: null,
  activeSystemPrompt: null,

  setRoles: (roles) => set({ roles }),

  setActiveRole: (id) => set({ activeRoleId: id }),

  setActiveSystemPrompt: (prompt) => set({ activeSystemPrompt: prompt }),

  addRole: (role) =>
    set((state) => ({
      roles: [role, ...state.roles]
    })),

  updateRole: (id, updates) =>
    set((state) => ({
      roles: state.roles.map((r) =>
        r.id === id ? { ...r, ...updates } : r
      )
    })),

  removeRole: (id) =>
    set((state) => ({
      roles: state.roles.filter((r) => r.id !== id),
      activeRoleId:
        state.activeRoleId === id ? null : state.activeRoleId,
      activeSystemPrompt:
        state.activeRoleId === id ? null : state.activeSystemPrompt
    }))
}))
