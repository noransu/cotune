import { create } from 'zustand'

export interface Workspace {
  id: string
  name: string
  path: string
}

interface WorkspaceStore {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  isLoaded: boolean

  loadWorkspaces: () => Promise<void>
  setActiveWorkspace: (id: string) => void
  addWorkspace: (ws: Workspace) => Promise<void>
  deleteWorkspace: (id: string) => Promise<void>
  updateWorkspace: (ws: Workspace) => Promise<void>
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspaces: [],
  activeWorkspaceId: null,
  isLoaded: false,

  loadWorkspaces: async () => {
    if (!window.api) {
      set({ isLoaded: true })
      return
    }
    const workspaces = await window.api.workspaceList()
    const activeId = await window.api.workspaceGetActive()
    set({ workspaces: workspaces || [], activeWorkspaceId: activeId, isLoaded: true })
  },

  setActiveWorkspace: (id: string) => {
    if (window.api) window.api.workspaceSetActive(id)
    set({ activeWorkspaceId: id })
  },

  addWorkspace: async (ws: Workspace) => {
    if (window.api) await window.api.workspaceCreate(ws)
    set((state) => ({
      workspaces: [...state.workspaces, ws],
      activeWorkspaceId: ws.id
    }))
  },

  deleteWorkspace: async (id: string) => {
    if (window.api) await window.api.workspaceDelete(id)
    set((state) => ({
      workspaces: state.workspaces.filter((w) => w.id !== id),
      activeWorkspaceId: state.activeWorkspaceId === id ? null : state.activeWorkspaceId
    }))
  },

  updateWorkspace: async (ws: Workspace) => {
    if (window.api) await window.api.workspaceUpdate(ws)
    set((state) => ({
      workspaces: state.workspaces.map((w) => (w.id === ws.id ? ws : w))
    }))
  }
}))
