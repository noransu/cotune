import { useEffect } from 'react'
import { useWorkspaceStore } from '../../stores/workspace.store'

export default function ProjectPanel() {
  const {
    workspaces,
    activeWorkspaceId,
    isLoaded,
    loadWorkspaces,
    setActiveWorkspace,
    addWorkspace,
    deleteWorkspace
  } = useWorkspaceStore()

  useEffect(() => {
    if (!isLoaded) loadWorkspaces()
  }, [isLoaded, loadWorkspaces])

  const handleAddWorkspace = async () => {
    if (!window.api) return
    const dir = await window.api.projectSelectDirectory()
    if (!dir) return

    // Check for duplicate
    if (workspaces.some((w) => w.path === dir)) return

    const name = dir.split('/').pop() || dir
    const ws = {
      id: `ws-${Date.now()}`,
      name,
      path: dir
    }
    await addWorkspace(ws)
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await deleteWorkspace(id)
  }

  return (
    <div className="h-full flex flex-col bg-panel dark:bg-panel-dark">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border dark:border-border-dark">
        <h2 className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
          Projects
        </h2>
        <button
          onClick={handleAddWorkspace}
          className="w-5 h-5 flex items-center justify-center rounded text-xs hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
          title="Add project directory"
        >
          +
        </button>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {workspaces.length === 0 && (
          <div className="text-center py-8 text-xs text-gray-400 dark:text-gray-500">
            <FolderIcon />
            <p className="mt-2 mb-1">No projects yet</p>
            <p className="text-[10px]">Click + to add a project directory</p>
          </div>
        )}

        {workspaces.map((ws) => {
          const isActive = activeWorkspaceId === ws.id

          return (
            <div
              key={ws.id}
              onClick={() => setActiveWorkspace(ws.id)}
              className={`relative group cursor-pointer rounded-lg border transition-colors px-3 py-2.5 ${
                isActive
                  ? 'border-accent/40 bg-accent/6 dark:bg-accent/10 shadow-sm shadow-accent/5'
                  : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50'
              }`}
            >
              {/* Active indicator bar */}
              {isActive && (
                <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-accent" />
              )}

              <div className="flex items-center gap-2">
                <FolderSmallIcon active={isActive} />
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-medium truncate ${
                    isActive ? 'text-accent' : 'text-gray-800 dark:text-gray-200'
                  }`}>
                    {ws.name}
                  </div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500 font-mono truncate mt-0.5">
                    {ws.path.replace(/^\/Users\/\w+/, '~')}
                  </div>
                </div>

                {/* Delete button */}
                <button
                  onClick={(e) => handleDelete(e, ws.id)}
                  className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove project"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-border dark:border-border-dark">
        <button
          onClick={handleAddWorkspace}
          className="w-full py-1.5 text-xs rounded border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-accent hover:text-accent transition-colors"
        >
          + Add Project Directory
        </button>
      </div>
    </div>
  )
}

// --- Icons ---

function FolderIcon() {
  return (
    <div className="flex justify-center">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-gray-300 dark:text-gray-600">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    </div>
  )
}

function FolderSmallIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={`shrink-0 ${active ? 'text-accent' : 'text-gray-400 dark:text-gray-500'}`}
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}
