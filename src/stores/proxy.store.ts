import { create } from 'zustand'

export interface ProxyRule {
  method: string
  pathPattern: string
  targetPort: number
  targetHost: string
  source: 'auto' | 'manual' | 'swagger'
  description?: string
  enabled: boolean
  stripPrefix?: string // prefix to strip from path when forwarding, e.g. "/api"
}

export interface ProxyLogEntry {
  id: string
  timestamp: number
  method: string
  path: string
  matched: boolean
  targetHost: string
  targetPort: number
  statusCode?: number
  duration?: number
}

interface ProxyStore {
  isRunning: boolean
  port: number
  rules: ProxyRule[]
  logs: ProxyLogEntry[]
  maxLogs: number

  setRunning: (running: boolean) => void
  setPort: (port: number) => void
  setRules: (rules: ProxyRule[]) => void
  addRule: (rule: ProxyRule) => void
  removeRule: (index: number) => void
  toggleRule: (index: number) => void
  addLog: (entry: ProxyLogEntry) => void
  clearLogs: () => void

  startProxy: (frontendPort: number, backendPort: number) => Promise<boolean>
  stopProxy: () => Promise<void>
  parseRoutes: (projectPath: string, backendPort: number, opts?: { contextPath?: string; apiPrefix?: string }) => Promise<{ rules: ProxyRule[]; detectedContextPath: string }>
}

export const useProxyStore = create<ProxyStore>((set, get) => {
  // Track the log listener disposer so we don't add duplicates
  let disposeLogListener: (() => void) | null = null

  return {
  isRunning: false,
  port: 9000,
  rules: [],
  logs: [],
  maxLogs: 500,

  setRunning: (running) => set({ isRunning: running }),
  setPort: (port) => set({ port }),
  setRules: (rules) => set({ rules }),

  addRule: (rule) => set((state) => ({ rules: [...state.rules, rule] })),

  removeRule: (index) =>
    set((state) => ({
      rules: state.rules.filter((_, i) => i !== index)
    })),

  toggleRule: (index) =>
    set((state) => ({
      rules: state.rules.map((rule, i) =>
        i === index ? { ...rule, enabled: !rule.enabled } : rule
      )
    })),

  addLog: (entry) =>
    set((state) => {
      const logs = [entry, ...state.logs].slice(0, state.maxLogs)
      return { logs }
    }),

  clearLogs: () => set({ logs: [] }),

  startProxy: async (frontendPort: number, backendPort: number) => {
    const { port, rules } = get()
    const enabledRules = rules
      .filter((r) => r.enabled)
      .map((r) => ({
        method: r.method,
        pathPattern: r.pathPattern,
        targetPort: r.targetPort || backendPort,
        targetHost: r.targetHost || 'localhost',
        source: r.source,
        description: r.description,
        stripPrefix: r.stripPrefix
      }))

    const result = await window.api.proxyStart({
      port,
      frontendPort,
      rules: enabledRules
    })

    if (result.success) {
      set({ isRunning: true })

      // Clean up previous listener before adding a new one
      if (disposeLogListener) {
        disposeLogListener()
      }
      disposeLogListener = window.api.onProxyLog((entry: unknown) => {
        get().addLog(entry as ProxyLogEntry)
      })
    }

    return result.success
  },

  stopProxy: async () => {
    await window.api.proxyStop()
    // Clean up log listener
    if (disposeLogListener) {
      disposeLogListener()
      disposeLogListener = null
    }
    set({ isRunning: false, logs: [] })
  },

  parseRoutes: async (projectPath: string, backendPort: number, opts?: { contextPath?: string; apiPrefix?: string }) => {
    const result = await window.api.proxyParseRoutes(projectPath)
    if (result.success && result.routes) {
      // Only use explicitly configured values; auto-detected contextPath is just a UI hint
      const contextPath = opts?.contextPath ?? ''
      const apiPrefix = opts?.apiPrefix ?? ''

      const newRules: ProxyRule[] = result.routes.map(
        (route: { method: string; path: string; className: string; methodName: string }) => {
          // Build full match pattern: apiPrefix + contextPath + annotationPath
          const fullPattern = normalizePath(apiPrefix + contextPath + '/' + route.path)
          return {
            method: route.method,
            pathPattern: fullPattern,
            targetPort: backendPort,
            targetHost: 'localhost',
            source: 'auto' as const,
            description: `${route.className}.${route.methodName}`,
            enabled: true,
            stripPrefix: apiPrefix || undefined
          }
        }
      )
      set({ rules: newRules })
      return { rules: newRules, detectedContextPath: result.contextPath || '' }
    }
    return { rules: [], detectedContextPath: '' }
  }
  }
})

function normalizePath(path: string): string {
  return '/' + path.split('/').filter((s: string) => s.length > 0).join('/')
}
