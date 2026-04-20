import { useEffect, useRef, useState, useCallback } from 'react'
import { useProjectStore } from '../../stores/project.store'
import XTerminal from '../Terminal/XTerminal'

interface ProcessLog {
  processKey: string
  label: string
  lines: string[]
}

interface ShellTab {
  id: string
  label: string
}

let shellCounter = 0

interface TerminalPanelProps {
  onActivePtyIdChange?: (ptyId: string) => void
}

export default function TerminalPanel({ onActivePtyIdChange }: TerminalPanelProps) {
  const { activeProjectId, projects } = useProjectStore()
  const [isReady, setIsReady] = useState(false)
  const [shellTabs, setShellTabs] = useState<ShellTab[]>(() => {
    const id = `shell-${++shellCounter}`
    return [{ id, label: 'Shell' }]
  })
  const [activeTab, setActiveTab] = useState<string>(() => `shell-${shellCounter}`)
  const [processLogs, setProcessLogs] = useState<Map<string, ProcessLog>>(new Map())
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 100)
    return () => clearTimeout(timer)
  }, [])

  // Listen for process output from "Start All"
  useEffect(() => {
    if (!window.api) return

    const disposeOutput = window.api.onProcessOutput(({ processKey, type, data }: { processKey: string; type: string; data: string }) => {
      setProcessLogs((prev) => {
        const next = new Map(prev)
        const existing = next.get(processKey) || {
          processKey,
          label: processKey,
          lines: []
        }
        // Split data into lines and append
        const newLines = data.split('\n')
        existing.lines = [...existing.lines.slice(-500), ...newLines] // keep last 500 lines
        next.set(processKey, existing)
        return next
      })
    })

    const disposeStatus = window.api.onProcessStatus(({ processKey, status, exitCode, error }: { processKey: string; status: string; exitCode?: number; error?: string }) => {
      if (status === 'stopped' && !error && exitCode === undefined) {
        // Process was stopped (e.g. by Stop All) — remove its log tab
        setProcessLogs((prev) => {
          const next = new Map(prev)
          next.delete(processKey)
          return next
        })
        // If this tab was active, switch back to first shell
        setActiveTab((current) => {
          if (current === processKey) {
            return shellTabs[0]?.id || current
          }
          return current
        })
        return
      }

      setProcessLogs((prev) => {
        const next = new Map(prev)
        const existing: ProcessLog = next.get(processKey) || { processKey, label: processKey, lines: [] }
        if (status === 'error' || error) {
          existing.lines.push(`[ERROR] ${error || `Process exited with code ${exitCode}`}`)
        } else if (exitCode !== undefined) {
          existing.lines.push(`[Process exited with code ${exitCode}]`)
        }
        next.set(processKey, existing)
        return next
      })
    })

    return () => {
      disposeOutput()
      disposeStatus()
    }
  }, [shellTabs])

  // Auto-scroll log view
  useEffect(() => {
    const isShellTab = shellTabs.some((t) => t.id === activeTab)
    if (!isShellTab) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [processLogs, activeTab, shellTabs])

  // Clear process logs when project stops (triggered by project status change to 'stopped')
  const activeProject = projects.find((p) => p.id === activeProjectId)
  const prevStatusRef = useRef(activeProject?.status)
  useEffect(() => {
    const currentStatus = activeProject?.status
    if (prevStatusRef.current === 'running' && currentStatus === 'stopped') {
      // Project just stopped — clear all process output tabs
      setProcessLogs(new Map())
      // Switch to first shell tab if currently on a process tab
      setActiveTab((current) => {
        const isShellTab = shellTabs.some((t) => t.id === current)
        if (!isShellTab) return shellTabs[0]?.id || current
        return current
      })
    }
    prevStatusRef.current = currentStatus
  }, [activeProject?.status, shellTabs])

  const terminalPath = activeProject?.frontend?.path || activeProject?.backends?.[0]?.path || undefined
  const terminalId = activeProjectId || 'default'

  // Notify parent of the active PTY ID when active shell tab changes
  useEffect(() => {
    const shellTab = shellTabs.find((t) => t.id === activeTab)
    if (shellTab && onActivePtyIdChange) {
      onActivePtyIdChange(`${terminalId}-${shellTab.id}`)
    }
  }, [activeTab, terminalId, shellTabs, onActivePtyIdChange])

  const processTabs = Array.from(processLogs.values())
  const activeLog = processLogs.get(activeTab)
  const isShellTab = shellTabs.some((t) => t.id === activeTab)
  const activeShellTab = shellTabs.find((t) => t.id === activeTab)

  // Add new shell tab
  const handleAddShell = useCallback(() => {
    const id = `shell-${++shellCounter}`
    const num = shellTabs.length + 1
    const newTab: ShellTab = { id, label: `Shell ${num}` }
    setShellTabs((prev) => [...prev, newTab])
    setActiveTab(id)
  }, [shellTabs.length])

  // Close a shell tab
  const handleCloseShell = useCallback(
    (tabId: string) => {
      if (shellTabs.length <= 1) return // don't close last shell

      // Destroy the PTY for this shell
      const ptyId = `${terminalId}-${tabId}`
      window.api?.ptyDestroy({ projectId: ptyId })

      setShellTabs((prev) => prev.filter((t) => t.id !== tabId))

      // If closing the active tab, switch to another shell
      setActiveTab((current) => {
        if (current === tabId) {
          const remaining = shellTabs.filter((t) => t.id !== tabId)
          return remaining[0]?.id || 'shell-1'
        }
        return current
      })
    },
    [shellTabs, terminalId]
  )

  return (
    <div className="h-full flex flex-col bg-[#1e1e2e]">
      {/* Terminal tabs */}
      <div className="flex items-center gap-0.5 px-2 py-1 bg-[#181825] border-b border-[#313244] overflow-x-auto">
        {/* Shell tabs */}
        {shellTabs.map((tab) => (
          <TabBtn
            key={tab.id}
            label={tab.label}
            icon={<TerminalIcon />}
            active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            onClose={shellTabs.length > 1 ? () => handleCloseShell(tab.id) : undefined}
          />
        ))}

        {/* Add shell button */}
        <button
          onClick={handleAddShell}
          className="flex items-center justify-center w-5 h-5 rounded text-gray-500 hover:text-gray-300 hover:bg-[#1e1e2e]/50 transition-colors shrink-0"
          title="New Shell"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        {/* Separator between shell tabs and process tabs */}
        {processTabs.length > 0 && (
          <div className="w-[1px] h-3.5 bg-[#313244] mx-1 shrink-0" />
        )}

        {/* Process output tabs */}
        {processTabs.map((log) => (
          <TabBtn
            key={log.processKey}
            label={formatTabLabel(log.processKey)}
            active={activeTab === log.processKey}
            onClick={() => setActiveTab(log.processKey)}
            hasError={log.lines.some((l) => l.includes('[ERROR]') || l.includes('Exception'))}
          />
        ))}

        {/* Right: project info */}
        <div className="ml-auto flex items-center gap-2">
          {terminalPath && (
            <span className="text-[10px] text-gray-500 font-mono truncate max-w-[180px]">
              {terminalPath.replace(/^\/Users\/\w+/, '~')}
            </span>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {isShellTab && activeShellTab ? (
          // Shell terminal (xterm.js) — each tab gets a unique PTY ID
          isReady && (
            <XTerminal
              key={`${terminalId}-${activeShellTab.id}`}
              projectId={`${terminalId}-${activeShellTab.id}`}
              projectPath={terminalPath}
            />
          )
        ) : activeLog ? (
          // Process log viewer
          <div className="h-full overflow-y-auto p-2 font-mono text-[11px] leading-relaxed">
            {activeLog.lines.map((line, i) => (
              <div
                key={i}
                className={`whitespace-pre-wrap break-all ${
                  line.includes('[ERROR]') || line.includes('Exception') || line.includes('Error')
                    ? 'text-red-400'
                    : line.includes('[WARN]') || line.includes('WARNING')
                      ? 'text-yellow-400'
                      : 'text-gray-300'
                }`}
              >
                {line}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-gray-500">
            No output yet
          </div>
        )}
      </div>
    </div>
  )
}

function TabBtn({
  label,
  icon,
  active,
  onClick,
  onClose,
  hasError
}: {
  label: string
  icon?: React.ReactNode
  active: boolean
  onClick: () => void
  onClose?: () => void
  hasError?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`group/tab flex items-center gap-1 px-2 py-1 text-[11px] rounded transition-colors shrink-0 ${
        active
          ? 'bg-[#1e1e2e] text-gray-200'
          : 'text-gray-500 hover:text-gray-300 hover:bg-[#1e1e2e]/50'
      }`}
    >
      {icon}
      <span>{label}</span>
      {hasError && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
      {onClose && (
        <span
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="ml-0.5 w-3.5 h-3.5 flex items-center justify-center rounded opacity-0 group-hover/tab:opacity-100 hover:bg-[#313244] text-gray-400 hover:text-gray-200 transition-opacity"
        >
          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </span>
      )}
    </button>
  )
}

function formatTabLabel(processKey: string): string {
  // "project-123-be-0" → "BE 1"  /  "project-123-fe" → "FE"
  if (processKey.includes('-fe')) return 'FE Output'
  const beMatch = processKey.match(/-be-(\d+)/)
  if (beMatch) return `BE ${parseInt(beMatch[1]) + 1} Output`
  return processKey.split('-').pop() || processKey
}

function TerminalIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-current">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  )
}
