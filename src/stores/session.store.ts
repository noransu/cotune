import { create } from 'zustand'

export interface SessionRecord {
  id: string
  title: string
  slug: string
  directory: string
  projectId: string
  timeCreated: number
  timeUpdated: number
}

export interface PartRecord {
  id: string
  messageId: string
  sessionId: string
  timeCreated: number
  type: string
  text: string
  role: string // 'user' | 'assistant' | 'unknown'
}

interface SessionStore {
  sessions: SessionRecord[]
  selectedSessionId: string | null
  parts: PartRecord[]
  isLoading: boolean
  dbExists: boolean

  checkDb: () => Promise<void>
  loadSessions: (directories: string[]) => Promise<void>
  selectSession: (sessionId: string) => Promise<void>
  clearSelection: () => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  selectedSessionId: null,
  parts: [],
  isLoading: false,
  dbExists: false,

  checkDb: async () => {
    if (!window.api) return
    const exists = await window.api.sessionDbExists()
    set({ dbExists: exists })
  },

  loadSessions: async (directories: string[]) => {
    if (!window.api || directories.length === 0) {
      set({ sessions: [] })
      return
    }
    set({ isLoading: true })
    try {
      const sessions = await window.api.sessionList({ directories, limit: 50 })
      set({ sessions: sessions || [], isLoading: false })
    } catch {
      set({ sessions: [], isLoading: false })
    }
  },

  selectSession: async (sessionId: string) => {
    if (!window.api) return
    set({ selectedSessionId: sessionId, isLoading: true })
    try {
      const parts = await window.api.sessionGetParts({
        sessionId,
        types: ['text'],
        limit: 100
      })
      set({ parts: parts || [], isLoading: false })
    } catch {
      set({ parts: [], isLoading: false })
    }
  },

  clearSelection: () => {
    set({ selectedSessionId: null, parts: [] })
  }
}))
