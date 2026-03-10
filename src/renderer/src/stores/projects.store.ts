import { create } from 'zustand'

export interface Project {
  id: string
  name: string
  description?: string | null
  systemPrompt?: string | null
  defaultModelId?: string | null
  color?: string | null
  workspacePath?: string | null
  createdAt: Date
  updatedAt: Date
}

interface ProjectsState {
  projects: Project[]
  activeProjectId: string | null

  setProjects: (projects: Project[]) => void
  setActiveProject: (id: string | null) => void
  addProject: (project: Project) => void
  updateProject: (id: string, updates: Partial<Project>) => void
  removeProject: (id: string) => void
}

export const useProjectsStore = create<ProjectsState>((set) => ({
  projects: [],
  activeProjectId: null,

  setProjects: (projects) => set({ projects }),

  setActiveProject: (id) => set({ activeProjectId: id }),

  addProject: (project) =>
    set((state) => ({
      projects: [project, ...state.projects]
    })),

  updateProject: (id, updates) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      )
    })),

  removeProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      activeProjectId:
        state.activeProjectId === id ? null : state.activeProjectId
    }))
}))
