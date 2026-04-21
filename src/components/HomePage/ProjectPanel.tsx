import { useEffect, useState } from 'react'
import {
  useProjectStore,
  ProjectConfig,
  BackendService
} from '../../stores/project.store'

interface ProjectPanelProps {
  onStartProject?: (projectId: string) => void
  onStopProject?: (projectId: string) => void
  onStartService?: (projectId: string, serviceKey: string) => void
  onStopService?: (projectId: string, serviceKey: string) => void
}

export default function ProjectPanel({
  onStartProject,
  onStopProject,
  onStartService,
  onStopService
}: ProjectPanelProps) {
  const {
    projects,
    activeProjectId,
    isLoaded,
    loadProjects,
    setActiveProject,
    addProject,
    deleteProject,
    updateProject
  } = useProjectStore()

  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoaded) loadProjects()
  }, [isLoaded, loadProjects])

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

  const handleRemoveBackend = async (project: ProjectConfig, index: number) => {
    await updateProject({
      ...project,
      backends: project.backends.filter((_, i) => i !== index)
    })
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

  return (
    <div className="h-full flex flex-col bg-panel dark:bg-panel-dark">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border dark:border-border-dark">
        <h2 className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
          Projects
        </h2>
        <button
          onClick={handleAddProject}
          className="w-5 h-5 flex items-center justify-center rounded text-xs hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
          title="New project"
        >
          +
        </button>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {projects.length === 0 && (
          <div className="text-center py-8 text-xs text-gray-400 dark:text-gray-500">
            <p className="mb-1">No projects yet</p>
            <p className="text-[10px]">Click + to create one</p>
          </div>
        )}

        {projects.map((project) => {
          const isEditing = editingId === project.id
          const isActive = activeProjectId === project.id
          const isRunning = project.status === 'running'
          const hasServices = !!project.frontend || project.backends.length > 0

          return (
            <div
              key={project.id}
              onClick={() => {
                setActiveProject(project.id)
                if (!isEditing) setEditingId(null)
              }}
              className={`relative text-xs group cursor-pointer rounded-lg border transition-colors ${
                isActive
                  ? 'border-accent/40 bg-accent/6 dark:bg-accent/10 shadow-sm shadow-accent/5'
                  : 'border-border dark:border-border-dark hover:border-gray-300 dark:hover:border-gray-600 bg-surface dark:bg-surface-dark'
              }`}
            >
              {/* Active indicator bar */}
              {isActive && (
                <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-accent" />
              )}

              {/* Project header: name + start/stop + menu */}
              <div className="flex items-center gap-1.5 px-3 pl-4 pt-2 pb-1.5">
                <span className={`font-medium truncate flex-1 ${
                  isActive ? 'text-accent' : 'text-gray-800 dark:text-gray-200'
                }`}>
                  {project.name}
                </span>

                {/* Start / Stop button per project */}
                {hasServices && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (isRunning) {
                        onStopProject?.(project.id)
                      } else {
                        onStartProject?.(project.id)
                      }
                    }}
                    className={`shrink-0 w-6 h-5 flex items-center justify-center rounded transition-colors ${
                      isRunning
                        ? 'text-red-400 hover:bg-red-500/15 hover:text-red-500'
                        : 'text-green-500 hover:bg-green-500/15 hover:text-green-600'
                    }`}
                    title={isRunning ? 'Stop project' : 'Start project'}
                  >
                    {isRunning ? <StopIcon /> : <PlayIcon />}
                  </button>
                )}

                <StatusDot status={project.status} />

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditingId(isEditing ? null : project.id)
                  }}
                  className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <DotsIcon />
                </button>
              </div>

              {/* Service cards */}
              <div className="px-3 pl-4 pr-2 pb-2 space-y-1.5">
                {/* Frontend card */}
                {project.frontend ? (
                  <ServiceCard
                    type="frontend"
                    label="FE"
                    name={bn(project.frontend.path)}
                    port={project.frontend.port}
                    status={project.frontend.serviceStatus}
                    color="blue"
                    onStart={() => onStartService?.(project.id, 'frontend')}
                    onStop={() => onStopService?.(project.id, 'frontend')}
                  />
                ) : !isEditing ? (
                  <AddBtn label="+ Add Frontend" onClick={(e) => { e.stopPropagation(); handleSelectFrontend(project) }} />
                ) : null}

                {/* Backend cards — each as a separate block */}
                {project.backends.map((be, i) => (
                  <ServiceCard
                    key={i}
                    type="backend"
                    label={`BE${project.backends.length > 1 ? i + 1 : ''}`}
                    name={be.name}
                    port={be.port}
                    status={be.serviceStatus}
                    color="green"
                    external={be.external}
                    framework={be.framework}
                    onStart={() => onStartService?.(project.id, `be-${i}`)}
                    onStop={() => onStopService?.(project.id, `be-${i}`)}
                  />
                ))}

                {project.backends.length === 0 && !isEditing && (
                  <AddBtn label="+ Add Backend" onClick={(e) => { e.stopPropagation(); handleAddBackend(project) }} />
                )}
              </div>

              {/* Expanded editing panel */}
              {isEditing && (
                <EditPanel
                  project={project}
                  onUpdate={updateProject}
                  onSelectFrontend={() => handleSelectFrontend(project)}
                  onAddBackend={() => handleAddBackend(project)}
                  onRemoveBackend={(i) => handleRemoveBackend(project, i)}
                  onUpdateBackend={(i, p) => handleUpdateBackend(project, i, p)}
                  onDelete={() => {
                    deleteProject(project.id)
                    setEditingId(null)
                  }}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-border dark:border-border-dark">
        <button
          onClick={handleAddProject}
          className="w-full py-1.5 text-xs rounded border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-accent hover:text-accent transition-colors"
        >
          + New Project Group
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// Service card — a distinct block for each FE / BE entry
// ============================================================================

function ServiceCard({
  type,
  label,
  name,
  port,
  status,
  color,
  external,
  framework,
  onStart,
  onStop
}: {
  type: 'frontend' | 'backend'
  label: string
  name: string
  port: number
  status?: string
  color: 'blue' | 'green'
  external?: boolean
  framework?: string
  onStart?: () => void
  onStop?: () => void
}) {
  const isRunning = status === 'running'
  const isStarting = status === 'starting'
  const isError = status === 'error'

  const borderColor = color === 'blue'
    ? 'border-blue-500/25 dark:border-blue-400/20'
    : 'border-green-500/25 dark:border-green-400/20'
  const bgColor = color === 'blue'
    ? 'bg-blue-500/5 dark:bg-blue-500/8'
    : 'bg-green-500/5 dark:bg-green-500/8'
  const badgeColor = color === 'blue'
    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
    : 'bg-green-500/15 text-green-600 dark:text-green-400'

  return (
    <div className={`rounded-md border ${borderColor} ${bgColor} px-2.5 py-1.5 transition-colors`}>
      {/* Top row: badge + name + port + status */}
      <div className="flex items-center gap-1.5">
        <span className={`text-[10px] font-mono font-semibold px-1.5 py-px rounded shrink-0 ${badgeColor}`}>
          {label}
        </span>
        <span className="text-[11px] text-gray-700 dark:text-gray-300 truncate flex-1 font-medium">
          {name}
        </span>

        {external && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
            EXT
          </span>
        )}

        <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono shrink-0">
          :{port}
        </span>

        {/* Per-service play/stop */}
        {!external && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              isRunning ? onStop?.() : onStart?.()
            }}
            disabled={isStarting}
            className={`shrink-0 w-4.5 h-4.5 flex items-center justify-center rounded transition-colors ${
              isStarting
                ? 'text-yellow-500 cursor-wait'
                : isRunning
                  ? 'text-red-400 hover:bg-red-500/15'
                  : 'text-gray-400 hover:text-green-500 hover:bg-green-500/15'
            }`}
            title={isRunning ? `Stop ${label}` : `Start ${label}`}
          >
            {isStarting ? <SpinnerIcon /> : isRunning ? <StopSmallIcon /> : <PlaySmallIcon />}
          </button>
        )}

        {/* Status indicator */}
        <ServiceStatusDot status={status} />
      </div>

      {/* Bottom: framework tag (if backend) */}
      {framework && (
        <div className="mt-1 flex items-center gap-1">
          <span className="text-[9px] text-gray-400 dark:text-gray-500 font-mono">
            {framework}
          </span>
          {isError && (
            <span className="text-[9px] text-red-400">error</span>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Edit panel
// ============================================================================

function EditPanel({
  project,
  onUpdate,
  onSelectFrontend,
  onAddBackend,
  onRemoveBackend,
  onUpdateBackend,
  onDelete
}: {
  project: ProjectConfig
  onUpdate: (p: ProjectConfig) => void
  onSelectFrontend: () => void
  onAddBackend: () => void
  onRemoveBackend: (i: number) => void
  onUpdateBackend: (i: number, p: Partial<BackendService>) => void
  onDelete: () => void
}) {
  return (
    <div
      className="mx-2 mb-2 p-2.5 space-y-2 rounded-md border border-border dark:border-border-dark bg-panel dark:bg-panel-dark"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Name */}
      <input
        type="text"
        value={project.name}
        onChange={(e) => onUpdate({ ...project, name: e.target.value })}
        className="w-full px-2 py-1 text-[11px] rounded border border-border dark:border-border-dark bg-panel dark:bg-panel-dark text-gray-800 dark:text-gray-200 focus:outline-none focus:border-accent"
        placeholder="Project name"
      />

      {/* Frontend detail */}
      {project.frontend && (
        <FieldGroup label="Frontend">
          <PathDisplay path={project.frontend.path} />
          <div className="flex gap-1">
            <CmdInput
              value={project.frontend.command}
              onChange={(v) =>
                onUpdate({ ...project, frontend: { ...project.frontend!, command: v } })
              }
            />
            <PortInput
              value={project.frontend.port}
              onChange={(v) =>
                onUpdate({ ...project, frontend: { ...project.frontend!, port: v } })
              }
            />
          </div>
        </FieldGroup>
      )}

      {/* Backend details */}
      {project.backends.map((be, i) => (
        <FieldGroup
          key={i}
          label={`Backend: ${be.name} (${be.framework})`}
          onRemove={() => onRemoveBackend(i)}
        >
          <PathDisplay path={be.path} />
          <div className="flex gap-1">
            <CmdInput value={be.command} onChange={(v) => onUpdateBackend(i, { command: v })} disabled={be.external} />
            <PortInput value={be.port} onChange={(v) => onUpdateBackend(i, { port: v })} />
          </div>
          <div className="flex gap-1">
            <div className="flex-1">
              <div className="text-[9px] text-gray-400 mb-0.5">Context Path</div>
              <input
                type="text"
                value={be.contextPath || ''}
                onChange={(e) => onUpdateBackend(i, { contextPath: e.target.value })}
                placeholder="leave empty if none"
                className="w-full px-2 py-0.5 text-[10px] font-mono rounded border border-border dark:border-border-dark bg-panel dark:bg-panel-dark text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-accent"
              />
            </div>
            <div className="flex-1">
              <div className="text-[9px] text-gray-400 mb-0.5">API Prefix</div>
              <input
                type="text"
                value={be.apiPrefix || ''}
                onChange={(e) => onUpdateBackend(i, { apiPrefix: e.target.value })}
                placeholder="/api/trumpet-user"
                className="w-full px-2 py-0.5 text-[10px] font-mono rounded border border-border dark:border-border-dark bg-panel dark:bg-panel-dark text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-accent"
              />
            </div>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!be.external}
              onChange={(e) => onUpdateBackend(i, { external: e.target.checked })}
              className="w-3 h-3 rounded border-gray-300 dark:border-gray-600 accent-accent"
            />
            <span className="text-[10px] text-gray-500 dark:text-gray-400">
              External (IDEA/IntelliJ)
            </span>
          </label>
        </FieldGroup>
      ))}

      {/* Action buttons */}
      <div className="flex gap-1.5 flex-wrap">
        {!project.frontend && (
          <SmallBtn label="+ Frontend" color="blue" onClick={onSelectFrontend} />
        )}
        <SmallBtn label="+ Backend" color="green" onClick={onAddBackend} />
        <button
          onClick={onDelete}
          className="py-1 px-2 text-[10px] rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          Delete Project
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// Small reusable components
// ============================================================================

function AddBtn({ label, onClick }: { label: string; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button onClick={onClick} className="text-[10px] text-gray-400 hover:text-accent py-0.5">
      {label}
    </button>
  )
}

function SmallBtn({ label, color, onClick }: { label: string; color: 'blue' | 'green'; onClick: () => void }) {
  const c = color === 'blue'
    ? 'border-blue-300 dark:border-blue-700 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'
    : 'border-green-300 dark:border-green-700 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'
  return (
    <button onClick={onClick} className={`flex-1 py-1 text-[10px] rounded border border-dashed ${c}`}>
      {label}
    </button>
  )
}

function FieldGroup({ label, children, onRemove }: { label: string; children: React.ReactNode; onRemove?: () => void }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-gray-500 uppercase">{label}</div>
        {onRemove && (
          <button onClick={onRemove} className="text-[10px] text-red-400 hover:text-red-500">remove</button>
        )}
      </div>
      {children}
    </div>
  )
}

function PathDisplay({ path }: { path: string }) {
  return (
    <div className="text-[10px] font-mono text-gray-400 truncate bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded">
      {path}
    </div>
  )
}

function CmdInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`flex-1 px-2 py-0.5 text-[10px] font-mono rounded border border-border dark:border-border-dark bg-panel dark:bg-panel-dark text-gray-700 dark:text-gray-300 focus:outline-none focus:border-accent ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    />
  )
}

function PortInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value) || 0)}
      className="w-14 px-1 py-0.5 text-[10px] text-center rounded border border-border dark:border-border-dark bg-panel dark:bg-panel-dark text-gray-700 dark:text-gray-300 focus:outline-none focus:border-accent"
    />
  )
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'running' ? 'bg-green-500 shadow-green-500/50 shadow-sm'
      : status === 'error' ? 'bg-red-500 shadow-red-500/50 shadow-sm'
      : 'bg-gray-400 dark:bg-gray-500'
  return <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
}

function ServiceStatusDot({ status }: { status?: string }) {
  if (!status || status === 'stopped') return null
  const color =
    status === 'running' ? 'bg-green-500'
      : status === 'starting' ? 'bg-yellow-500 animate-pulse'
      : status === 'error' ? 'bg-red-500'
      : 'bg-gray-400'
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color}`} />
}

function bn(path: string): string {
  return path.split('/').pop() || path
}

// ============================================================================
// SVG icons
// ============================================================================

function PlayIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  )
}

function PlaySmallIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  )
}

function StopSmallIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" className="animate-spin" fill="none" stroke="currentColor" strokeWidth="3">
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  )
}

function DotsIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
    </svg>
  )
}
