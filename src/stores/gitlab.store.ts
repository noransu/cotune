import { create } from 'zustand'

// ===== Types =====

export interface GitLabInstance {
  id: string
  name: string
  url: string
  token: string
  avatarUrl?: string
  username?: string
}

export interface GitLabGroup {
  id: number
  name: string
  full_path: string
  description: string
  web_url: string
}

export type SearchScope = 'blobs' | 'projects' | 'commits'

export interface BlobResult {
  basename: string
  data: string
  path: string
  filename: string
  ref: string
  startline: number
  project_id: number
  // Enriched client-side (from project lookup in search response)
  _projectPath?: string
  _projectName?: string
}

export interface ProjectResult {
  id: number
  name: string
  name_with_namespace: string
  path_with_namespace: string
  description: string | null
  web_url: string
  default_branch: string
  star_count: number
  forks_count: number
  last_activity_at: string
  avatar_url: string | null
}

export interface CommitResult {
  id: string
  short_id: string
  title: string
  message: string
  author_name: string
  author_email: string
  authored_date: string
  committed_date: string
  project_id: number
  web_url: string
  _projectPath?: string
  _projectName?: string
}

export interface PreviewFile {
  content: string
  filePath: string
  ref: string
  startLine: number
  projectId: number
  projectPath: string
  instanceId: string
}

interface SearchResults {
  blobs: BlobResult[]
  projects: ProjectResult[]
  commits: CommitResult[]
}

interface SearchCounts {
  blobs: number
  projects: number
  commits: number
}

interface GitLabState {
  // Instances
  instances: GitLabInstance[]
  activeInstanceId: string | null
  isLoaded: boolean

  // Groups
  groups: GitLabGroup[]
  groupsLoading: boolean

  // Search
  query: string
  activeScope: SearchScope
  searchLevel: 'global' | 'group'
  selectedGroupId: number | null
  results: SearchResults
  counts: SearchCounts
  currentPage: Record<SearchScope, number>
  hasMore: Record<SearchScope, boolean>
  loading: boolean
  searchError: string | null

  // Preview
  preview: PreviewFile | null
  previewLoading: boolean

  // Show setup
  showSetup: boolean

  // Actions
  loadInstances: () => Promise<void>
  setActiveInstance: (id: string | null) => void
  addInstance: (data: { name: string; url: string; token: string }) => Promise<GitLabInstance>
  removeInstance: (id: string) => Promise<void>

  loadGroups: () => Promise<void>
  setSearchLevel: (level: 'global' | 'group') => void
  setSelectedGroup: (groupId: number | null) => void

  setQuery: (query: string) => void
  setActiveScope: (scope: SearchScope) => void
  search: () => Promise<void>
  searchAllScopes: () => Promise<void>
  loadMore: () => Promise<void>
  clearResults: () => void

  openPreview: (data: {
    instanceId: string
    projectId: number
    filePath: string
    ref: string
    startLine: number
    projectPath: string
  }) => Promise<void>
  closePreview: () => void

  setShowSetup: (show: boolean) => void
}

const emptyResults: SearchResults = { blobs: [], projects: [], commits: [] }
const emptyCounts: SearchCounts = { blobs: 0, projects: 0, commits: 0 }
const defaultPage: Record<SearchScope, number> = { blobs: 1, projects: 1, commits: 1 }
const defaultHasMore: Record<SearchScope, boolean> = { blobs: false, projects: false, commits: false }

