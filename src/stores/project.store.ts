import { create } from 'zustand'

export interface BackendService {
  name: string // e.g. "user-service", "order-service"
  path: string
  command: string
  port: number
  framework: 'spring-boot' | 'express' | 'other'
  external?: boolean // true = managed externally (e.g. IDEA), CoTune only proxies
  contextPath?: string // e.g. "/trumpet-user" — from server.servlet.context-path
  apiPrefix?: string // e.g. "/api" — gateway prefix the frontend adds, stripped when forwarding to local backend
}

export interface ProjectConfig {
  id: string
  name: string
  frontend?: {
    path: string
    command: string
    port: number
  }
  backends: BackendService[] // supports multiple backend entry points
  proxyPort: number
  status: 'stopped' | 'running' | 'error'
}

interface ProjectStore {
  projects: ProjectConfig[]
  activeProjectId: string | null
  isLoaded: boolean

  loadProjects: () => Promise<void>
  setActiveProject: (id: string) => void
  addProject: (project: ProjectConfig) => Promise<void>
  updateProject: (project: ProjectConfig) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  setProjectStatus: (id: string, status: ProjectConfig['status']) => void
}

export const useProjectStore = create<ProjectStore>((set) => ({
  projects: [],
  activeProjectId: null,
  isLoaded: false,

  loadProjects: async () => {
    if (!window.api) { set({ isLoaded: true }); return }
    const raw = await window.api.projectList()
    // Migrate old format: if a project has `backend` (singular), convert to `backends` array
    const projects = (raw || []).map((p: any) => {
      if (p.backend && !p.backends) {
        return { ...p, backends: [p.backend], backend: undefined }
      }
      if (!p.backends) {
        return { ...p, backends: [] }
      }
      return p
    })
    const activeId = await window.api.projectGetActive()
    set({ projects, activeProjectId: activeId, isLoaded: true })
  },

  setActiveProject: (id: string) => {
    if (window.api) window.api.projectSetActive(id)
    set({ activeProjectId: id })
  },

  addProject: async (project: ProjectConfig) => {
    if (window.api) await window.api.projectCreate(project)
    set((state) => ({
      projects: [...state.projects, project],
      activeProjectId: project.id
    }))
  },

  updateProject: async (project: ProjectConfig) => {
    if (window.api) await window.api.projectUpdate(project)
    set((state) => ({
      projects: state.projects.map((p) => (p.id === project.id ? project : p))
    }))
  },

  deleteProject: async (id: string) => {
    if (window.api) await window.api.projectDelete(id)
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      activeProjectId: state.activeProjectId === id ? null : state.activeProjectId
    }))
  },

  setProjectStatus: (id: string, status: ProjectConfig['status']) => {
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, status } : p))
    }))
  }
}))
