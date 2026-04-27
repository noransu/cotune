import { useState } from 'react'
import { useGitLabStore } from '../../stores/gitlab.store'

export default function InstanceSelector() {
  const {
    instances,
    activeInstanceId,
    setActiveInstance,
    setShowSetup,
    removeInstance
  } = useGitLabStore()
  const [open, setOpen] = useState(false)

  const activeInstance = instances.find((i) => i.id === activeInstanceId)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-border dark:border-border-dark hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <GitLabSmallIcon />
        <span className="text-zinc-700 dark:text-zinc-300 max-w-[120px] truncate">
          {activeInstance?.name || 'Select Instance'}
        </span>
        <ChevronIcon />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 w-56 rounded-lg border border-border dark:border-border-dark bg-surface dark:bg-surface-dark shadow-lg z-20 py-1">
            {instances.map((inst) => (
              <div
                key={inst.id}
                className={`flex items-center justify-between px-3 py-2 text-xs cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 ${
                  inst.id === activeInstanceId ? 'bg-accent/10 text-accent' : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <div
                  className="flex-1 flex items-center gap-2 min-w-0"
                  onClick={() => { setActiveInstance(inst.id); setOpen(false) }}
                >
                  <span className="truncate font-medium">{inst.name}</span>
                  {inst.username && (
                    <span className="text-[10px] text-zinc-400">@{inst.username}</span>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`Remove "${inst.name}"?`)) {
                      removeInstance(inst.id)
                    }
                  }}
                  className="ml-2 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-zinc-400 hover:text-red-500"
                  title="Remove instance"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            <div className="border-t border-border dark:border-border-dark mt-1 pt-1">
              <button
                onClick={() => { setShowSetup(true); setOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-accent hover:bg-accent/10 rounded"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add Instance
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function GitLabSmallIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-orange-500 shrink-0">
      <path
        d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51a.42.42 0 01.82 0l2.44 7.51h8.06l2.44-7.51a.42.42 0 01.82 0l2.44 7.51 1.22 3.78a.84.84 0 01-.3.94z"
        fill="currentColor"
      />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}
