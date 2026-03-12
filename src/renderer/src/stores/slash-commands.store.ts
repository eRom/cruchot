import { create } from 'zustand'
import type { SlashCommandInfo } from '../../../preload/types'

export type SlashCommand = SlashCommandInfo

interface SlashCommandsState {
  commands: SlashCommand[]
  loading: boolean

  loadCommands: () => Promise<void>
  addCommand: (cmd: SlashCommand) => void
  updateCommand: (id: string, cmd: SlashCommand) => void
  removeCommand: (id: string) => void
  setCommands: (commands: SlashCommand[]) => void
}

export const useSlashCommandsStore = create<SlashCommandsState>((set, get) => ({
  commands: [],
  loading: false,

  loadCommands: async () => {
    set({ loading: true })
    try {
      const commands = await window.api.slashCommandsList()
      set({ commands })
    } finally {
      set({ loading: false })
    }
  },

  addCommand: (cmd) => {
    set({ commands: [...get().commands, cmd] })
  },

  updateCommand: (id, cmd) => {
    set({ commands: get().commands.map((c) => (c.id === id ? cmd : c)) })
  },

  removeCommand: (id) => {
    set({ commands: get().commands.filter((c) => c.id !== id) })
  },

  setCommands: (commands) => {
    set({ commands })
  }
}))
