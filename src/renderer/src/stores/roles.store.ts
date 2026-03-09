import { create } from 'zustand'

export interface Role {
  id: string
  name: string
  description?: string | null
  systemPrompt?: string | null
  icon?: string | null
  isBuiltin: boolean
  createdAt: Date
  updatedAt: Date
}

interface RolesState {
  roles: Role[]
  activeRoleId: string | null

  setRoles: (roles: Role[]) => void
  setActiveRole: (id: string | null) => void
  addRole: (role: Role) => void
  updateRole: (id: string, updates: Partial<Role>) => void
  removeRole: (id: string) => void
}

export const useRolesStore = create<RolesState>((set) => ({
  roles: [],
  activeRoleId: null,

  setRoles: (roles) => set({ roles }),

  setActiveRole: (id) => set({ activeRoleId: id }),

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
        state.activeRoleId === id ? null : state.activeRoleId
    }))
}))
