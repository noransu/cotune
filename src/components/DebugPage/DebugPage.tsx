import { useCallback, useEffect, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import {
  useProjectStore,
  ProjectConfig,
  BackendService
} from '../../stores/project.store'
import { useProxyStore, ProxyLogEntry } from '../../stores/proxy.store'

interface DebugPageProps {
  onOpenBrowser?: (url: string) => void
}

export default function DebugPage({ onOpenBrowser }: DebugPageProps) {
  const {
    projects,
    activeProjectId,
    isLoaded,
    loadProjects,
    setActiveProject,
    addProject,
    deleteProject,
    updateProject,
    setProjectStatus,
    setServiceStatus
  } = useProjectStore()

  const { isRunning: proxyRunning, rules, logs, startProxy, stopProxy, parseRoutes, clearLogs } =
    useProxyStore()

  const activeProject = projects.find((p) => p.id === activeProjectId)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [startingStatus, setStartingStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoaded) loadProjects()
  }, [isLoaded, loadProjects])

  // ── Per-service start/stop ─────────────────────────────────────────

  const handleStartService = useCallback(
    async (projectId: string, serviceKey: string) => {
      const project = projects.find((p) => p.id === projectId)
      if (!project || !window.api) return

      try {
        if (serviceKey === 'frontend' && project.frontend) {
          setServiceStatus(projectId, 'frontend', 'starting')
          await window.api.processStart({
            id: `${projectId}-fe`,
            type: 'frontend',
            projectId,
            command: project.frontend.command,
            cwd: project.frontend.path,
            port: project.frontend.port
          })
          setServiceStatus(projectId, 'frontend', 'running')
        }

        const beMatch = serviceKey.match(/^be-(\d+)$/)
        if (beMatch) {
          const idx = parseInt(beMatch[1])
          const be = project.backends[idx]
          if (!be || be.external) return

          setServiceStatus(projectId, serviceKey, 'starting')

          if (be.framework === 'spring-boot') {
            const scanPath = be.modulePath || be.path
            await parseRoutes(scanPath, be.port, {
              contextPath: be.contextPath,
              apiPrefix: be.apiPrefix
            })
          }

          await window.api.processStart({
            id: `${projectId}-be-${idx}`,
            type: 'backend',
            projectId,
            command: be.command,
            cwd: be.path,
            port: be.port
          })
          setServiceStatus(projectId, serviceKey, 'running')
        }

        deriveProjectStatus(projectId)
      } catch {
        setServiceStatus(projectId, serviceKey, 'error')
      }
    },
    [projects, setServiceStatus, parseRoutes]
  )

  const handleStopService = useCallback(
    async (projectId: string, serviceKey: string) => {
      if (!window.api) return
      try {
        if (serviceKey === 'frontend') {
          await window.api.processStop(`${projectId}-fe`)
          setServiceStatus(projectId, 'frontend', 'stopped')
        }
        const beMatch = serviceKey.match(/^be-(\d+)$/)
        if (beMatch) {
          const idx = parseInt(beMatch[1])
          await window.api.processStop(`${projectId}-be-${idx}`)
          setServiceStatus(projectId, serviceKey, 'stopped')
        }
        deriveProjectStatus(projectId)
      } catch {
        // ignore
      }
    },
    [setServiceStatus]
  )

  // ── Per-project start all / stop all ──────────────────────────────

  const handleStartProject = useCallback(
    async (projectId: string) => {
      const project = projects.find((p) => p.id === projectId)
      if (!project || !window.api) return

      try {
        for (let i = 0; i < project.backends.length; i++) {
          const be = project.backends[i]

          if (be.framework === 'spring-boot') {
            setStartingStatus(`Parsing routes: ${be.name}...`)
            const scanPath = be.modulePath || be.path
            await parseRoutes(scanPath, be.port, {
              contextPath: be.contextPath,
              apiPrefix: be.apiPrefix
            })
          }

          if (be.external) continue

          setServiceStatus(projectId, `be-${i}`, 'starting')
          setStartingStatus(`Starting: ${be.name}...`)
          await window.api.processStart({
            id: `${projectId}-be-${i}`,
            type: 'backend',
            projectId,
            command: be.command,
            cwd: be.path,
            port: be.port
          })
          setServiceStatus(projectId, `be-${i}`, 'running')
        }

        if (project.frontend) {
          setServiceStatus(projectId, 'frontend', 'starting')
          setStartingStatus('Starting frontend...')
          await window.api.processStart({
            id: `${projectId}-fe`,
            type: 'frontend',
            projectId,
            command: project.frontend.command,
            cwd: project.frontend.path,
            port: project.frontend.port
          })
          setServiceStatus(projectId, 'frontend', 'running')
        }

        if (project.frontend && project.backends.length > 0) {
          setStartingStatus('Starting proxy...')
          const proxyOk = await startProxy(project.frontend.port, project.backends[0].port)
          if (!proxyOk) {
            setStartingStatus('Proxy failed!')
            setTimeout(() => setStartingStatus(null), 3000)
            setProjectStatus(projectId, 'error')
            return
          }
        }

        setProjectStatus(projectId, 'running')
        setStartingStatus(null)

        if (onOpenBrowser && project.frontend) {
          const port =
            project.backends.length > 0 ? project.proxyPort : project.frontend.port
          setTimeout(() => onOpenBrowser(`http://localhost:${port}`), 1000)
        }
      } catch (err) {
        setStartingStatus(`Error: ${err instanceof Error ? err.message : 'Unknown'}`)
        setTimeout(() => setStartingStatus(null), 3000)
        setProjectStatus(projectId, 'error')
      }
    },
    [projects, setServiceStatus, setProjectStatus, parseRoutes, startProxy, onOpenBrowser]
  )

  const handleStopProject = useCallback(
    async (projectId: string) => {
      const project = projects.find((p) => p.id === projectId)
      if (!project || !window.api) return

      await window.api.processStopAll()
      await stopProxy()

      if (project.frontend) setServiceStatus(projectId, 'frontend', 'stopped')
      for (let i = 0; i < project.backends.length; i++) {
        setServiceStatus(projectId, `be-${i}`, 'stopped')
      }
      setProjectStatus(projectId, 'stopped')
    },
    [projects, setServiceStatus, setProjectStatus, stopProxy]
  )

  const deriveProjectStatus = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId)
    if (!project) return
    const statuses: string[] = []
    if (project.frontend?.serviceStatus) statuses.push(project.frontend.serviceStatus)
    for (const be of project.backends) {
      if (be.serviceStatus) statuses.push(be.serviceStatus)
    }
    if (statuses.some((s) => s === 'running' || s === 'starting')) {
      setProjectStatus(projectId, 'running')
    } else if (statuses.some((s) => s === 'error')) {
      setProjectStatus(projectId, 'error')
    } else {
      setProjectStatus(projectId, 'stopped')
    }
  }

  // ── Add project helpers ────────────────────────────────────────────

  const handleAddProject = async () => {
    if (!window.api) return
    const id = `project-${Date.now()}`
    const newProject: ProjectConfig = {
      id,
      name: 'New Project',
      backends: [],
      proxyPort: 9000,
      status: 'stopped'
    }
    await addProject(newProject)
    setActiveProject(id)
    setEditingId(id)
  }

  const handleSelectFrontend = async (project: ProjectConfig) => {
    if (!window.api) return
    const dir = await window.api.projectSelectDirectory()
    if (!dir) return
    const detected = await window.api.projectDetectFrontend(dir)
    await updateProject({
      ...project,
      name: project.name === 'New Project' ? detected.name : project.name,
      frontend: { path: dir, command: detected.command, port: detected.port }
    })
  }

  const handleAddBackend = async (project: ProjectConfig) => {
    if (!window.api) return
    const dir = await window.api.projectSelectDirectory()
    if (!dir) return

    const entries = await window.api.projectDetectBackendEntries(dir)
    if (!entries || entries.length === 0) {
      const detected = await window.api.projectDetectBackend(dir)
      entries.push(detected)
    }

    const newServices: BackendService[] = entries.map(
      (e: any, i: number) => ({
        name: e.name || `service-${i + 1}`,
        path: dir,
        command: e.command,
        port: e.port,
        framework: e.framework,
        modulePath: e.modulePath || undefined
      })
    )

    const name =
      project.name === 'New Project' && !project.frontend
        ? entries[0]?.name || 'Backend'
        : project.name

    await updateProject({
      ...project,
      name,
      backends: [...project.backends, ...newServices]
    })
  }

  const handleRemoveService = async (
    project: ProjectConfig,
    type: 'frontend' | 'backend',
    index?: number
  ) => {
    if (type === 'frontend') {
      const { frontend: _, ...rest } = project
      await updateProject({ ...rest, frontend: undefined } as ProjectConfig)
    } else if (index !== undefined) {
      await updateProject({
        ...project,
        backends: project.backends.filter((_, i) => i !== index)
      })
    }
  }

  const handleUpdateBackend = async (
    project: ProjectConfig,
    index: number,
    patch: Partial<BackendService>
  ) => {
    const backends = [...project.backends]
    backends[index] = { ...backends[index], ...patch }
    await updateProject({ ...project, backends })
  }

  const isRunning = activeProject?.status === 'running'

  return (
    <div className="h-full flex flex-col bg-surface dark:bg-surface-dark">
      {/* Status bar */}
      {startingStatus && (
        <div className="flex items-center px-4 py-1 bg-panel dark:bg-panel-dark border-b border-border dark:border-border-dark text-[11px] text-gray-500">
          <span className="animate-pulse">{startingStatus}</span>
        </div>
      )}

      <PanelGroup direction="vertical" className="flex-1">
        {/* Top: project cards area */}
        <Panel defaultSize={55} minSize={30}>
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border dark:border-border-dark">
              <h2 className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                Joint Debugging
              </h2>
              <div className="flex items-center gap-2">
                {activeProject && (
                  <button
                    onClick={() =>
                      isRunning
                        ? handleStopProject(activeProject.id)
                        : handleStartProject(activeProject.id)
                    }
                    className={`px-3 py-1 text-[11px] font-medium rounded transition-colors ${
                      isRunning
                        ? 'bg-red-500/15 text-red-500 hover:bg-red-500/25'
                        : 'bg-green-500/15 text-green-500 hover:bg-green-500/25'
                    }`}
                  >
                    {isRunning ? 'Stop All' : 'Start All'}
                  </button>
                )}
                <button
                  onClick={handleAddProject}
                  className="px-3 py-1 text-[11px] rounded border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-accent hover:text-accent transition-colors"
                >
                  + Add Project
                </button>
              </div>
            </div>

            {/* Project selector tabs */}
            {projects.length > 1 && (
              <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border dark:border-border-dark overflow-x-auto">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActiveProject(p.id)}
                    className={`px-2.5 py-1 text-[11px] rounded font-medium transition-colors shrink-0 ${
                      activeProjectId === p.id
                        ? 'bg-accent/15 text-accent'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}

            {/* Horizontal project cards */}
            <div className="flex-1 overflow-y-auto p-4">
              {!activeProject ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center text-xs text-gray-400 dark:text-gray-500">
                    <p className="mb-2">No debug project configured</p>
                    <p className="text-[10px]">Click "Add Project" to get started</p>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {/* Frontend card */}
                  {activeProject.frontend ? (
                    <ServiceCard
                      type="frontend"
                      label="Frontend"
                      name={bn(activeProject.frontend.path)}
                      path={activeProject.frontend.path}
                      command={activeProject.frontend.command}
                      port={activeProject.frontend.port}
                      status={activeProject.frontend.serviceStatus}
                      color="blue"
                      isEditing={editingId === `${activeProject.id}-fe`}
                      onToggleEdit={() =>
                        setEditingId(
                          editingId === `${activeProject.id}-fe`
                            ? null
                            : `${activeProject.id}-fe`
                        )
                      }
                      onStart={() => handleStartService(activeProject.id, 'frontend')}
                      onStop={() => handleStopService(activeProject.id, 'frontend')}
                      onRemove={() => handleRemoveService(activeProject, 'frontend')}
                      onUpdateCommand={(cmd) =>
                        updateProject({
                          ...activeProject,
                          frontend: { ...activeProject.frontend!, command: cmd }
                        })
                      }
                      onUpdatePort={(port) =>
                        updateProject({
                          ...activeProject,
                          frontend: { ...activeProject.frontend!, port }
                        })
                      }
                    />
                  ) : (
                    <AddCard
                      label="+ Add Frontend"
                      color="blue"
                      onClick={() => handleSelectFrontend(activeProject)}
                    />
                  )}

                  {/* Backend cards */}
                  {activeProject.backends.map((be, i) => (
                    <ServiceCard
                      key={i}
                      type="backend"
                      label={`Backend${activeProject.backends.length > 1 ? ` ${i + 1}` : ''}`}
                      name={be.name}
                      path={be.path}
                      command={be.command}
                      port={be.port}
                      status={be.serviceStatus}
                      color="green"
                      external={be.external}
                      framework={be.framework}
                      isEditing={editingId === `${activeProject.id}-be-${i}`}
                      onToggleEdit={() =>
                        setEditingId(
                          editingId === `${activeProject.id}-be-${i}`
                            ? null
                            : `${activeProject.id}-be-${i}`
                        )
                      }
                      onStart={() => handleStartService(activeProject.id, `be-${i}`)}
                      onStop={() => handleStopService(activeProject.id, `be-${i}`)}
                      onRemove={() => handleRemoveService(activeProject, 'backend', i)}
                      onUpdateCommand={(cmd) => handleUpdateBackend(activeProject, i, { command: cmd })}
                      onUpdatePort={(port) => handleUpdateBackend(activeProject, i, { port })}
                      onUpdateContextPath={(v) =>
                        handleUpdateBackend(activeProject, i, { contextPath: v })
                      }
                      onUpdateApiPrefix={(v) =>
                        handleUpdateBackend(activeProject, i, { apiPrefix: v })
                      }
                      onUpdateExternal={(v) =>
                        handleUpdateBackend(activeProject, i, { external: v })
                      }
                    />
                  ))}

                  {/* Add backend button card */}
                  <AddCard
                    label="+ Add Backend"
                    color="green"
                    onClick={() => handleAddBackend(activeProject)}
                  />

                  {/* Delete project */}
                  {activeProject && (
                    <div className="flex items-end pb-2 shrink-0">
                      <button
                        onClick={() => {
                          deleteProject(activeProject.id)
                          setEditingId(null)
                        }}
                        className="text-[10px] text-red-400 hover:text-red-500 whitespace-nowrap"
                      >
                        Delete Project
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="h-[1px] bg-border dark:bg-border-dark hover:bg-accent transition-colors" />

        {/* Bottom: Proxy panel */}
        <Panel defaultSize={45} minSize={20}>
          <ProxyPanel
            isRunning={proxyRunning}
            rules={rules}
            logs={logs}
            onClearLogs={clearLogs}
          />
        </Panel>
      </PanelGroup>
    </div>
  )
}

// ============================================================================
// Service Card
// ============================================================================

function ServiceCard({
  type,
  label,
  name,
  path,
  command,
  port,
  status,
  color,
  external,
  framework,
  isEditing,
  onToggleEdit,
  onStart,
  onStop,
  onRemove,
  onUpdateCommand,
  onUpdatePort,
  onUpdateContextPath,
  onUpdateApiPrefix,
  onUpdateExternal
}: {
  type: 'frontend' | 'backend'
  label: string
  name: string
  path: string
  command: string
  port: number
  status?: string
  color: 'blue' | 'green'
  external?: boolean
  framework?: string
  isEditing: boolean
  onToggleEdit: () => void
  onStart: () => void
  onStop: () => void
  onRemove: () => void
  onUpdateCommand: (cmd: string) => void
  onUpdatePort: (port: number) => void
  onUpdateContextPath?: (v: string) => void
  onUpdateApiPrefix?: (v: string) => void
  onUpdateExternal?: (v: boolean) => void
}) {
  const isRunning = status === 'running'
  const isStarting = status === 'starting'
  const isError = status === 'error'

  const borderColor =
    color === 'blue'
      ? 'border-blue-500/30 dark:border-blue-400/25'
      : 'border-green-500/30 dark:border-green-400/25'
  const headerBg =
    color === 'blue' ? 'bg-blue-500/10 dark:bg-blue-500/15' : 'bg-green-500/10 dark:bg-green-500/15'
  const badgeColor =
    color === 'blue'
      ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
      : 'bg-green-500/20 text-green-600 dark:text-green-400'

  return (
    <div className={`w-[220px] shrink-0 rounded-lg border ${borderColor} bg-surface dark:bg-surface-dark overflow-hidden`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-2 ${headerBg}`}>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badgeColor}`}>
          {label}
        </span>
        <div className="flex items-center gap-1">
          {external && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
              EXT
            </span>
          )}
          <StatusDot status={status} />
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5 space-y-1.5">
        <div className="text-[11px] font-medium text-gray-800 dark:text-gray-200 truncate">
          {name}
        </div>
        <div className="text-[10px] text-gray-400 font-mono truncate">
          {path.replace(/^\/Users\/\w+/, '~')}
        </div>
        <div className="text-[10px] text-gray-500 dark:text-gray-400 font-mono truncate">
          {command}
        </div>
        <div className="text-[10px] text-gray-400 font-mono">:{port}</div>
        {framework && (
          <div className="text-[9px] text-gray-400 font-mono">{framework}</div>
        )}

        {/* Edit form */}
        {isEditing && (
          <div className="pt-1.5 space-y-1.5 border-t border-border/50 dark:border-border-dark/50">
            <div>
              <div className="text-[9px] text-gray-400 mb-0.5">Command</div>
              <input
                type="text"
                value={command}
                onChange={(e) => onUpdateCommand(e.target.value)}
                disabled={external}
                className="w-full px-2 py-0.5 text-[10px] font-mono rounded border border-border dark:border-border-dark bg-panel dark:bg-panel-dark text-gray-700 dark:text-gray-300 focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <div className="text-[9px] text-gray-400 mb-0.5">Port</div>
              <input
                type="number"
                value={port}
                onChange={(e) => onUpdatePort(parseInt(e.target.value) || 0)}
                className="w-full px-2 py-0.5 text-[10px] font-mono rounded border border-border dark:border-border-dark bg-panel dark:bg-panel-dark text-gray-700 dark:text-gray-300 focus:outline-none focus:border-accent"
              />
            </div>
            {type === 'backend' && onUpdateContextPath && (
              <div>
                <div className="text-[9px] text-gray-400 mb-0.5">Context Path</div>
                <input
                  type="text"
                  placeholder="e.g. /trumpet-user"
                  onChange={(e) => onUpdateContextPath(e.target.value)}
                  className="w-full px-2 py-0.5 text-[10px] font-mono rounded border border-border dark:border-border-dark bg-panel dark:bg-panel-dark text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:border-accent"
                />
              </div>
            )}
            {type === 'backend' && onUpdateApiPrefix && (
              <div>
                <div className="text-[9px] text-gray-400 mb-0.5">API Prefix</div>
                <input
                  type="text"
                  placeholder="e.g. /api"
                  onChange={(e) => onUpdateApiPrefix(e.target.value)}
                  className="w-full px-2 py-0.5 text-[10px] font-mono rounded border border-border dark:border-border-dark bg-panel dark:bg-panel-dark text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:border-accent"
                />
              </div>
            )}
            {type === 'backend' && onUpdateExternal && (
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!external}
                  onChange={(e) => onUpdateExternal(e.target.checked)}
                  className="w-3 h-3 rounded border-gray-300 dark:border-gray-600 accent-accent"
                />
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  External (IDEA/IntelliJ)
                </span>
              </label>
            )}
          </div>
        )}
      </div>

      {/* Footer: actions */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border/50 dark:border-border-dark/50">
        {!external ? (
          <button
            onClick={isRunning ? onStop : onStart}
            disabled={isStarting}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-colors ${
              isStarting
                ? 'text-yellow-500 cursor-wait'
                : isRunning
                  ? 'text-red-400 hover:bg-red-500/15'
                  : 'text-green-500 hover:bg-green-500/15'
            }`}
          >
            {isStarting ? (
              <SpinnerIcon />
            ) : isRunning ? (
              <StopIcon />
            ) : (
              <PlayIcon />
            )}
            {isStarting ? 'Starting...' : isRunning ? 'Stop' : 'Start'}
          </button>
        ) : (
          <span className="text-[10px] text-gray-400">External</span>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleEdit}
            className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1"
          >
            {isEditing ? 'Done' : 'Edit'}
          </button>
          <button
            onClick={onRemove}
            className="text-gray-400 hover:text-red-400 p-0.5"
            title="Remove"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {isError && (
        <div className="px-3 py-1 bg-red-500/10 text-[10px] text-red-400">Error</div>
      )}
    </div>
  )
}

