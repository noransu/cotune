import { useEffect, useState } from 'react'
import {
  useProjectStore,
  ProjectConfig,
  BackendService
} from '../../stores/project.store'

export default function ProjectPanel() {
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

    // Auto-detect all entry points in this directory
    const entries = await window.api.projectDetectBackendEntries(dir)
    if (!entries || entries.length === 0) {
      // Fallback to single detection
      const detected = await window.api.projectDetectBackend(dir)
      entries.push(detected)
    }

    const newServices: BackendService[] = entries.map(
      (e: any, i: number) => ({
        name: e.name || `service-${i + 1}`,
        path: dir,
        command: e.command,
        port: e.port,
        framework: e.framework
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
        >
          +
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {projects.length === 0 && (
          <div className="text-center py-8 text-xs text-gray-400 dark:text-gray-500">
            <p className="mb-1">No projects yet</p>
            <p className="text-[10px]">Click + to create one</p>
          </div>
        )}

        {projects.map((project) => {
          const isEditing = editingId === project.id
          const isActive = activeProjectId === project.id

          return (
            <div
              key={project.id}
              onClick={() => {
                setActiveProject(project.id)
                if (!isEditing) setEditingId(null)
              }}
              className={`rounded-md transition-colors text-xs group ${
                isActive
                  ? 'bg-accent/10 border border-accent/30'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent'
              }`}
            >
              {/* Header row */}
              <div className="flex items-center justify-between p-2.5 pb-1">
                <span className="font-medium text-gray-800 dark:text-gray-200 truncate">
                  {project.name}
                </span>
                <div className="flex items-center gap-1">
                  <StatusDot status={project.status} />
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingId(isEditing ? null : project.id)
                    }}
                    className="w-4 h-4 flex items-center justify-center rounded text-[10px] text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 opacity-0 group-hover:opacity-100"
                  >
                    {isEditing ? '-' : '...'}
                  </button>
                </div>
              </div>

              {/* Frontend */}
              <div className="px-2.5 pb-1">
                {project.frontend ? (
                  <ServiceRow label="FE" color="blue" name={bn(project.frontend.path)} port={project.frontend.port} />
                ) : (
                  <AddBtn label="+ Add Frontend" onClick={(e) => { e.stopPropagation(); handleSelectFrontend(project) }} />
                )}
              </div>

              {/* Backends */}
              <div className="px-2.5 pb-2 space-y-0.5">
                {project.backends.map((be, i) => (
                  <ServiceRow
                    key={i}
                    label={`BE${project.backends.length > 1 ? i + 1 : ''}`}
                    color="green"
                    name={be.name}
                    port={be.port}
                    external={be.external}
                  />
                ))}
                {project.backends.length === 0 && (
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

// --- Edit panel ---

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
      className="px-2.5 pb-2.5 space-y-2 border-t border-border/50 dark:border-border-dark/50 pt-2 mt-1"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Name */}
      <input
        type="text"
        value={project.name}
        onChange={(e) => onUpdate({ ...project, name: e.target.value })}
        className="w-full px-2 py-1 text-[11px] rounded border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-gray-800 dark:text-gray-200 focus:outline-none focus:border-accent"
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
          {/* Context path & API prefix */}
          <div className="flex gap-1">
            <div className="flex-1">
              <div className="text-[9px] text-gray-400 mb-0.5">Context Path <span className="text-gray-500">(local)</span></div>
              <input
                type="text"
                value={be.contextPath || ''}
                onChange={(e) => onUpdateBackend(i, { contextPath: e.target.value })}
                placeholder="leave empty if none"
                className="w-full px-2 py-0.5 text-[10px] font-mono rounded border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-accent"
              />
            </div>
            <div className="flex-1">
              <div className="text-[9px] text-gray-400 mb-0.5">API Prefix <span className="text-gray-500">(to strip)</span></div>
              <input
                type="text"
                value={be.apiPrefix || ''}
                onChange={(e) => onUpdateBackend(i, { apiPrefix: e.target.value })}
                placeholder="/api/trumpet-user"
                className="w-full px-2 py-0.5 text-[10px] font-mono rounded border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-accent"
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

// --- Tiny components ---

function ServiceRow({ label, color, name, port, external }: { label: string; color: 'blue' | 'green'; name: string; port: number; external?: boolean }) {
  const c = color === 'blue'
    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
    : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
  return (
    <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
      <span className={`text-[10px] font-mono px-1 rounded shrink-0 ${c}`}>{label}</span>
      <span className="truncate">{name}</span>
      {external && (
        <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 shrink-0">
          External
        </span>
      )}
      <span className="text-gray-400 dark:text-gray-500 ml-auto shrink-0">:{port}</span>
    </div>
  )
}

function AddBtn({ label, onClick }: { label: string; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button onClick={onClick} className="text-[10px] text-gray-400 hover:text-accent">
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
      className={`flex-1 px-2 py-0.5 text-[10px] font-mono rounded border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-gray-700 dark:text-gray-300 focus:outline-none focus:border-accent ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    />
  )
}

function PortInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value) || 0)}
      className="w-14 px-1 py-0.5 text-[10px] text-center rounded border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-gray-700 dark:text-gray-300 focus:outline-none focus:border-accent"
    />
  )
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'running' ? 'bg-green-500' : status === 'error' ? 'bg-red-500' : 'bg-gray-400'
  return <span className={`w-2 h-2 rounded-full ${color}`} />
}

function bn(path: string): string {
  return path.split('/').pop() || path
}