export const useGitLabStore = create<GitLabState>((set, get) => ({
  instances: [],
  activeInstanceId: null,
  isLoaded: false,

  groups: [],
  groupsLoading: false,

  query: '',
  activeScope: 'blobs',
  searchLevel: 'global',
  selectedGroupId: null,
  results: { ...emptyResults },
  counts: { ...emptyCounts },
  currentPage: { ...defaultPage },
  hasMore: { ...defaultHasMore },
  loading: false,
  searchError: null,

  preview: null,
  previewLoading: false,

  showSetup: false,

  // ===== Instance actions =====

  loadInstances: async () => {
    if (!window.api) { set({ isLoaded: true }); return }
    const instances = await window.api.gitlabGetInstances()
    const settings = await window.api.gitlabGetSettings()
    set({
      instances: instances || [],
      activeInstanceId: settings?.lastActiveInstanceId || (instances?.[0]?.id ?? null),
      isLoaded: true,
      showSetup: !instances || instances.length === 0
    })
  },

  setActiveInstance: (id) => {
    set({ activeInstanceId: id })
    // Clear results when switching instance
    set({
      results: { ...emptyResults },
      counts: { ...emptyCounts },
      currentPage: { ...defaultPage },
      hasMore: { ...defaultHasMore },
      groups: [],
      selectedGroupId: null,
      searchLevel: 'global',
      preview: null
    })
    if (window.api) {
      window.api.gitlabUpdateSettings({
        lastActiveInstanceId: id,
        lastScope: get().activeScope
      })
    }
    // Auto-load groups for the new instance
    if (id) get().loadGroups()
  },

  addInstance: async (data) => {
    if (!window.api) throw new Error('API not available')
    const instance = await window.api.gitlabAddInstance(data)
    set((state) => ({
      instances: [...state.instances, instance],
      activeInstanceId: instance.id,
      showSetup: false
    }))
    // Load groups for the new instance
    get().loadGroups()
    return instance
  },

  removeInstance: async (id) => {
    if (!window.api) return
    await window.api.gitlabRemoveInstance(id)
    set((state) => {
      const instances = state.instances.filter((i) => i.id !== id)
      const newActiveId = state.activeInstanceId === id
        ? (instances[0]?.id ?? null)
        : state.activeInstanceId
      return {
        instances,
        activeInstanceId: newActiveId,
        showSetup: instances.length === 0,
        results: { ...emptyResults },
        counts: { ...emptyCounts },
        preview: null
      }
    })
  },

  // ===== Groups =====

  loadGroups: async () => {
    const { activeInstanceId } = get()
    if (!activeInstanceId || !window.api) return
    set({ groupsLoading: true })
    try {
      const groups = await window.api.gitlabGetGroups(activeInstanceId)
      set({ groups: groups || [], groupsLoading: false })
    } catch {
      set({ groups: [], groupsLoading: false })
    }
  },

  setSearchLevel: (level) => set({ searchLevel: level, selectedGroupId: null }),
  setSelectedGroup: (groupId) => set({ selectedGroupId: groupId }),

  // ===== Search =====

  setQuery: (query) => set({ query }),
  setActiveScope: (scope) => set({ activeScope: scope }),

  search: async () => {
    const { activeInstanceId, query, activeScope, searchLevel, selectedGroupId } = get()
    if (!activeInstanceId || !query.trim() || !window.api) return

    set({ loading: true, searchError: null })
    try {
      const res = await window.api.gitlabSearch({
        instanceId: activeInstanceId,
        scope: activeScope,
        query: query.trim(),
        groupId: searchLevel === 'group' ? selectedGroupId ?? undefined : undefined,
        page: 1,
        perPage: 20
      })

      set((state) => ({
        results: { ...state.results, [activeScope]: res.items },
        counts: { ...state.counts, [activeScope]: res.total },
        currentPage: { ...state.currentPage, [activeScope]: 1 },
        hasMore: { ...state.hasMore, [activeScope]: res.hasMore },
        loading: false
      }))
    } catch (err: any) {
      set({ loading: false, searchError: err.message || 'Search failed' })
    }
  },

  searchAllScopes: async () => {
    const { activeInstanceId, query, searchLevel, selectedGroupId } = get()
    if (!activeInstanceId || !query.trim() || !window.api) return

    set({
      loading: true,
      searchError: null,
      results: { ...emptyResults },
      counts: { ...emptyCounts },
      currentPage: { ...defaultPage },
      hasMore: { ...defaultHasMore },
      preview: null
    })

    const scopes: SearchScope[] = ['blobs', 'projects', 'commits']
    const groupId = searchLevel === 'group' ? selectedGroupId ?? undefined : undefined

    try {
      const responses = await Promise.allSettled(
        scopes.map((scope) =>
          window.api.gitlabSearch({
            instanceId: activeInstanceId,
            scope,
            query: query.trim(),
            groupId,
            page: 1,
            perPage: 20
          })
        )
      )

      const newResults: SearchResults = { ...emptyResults }
      const newCounts: SearchCounts = { ...emptyCounts }
      const newHasMore: Record<SearchScope, boolean> = { ...defaultHasMore }
      const errors: string[] = []

      for (let i = 0; i < scopes.length; i++) {
        const res = responses[i]
        if (res.status === 'fulfilled') {
          (newResults as any)[scopes[i]] = res.value.items
          ;(newCounts as any)[scopes[i]] = res.value.total
          ;(newHasMore as any)[scopes[i]] = res.value.hasMore
        } else {
          // Collect error from rejected promise
          const errMsg = res.reason?.message || String(res.reason)
          errors.push(`${scopes[i]}: ${errMsg}`)
          console.error(`[GitLab] Search ${scopes[i]} failed:`, res.reason)
        }
      }

      // Auto-select the scope with the most results
      let bestScope: SearchScope = 'blobs'
      let bestCount = newCounts.blobs
      if (newCounts.projects > bestCount) { bestScope = 'projects'; bestCount = newCounts.projects }
      if (newCounts.commits > bestCount) { bestScope = 'commits' }

      set({
        results: newResults,
        counts: newCounts,
        hasMore: newHasMore,
        activeScope: bestCount > 0 ? bestScope : get().activeScope,
        loading: false,
        // Show error if ALL scopes failed, or partial warning if some failed
        searchError: errors.length === scopes.length
          ? errors[0]  // all failed, show first error
          : errors.length > 0
            ? `Some scopes failed: ${errors.join('; ')}`
            : null
      })
    } catch (err: any) {
      set({ loading: false, searchError: err.message || 'Search failed' })
    }
  },

  loadMore: async () => {
    const { activeInstanceId, query, activeScope, searchLevel, selectedGroupId, currentPage, results, hasMore } = get()
    if (!activeInstanceId || !query.trim() || !window.api || !hasMore[activeScope]) return

    const nextPage = currentPage[activeScope] + 1
    set({ loading: true })
    try {
      const res = await window.api.gitlabSearch({
        instanceId: activeInstanceId,
        scope: activeScope,
        query: query.trim(),
        groupId: searchLevel === 'group' ? selectedGroupId ?? undefined : undefined,
        page: nextPage,
        perPage: 20
      })

      set((state) => ({
        results: {
          ...state.results,
          [activeScope]: [...(state.results as any)[activeScope], ...res.items]
        },
        currentPage: { ...state.currentPage, [activeScope]: nextPage },
        hasMore: { ...state.hasMore, [activeScope]: res.hasMore },
        loading: false
      }))
    } catch (err: any) {
      set({ loading: false, searchError: err.message })
    }
  },

  clearResults: () => set({
    results: { ...emptyResults },
    counts: { ...emptyCounts },
    currentPage: { ...defaultPage },
    hasMore: { ...defaultHasMore },
    searchError: null,
    preview: null
  }),

  // ===== Preview =====

  openPreview: async (data) => {
    set({ previewLoading: true })
    try {
      const content = await window.api.gitlabGetFileContent({
        instanceId: data.instanceId,
        projectId: data.projectId,
        filePath: data.filePath,
        ref: data.ref
      })
      set({
        preview: {
          content,
          filePath: data.filePath,
          ref: data.ref,
          startLine: data.startLine,
          projectId: data.projectId,
          projectPath: data.projectPath,
          instanceId: data.instanceId
        },
        previewLoading: false
      })
    } catch {
      set({ previewLoading: false })
    }
  },

  closePreview: () => set({ preview: null }),

  setShowSetup: (show) => set({ showSetup: show })
}))