// ============================================================================
// Add Card
// ============================================================================

function AddCard({ label, color, onClick }: { label: string; color: 'blue' | 'green'; onClick: () => void }) {
  const borderColor =
    color === 'blue' ? 'border-blue-300 dark:border-blue-700' : 'border-green-300 dark:border-green-700'
  const textColor = color === 'blue' ? 'text-blue-500' : 'text-green-500'
  const hoverBg =
    color === 'blue' ? 'hover:bg-blue-50 dark:hover:bg-blue-900/20' : 'hover:bg-green-50 dark:hover:bg-green-900/20'

  return (
    <button
      onClick={onClick}
      className={`w-[220px] shrink-0 rounded-lg border-2 border-dashed ${borderColor} ${textColor} ${hoverBg} flex items-center justify-center text-xs font-medium min-h-[120px] transition-colors`}
    >
      {label}
    </button>
  )
}

// ============================================================================
// Proxy Panel
// ============================================================================

function ProxyPanel({
  isRunning,
  rules,
  logs,
  onClearLogs
}: {
  isRunning: boolean
  rules: { method: string; pathPattern: string; targetPort: number; enabled: boolean; description?: string }[]
  logs: ProxyLogEntry[]
  onClearLogs: () => void
}) {
  return (
    <div className="h-full flex flex-col bg-panel dark:bg-panel-dark">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border dark:border-border-dark">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
            Proxy
          </h3>
          {isRunning && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-500">
              Running
            </span>
          )}
        </div>
        {logs.length > 0 && (
          <button
            onClick={onClearLogs}
            className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            Clear Logs
          </button>
        )}
      </div>

      {/* Content: rules + logs side by side */}
      <div className="flex-1 flex overflow-hidden">
        {/* Rules */}
        <div className="w-[40%] border-r border-border dark:border-border-dark overflow-y-auto">
          <div className="px-3 py-1.5 text-[10px] text-gray-400 uppercase tracking-wider border-b border-border/50 dark:border-border-dark/50">
            Rules ({rules.filter((r) => r.enabled).length})
          </div>
          <div className="p-2 space-y-1">
            {rules.length === 0 && (
              <div className="text-center py-4 text-[10px] text-gray-400">
                No proxy rules configured
              </div>
            )}
            {rules.map((rule, i) => (
              <div
                key={i}
                className={`px-2 py-1 rounded text-[10px] font-mono ${
                  rule.enabled
                    ? 'text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50'
                    : 'text-gray-400 line-through'
                }`}
              >
                <span className="text-blue-500">{rule.method}</span>{' '}
                <span className="truncate">{rule.pathPattern}</span>
                <span className="text-gray-400"> → :{rule.targetPort}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Logs */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 py-1.5 text-[10px] text-gray-400 uppercase tracking-wider border-b border-border/50 dark:border-border-dark/50">
            Logs ({logs.length})
          </div>
          <div className="p-2 space-y-0.5">
            {logs.length === 0 && (
              <div className="text-center py-4 text-[10px] text-gray-400">
                No proxy logs yet
              </div>
            )}
            {logs.map((log) => (
              <div key={log.id} className="text-[10px] font-mono flex items-center gap-1.5">
                <span className="text-gray-400 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                </span>
                <span className="text-blue-500 shrink-0">{log.method}</span>
                <span className="text-gray-600 dark:text-gray-300 truncate flex-1">
                  {log.path}
                </span>
                {log.statusCode && (
                  <span
                    className={`shrink-0 ${
                      log.statusCode < 400 ? 'text-green-500' : 'text-red-400'
                    }`}
                  >
                    {log.statusCode}
                  </span>
                )}
                {log.duration !== undefined && (
                  <span className="text-gray-400 shrink-0">{log.duration}ms</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Small components & icons
// ============================================================================

function StatusDot({ status }: { status?: string }) {
  if (!status || status === 'stopped') {
    return <span className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500" />
  }
  const color =
    status === 'running'
      ? 'bg-green-500 shadow-green-500/50 shadow-sm'
      : status === 'starting'
        ? 'bg-yellow-500 animate-pulse'
        : status === 'error'
          ? 'bg-red-500 shadow-red-500/50 shadow-sm'
          : 'bg-gray-400'
  return <span className={`w-2 h-2 rounded-full ${color}`} />
}

function PlayIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      className="animate-spin"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
    >
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  )
}

function bn(path: string): string {
  return path.split('/').pop() || path
}
